const canvas = document.querySelector("#game-board");
const ctx = canvas.getContext("2d");
const scoreElement = document.querySelector("#score");
const bestScoreElement = document.querySelector("#best-score");
const finalScoreElement = document.querySelector("#final-score");
const statusElement = document.querySelector("#status-text");
const pauseButton = document.querySelector("#pause-button");
const pauseLabel = document.querySelector("#pause-label");
const restartButton = document.querySelector("#restart-button");
const gameOverOverlay = document.querySelector("#game-over");
const startHint = document.querySelector("#start-hint");
const skinButtons = Array.from(document.querySelectorAll("[data-skin]"));

const GRID_SIZE = 18;
const CELL_SIZE = canvas.width / GRID_SIZE;
const START_SPEED = 150;
const MIN_SPEED = 72;

const DIRECTIONS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const KEY_DIRECTIONS = {
  ArrowUp: "up",
  w: "up",
  W: "up",
  ArrowDown: "down",
  s: "down",
  S: "down",
  ArrowLeft: "left",
  a: "left",
  A: "left",
  ArrowRight: "right",
  d: "right",
  D: "right",
};

const SNAKE_SKINS = {
  ember: {
    name: "烈焰",
    bodyStart: "#ffd56f",
    bodyMid: "#ff8740",
    bodyEnd: "#d62f2f",
    edge: "#5a1519",
    glow: "rgba(255, 126, 42, 0.58)",
    aura: "rgba(255, 203, 114, 0.42)",
    spark: "#fff1bd",
    accent: "#ffe6a0",
    effect: "flame",
  },
  storm: {
    name: "雷霆",
    bodyStart: "#9ef4ff",
    bodyMid: "#49b7ff",
    bodyEnd: "#5d55ff",
    edge: "#14235f",
    glow: "rgba(93, 191, 255, 0.62)",
    aura: "rgba(107, 235, 255, 0.38)",
    spark: "#f9ffcf",
    accent: "#d9f9ff",
    effect: "bolt",
  },
  jade: {
    name: "翡翠",
    bodyStart: "#e6ffc0",
    bodyMid: "#89e647",
    bodyEnd: "#1cb67a",
    edge: "#0f4225",
    glow: "rgba(65, 229, 138, 0.55)",
    aura: "rgba(182, 255, 136, 0.36)",
    spark: "#f9ffd7",
    accent: "#e4ff9f",
    effect: "mist",
  },
  cosmic: {
    name: "虹彩",
    bodyStart: "#fff56f",
    bodyMid: "#ff4fd8",
    bodyEnd: "#3c6bff",
    edge: "#231546",
    glow: "rgba(111, 168, 255, 0.78)",
    aura: "rgba(255, 255, 255, 0.18)",
    spark: "#fffde2",
    accent: "#ffffff",
    effect: "prism",
  },
};

let snake;
let food;
let direction;
let nextDirection;
let score;
let bestScore = Number(localStorage.getItem("snakeBestScore") || 0);
let snakeSkin = localStorage.getItem("snakeSkin") || "cosmic";
let timer;
let gameState;
let moveFromSnake = [];
let moveToSnake = [];
let moveStartAt = 0;
let moveDuration = START_SPEED;
let pausedProgress = 0;

function roundedRect(x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getSkin() {
  return SNAKE_SKINS[snakeSkin] || SNAKE_SKINS.ember;
}

function getGrowthStage() {
  return clamp(Math.floor((snake.length - 1) / 4), 0, 4);
}

function pseudoRandom(value) {
  const x = Math.sin(value) * 43758.5453123;
  return x - Math.floor(x);
}

function hexToRgba(hex, alpha) {
  const normalized = hex.replace("#", "");
  const full = normalized.length === 3 ? normalized.replace(/(.)/g, "$1$1") : normalized;
  const int = Number.parseInt(full, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function cloneCell(cell) {
  return { x: cell.x, y: cell.y };
}

function cloneSnakeState(state) {
  return state.map(cloneCell);
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function easeInOut(amount) {
  return amount < 0.5
    ? 2 * amount * amount
    : 1 - Math.pow(-2 * amount + 2, 2) / 2;
}

function normalizeVector(vector) {
  const length = Math.hypot(vector.x, vector.y) || 1;
  return { x: vector.x / length, y: vector.y / length };
}

function getMoveProgress(now = performance.now()) {
  if (gameState === "ready") return 0;
  if (gameState === "paused") return pausedProgress;
  if (gameState === "over") return 1;
  if (!moveStartAt || !moveDuration) return 1;
  return clamp((now - moveStartAt) / moveDuration, 0, 1);
}

function getInterpolatedSnake(now = performance.now()) {
  const progress = easeInOut(getMoveProgress(now));
  const sourceSnake = moveFromSnake.length ? moveFromSnake : snake;
  const targetSnake = moveToSnake.length ? moveToSnake : snake;
  const maxLength = Math.max(sourceSnake.length, targetSnake.length);
  const points = [];

  for (let index = 0; index < maxLength; index += 1) {
    const fromCell =
      sourceSnake[index] || sourceSnake[sourceSnake.length - 1] || targetSnake[targetSnake.length - 1];
    const toCell = targetSnake[index] || targetSnake[targetSnake.length - 1] || sourceSnake[sourceSnake.length - 1];
    points.push({
      x: lerp(fromCell.x, toCell.x, progress) * CELL_SIZE + CELL_SIZE / 2,
      y: lerp(fromCell.y, toCell.y, progress) * CELL_SIZE + CELL_SIZE / 2,
    });
  }

  return points;
}

function samplePath(points, amount) {
  if (points.length === 1) {
    return { point: points[0], tangent: { x: 1, y: 0 } };
  }

  const position = amount * (points.length - 1);
  const index = Math.min(points.length - 2, Math.max(0, Math.floor(position)));
  const localT = position - index;
  const start = points[index];
  const end = points[index + 1];
  const point = {
    x: lerp(start.x, end.x, localT),
    y: lerp(start.y, end.y, localT),
  };
  return { point, tangent: normalizeVector({ x: end.x - start.x, y: end.y - start.y }) };
}

function updateSkinButtons() {
  const canChange = gameState === "ready" || gameState === "over";
  skinButtons.forEach((button) => {
    const active = button.dataset.skin === snakeSkin;
    button.setAttribute("aria-pressed", active ? "true" : "false");
    button.disabled = !canChange;
  });
}

function setSkin(nextSkin) {
  if (!(nextSkin in SNAKE_SKINS)) return;
  if (gameState === "playing" || gameState === "paused") return;
  snakeSkin = nextSkin;
  localStorage.setItem("snakeSkin", snakeSkin);
  updateSkinButtons();
  render();
}

function drawBoard() {
  const boardGradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  boardGradient.addColorStop(0, "#050916");
  boardGradient.addColorStop(0.55, "#07162a");
  boardGradient.addColorStop(1, "#0a1f45");
  ctx.fillStyle = boardGradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.35;
  const centerGlow = ctx.createRadialGradient(
    canvas.width * 0.5,
    canvas.height * 0.42,
    20,
    canvas.width * 0.5,
    canvas.height * 0.42,
    canvas.width * 0.5
  );
  centerGlow.addColorStop(0, "rgba(115, 65, 255, 0.24)");
  centerGlow.addColorStop(0.45, "rgba(12, 173, 255, 0.09)");
  centerGlow.addColorStop(1, "rgba(12, 173, 255, 0)");
  ctx.fillStyle = centerGlow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  const hexRadius = 24;
  const hexWidth = Math.sqrt(3) * hexRadius;
  const rowHeight = hexRadius * 1.5;
  ctx.save();
  ctx.strokeStyle = "rgba(62, 97, 174, 0.2)";
  ctx.lineWidth = 1;
  for (let row = -1; row < canvas.height / rowHeight + 2; row += 1) {
    const y = row * rowHeight + 10;
    const offsetX = row % 2 === 0 ? 0 : hexWidth / 2;
    for (let col = -1; col < canvas.width / hexWidth + 2; col += 1) {
      const x = col * hexWidth + offsetX + 8;
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const angle = (Math.PI / 3) * i + Math.PI / 6;
        const px = x + Math.cos(angle) * hexRadius;
        const py = y + Math.sin(angle) * hexRadius;
        if (i === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.closePath();
      ctx.stroke();
    }
  }
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = "rgba(88, 148, 255, 0.06)";
  ctx.beginPath();
  ctx.arc(canvas.width * 0.82, canvas.height * 0.18, 90, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
  ctx.beginPath();
  ctx.arc(canvas.width * 0.18, canvas.height * 0.72, 70, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

const FRUIT_TYPES = [
  { id: "bolt", label: "闪电", colorA: "#fff57a", colorB: "#ffb31f", icon: "bolt" },
  { id: "star", label: "星芒", colorA: "#fff2ae", colorB: "#ff7ab6", icon: "star" },
  { id: "gem", label: "晶石", colorA: "#ccfbff", colorB: "#4db4ff", icon: "gem" },
  { id: "shield", label: "护盾", colorA: "#d8f8ff", colorB: "#6f7bff", icon: "shield" },
  { id: "cherry", label: "果实", colorA: "#ffdc7a", colorB: "#ff5757", icon: "cherry" },
  { id: "leaf", label: "叶片", colorA: "#e7ff9c", colorB: "#38d97a", icon: "leaf" },
];

function pickFruitType() {
  return FRUIT_TYPES[Math.floor(Math.random() * FRUIT_TYPES.length)];
}

function drawFood(now = performance.now()) {
  const centerX = food.x * CELL_SIZE + CELL_SIZE / 2;
  const centerY = food.y * CELL_SIZE + CELL_SIZE / 2;
  const radius = CELL_SIZE * 0.34;
  const pulse = 0.5 + Math.sin(now * 0.008) * 0.2;
  const variant = food.type || FRUIT_TYPES[0];

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.shadowColor = hexToRgba(variant.colorB, 0.75);
  ctx.shadowBlur = 18;
  const orb = ctx.createRadialGradient(
    centerX - radius * 0.35,
    centerY - radius * 0.42,
    1,
    centerX,
    centerY,
    radius * 1.3
  );
  orb.addColorStop(0, hexToRgba(variant.colorA, 0.98));
  orb.addColorStop(0.45, hexToRgba(variant.colorB, 0.88));
  orb.addColorStop(1, hexToRgba(variant.colorB, 0.25));
  ctx.fillStyle = orb;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.fillStyle = "rgba(9, 14, 28, 0.95)";
  ctx.beginPath();
  ctx.arc(centerX + 2, centerY + 4, radius * 0.72, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.shadowColor = hexToRgba(variant.colorA, 0.9);
  ctx.shadowBlur = 12 + pulse * 10;
  ctx.fillStyle = hexToRgba(variant.colorA, 0.95);
  drawFruitIcon(variant.icon, centerX, centerY, radius * 0.72, now);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = hexToRgba(variant.colorA, 0.25);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius + 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawFruitIcon(kind, x, y, size, now) {
  const flicker = Math.sin(now * 0.0075) * 0.08;
  const s = size * (0.9 + flicker);
  ctx.save();
  ctx.translate(x, y);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(2.5, size * 0.12);

  switch (kind) {
    case "bolt":
      ctx.strokeStyle = "#fffbe0";
      ctx.beginPath();
      ctx.moveTo(-s * 0.12, -s * 0.5);
      ctx.lineTo(s * 0.1, -s * 0.05);
      ctx.lineTo(-s * 0.03, -s * 0.05);
      ctx.lineTo(s * 0.18, s * 0.5);
      ctx.lineTo(-s * 0.08, s * 0.08);
      ctx.lineTo(s * 0.02, s * 0.08);
      ctx.closePath();
      ctx.fill();
      break;
    case "star":
      ctx.strokeStyle = "#fff0a7";
      ctx.fillStyle = "#ffd53d";
      ctx.beginPath();
      for (let i = 0; i < 5; i += 1) {
        const outerAngle = -Math.PI / 2 + (Math.PI * 2 * i) / 5;
        const innerAngle = outerAngle + Math.PI / 5;
        const outerX = Math.cos(outerAngle) * s * 0.52;
        const outerY = Math.sin(outerAngle) * s * 0.52;
        const innerX = Math.cos(innerAngle) * s * 0.22;
        const innerY = Math.sin(innerAngle) * s * 0.22;
        if (i === 0) {
          ctx.moveTo(outerX, outerY);
        } else {
          ctx.lineTo(outerX, outerY);
        }
        ctx.lineTo(innerX, innerY);
      }
      ctx.closePath();
      ctx.fill();
      break;
    case "gem":
      ctx.strokeStyle = "#ecffff";
      ctx.fillStyle = "#8be6ff";
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.55);
      ctx.lineTo(s * 0.42, -s * 0.1);
      ctx.lineTo(s * 0.2, s * 0.54);
      ctx.lineTo(-s * 0.2, s * 0.54);
      ctx.lineTo(-s * 0.42, -s * 0.1);
      ctx.closePath();
      ctx.fill();
      break;
    case "shield":
      ctx.fillStyle = "#93f0ff";
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.58);
      ctx.quadraticCurveTo(s * 0.42, -s * 0.46, s * 0.4, -s * 0.02);
      ctx.quadraticCurveTo(s * 0.34, s * 0.5, 0, s * 0.58);
      ctx.quadraticCurveTo(-s * 0.34, s * 0.5, -s * 0.4, -s * 0.02);
      ctx.quadraticCurveTo(-s * 0.42, -s * 0.46, 0, -s * 0.58);
      ctx.closePath();
      ctx.fill();
      break;
    case "leaf":
      ctx.fillStyle = "#d6ff9b";
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.54);
      ctx.quadraticCurveTo(s * 0.5, -s * 0.2, s * 0.08, s * 0.54);
      ctx.quadraticCurveTo(-s * 0.44, s * 0.3, 0, -s * 0.54);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#5deb7a";
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.46);
      ctx.quadraticCurveTo(s * 0.08, -s * 0.02, -s * 0.02, s * 0.42);
      ctx.stroke();
      break;
    case "cherry":
    default:
      ctx.fillStyle = "#ff6363";
      ctx.beginPath();
      ctx.arc(-s * 0.14, s * 0.08, s * 0.18, 0, Math.PI * 2);
      ctx.arc(s * 0.14, s * 0.08, s * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#e6ff9d";
      ctx.lineWidth = Math.max(2, size * 0.08);
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.5);
      ctx.quadraticCurveTo(-s * 0.16, -s * 0.2, -s * 0.12, 0);
      ctx.quadraticCurveTo(s * 0.04, -s * 0.05, s * 0.18, -s * 0.02);
      ctx.stroke();
      break;
  }

  ctx.restore();
}

function drawSnake(now = performance.now()) {
  const skin = getSkin();
  const stage = getGrowthStage();
  const points = getInterpolatedSnake(now);
  if (!points.length) return;

  const waveStrength = CELL_SIZE * (0.065 + stage * 0.016);
  const twistSpeed = 0.0042 + stage * 0.00055;
  const wavyPoints = points.map((point, index) => {
    const prev = points[index - 1] || point;
    const next = points[index + 1] || point;
    const tangent = normalizeVector({ x: next.x - prev.x, y: next.y - prev.y });
    const normal = { x: -tangent.y, y: tangent.x };
    const life = points.length <= 1 ? 0 : index / (points.length - 1);
    const swing = Math.sin(now * twistSpeed + index * 0.78) * waveStrength * (0.5 + life * 0.85);
    const recoil = Math.sin(now * twistSpeed * 0.55 + index * 1.6) * waveStrength * 0.22;
    return {
      x: point.x + normal.x * swing + tangent.x * recoil,
      y: point.y + normal.y * swing + tangent.y * recoil,
      tangent,
      normal,
      life,
    };
  });

  drawSnakeGlow(wavyPoints, skin, stage, now);
  drawSnakeRibbon(wavyPoints, skin, stage);
  drawSnakeScales(wavyPoints, skin, stage, now);
  drawSnakeHead(wavyPoints, skin, stage, now);
  drawSnakeTail(wavyPoints, skin, stage, now);
  drawSnakeEffects(wavyPoints, skin, stage, now);
}

function drawSnakeGlow(points, skin, stage, now) {
  const width = CELL_SIZE * (0.7 + stage * 0.08);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = skin.glow;
  ctx.shadowBlur = 28 + stage * 8;
  ctx.strokeStyle = skin.aura;
  ctx.lineWidth = width * 1.4;
  drawSmoothBody(points);
  ctx.stroke();
  ctx.restore();
}

function drawSnakeRibbon(points, skin, stage) {
  const width = CELL_SIZE * (0.56 + stage * 0.03);
  const head = points[0];
  const tail = points[points.length - 1];
  const gradient = ctx.createLinearGradient(head.x, head.y, tail.x, tail.y);
  if (skin.effect === "prism") {
    gradient.addColorStop(0, "#fff36a");
    gradient.addColorStop(0.12, "#ffbf1e");
    gradient.addColorStop(0.26, "#ff6a49");
    gradient.addColorStop(0.42, "#ff4ed4");
    gradient.addColorStop(0.58, "#9657ff");
    gradient.addColorStop(0.74, "#49b8ff");
    gradient.addColorStop(0.88, "#44f0a7");
    gradient.addColorStop(1, "#8ffbff");
  } else {
    gradient.addColorStop(0, skin.bodyStart);
    gradient.addColorStop(0.42, skin.bodyMid);
    gradient.addColorStop(1, skin.bodyEnd);
  }

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = skin.glow;
  ctx.shadowBlur = 14 + stage * 5;
  ctx.strokeStyle = "rgba(7, 10, 18, 0.75)";
  ctx.lineWidth = width + 8;
  drawSmoothBody(points);
  ctx.stroke();

  ctx.shadowBlur = 18 + stage * 6;
  ctx.strokeStyle = gradient;
  ctx.lineWidth = width;
  drawSmoothBody(points);
  ctx.stroke();

  ctx.strokeStyle = hexToRgba(skin.accent, 0.7);
  ctx.lineWidth = Math.max(2, width * 0.18);
  ctx.globalAlpha = 0.8;
  drawSmoothBody(points, 0.38);
  ctx.stroke();
  ctx.restore();
}

function drawSnakeScales(points, skin, stage, now) {
  const count = Math.max(4, Math.min(points.length * 2, 12 + stage * 4));
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.shadowColor = skin.glow;
  ctx.shadowBlur = 8;
  for (let i = 1; i < count; i += 1) {
    const sample = samplePath(points, i / count);
    const pulse = 0.5 + Math.sin(now * 0.01 + i) * 0.5;
    const offset = (i % 2 === 0 ? 1 : -1) * CELL_SIZE * (0.09 + stage * 0.012);
    const scaleX = sample.point.x + sample.tangent.y * offset;
    const scaleY = sample.point.y - sample.tangent.x * offset;
    ctx.fillStyle = hexToRgba(skin.accent, 0.16 + pulse * 0.22);
    ctx.beginPath();
    ctx.ellipse(
      scaleX,
      scaleY,
      CELL_SIZE * (0.06 + stage * 0.004),
      CELL_SIZE * (0.03 + stage * 0.003),
      Math.atan2(sample.tangent.y, sample.tangent.x),
      0,
      Math.PI * 2
    );
    ctx.fill();
  }
  ctx.restore();
}

function drawSnakeHead(points, skin, stage, now) {
  const head = points[0];
  const next = points[1] || points[0];
  const angle = Math.atan2(head.y - next.y, head.x - next.x);
  const headWidth = CELL_SIZE * (0.42 + stage * 0.015);
  const headHeight = CELL_SIZE * (0.34 + stage * 0.01);
  const pulse = 0.5 + Math.sin(now * 0.008) * 0.2;

  ctx.save();
  ctx.translate(head.x, head.y);
  ctx.rotate(angle);
  ctx.globalCompositeOperation = "lighter";
  ctx.shadowColor = skin.glow;
  ctx.shadowBlur = 20 + stage * 5;

  const halo = ctx.createRadialGradient(0, 0, headHeight * 0.4, 0, 0, headWidth * 1.4);
  halo.addColorStop(0, hexToRgba(skin.bodyStart, 0.35 + pulse * 0.14));
  halo.addColorStop(1, hexToRgba(skin.bodyEnd, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, headWidth * 1.1, 0, Math.PI * 2);
  ctx.fill();

  const headGradient = ctx.createLinearGradient(-headWidth * 0.6, 0, headWidth * 0.7, 0);
  headGradient.addColorStop(0, skin.bodyEnd);
  headGradient.addColorStop(0.45, skin.bodyMid);
  headGradient.addColorStop(1, skin.bodyStart);
  ctx.shadowBlur = 12 + stage * 4;
  ctx.fillStyle = headGradient;
  ctx.beginPath();
  ctx.ellipse(0, 0, headWidth, headHeight, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(12, 16, 24, 0.75)";
  ctx.beginPath();
  ctx.ellipse(-headWidth * 0.18, headHeight * 0.08, headWidth * 0.72, headHeight * 0.72, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = skin.edge;
  ctx.lineWidth = 2.4;
  ctx.stroke();

  ctx.fillStyle = "#0b1016";
  ctx.beginPath();
  ctx.arc(-headWidth * 0.34, -headHeight * 0.16, headWidth * 0.08, 0, Math.PI * 2);
  ctx.arc(-headWidth * 0.34, headHeight * 0.16, headWidth * 0.08, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = skin.accent;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(headWidth * 0.16, 0);
  ctx.quadraticCurveTo(headWidth * 0.3, -headHeight * 0.08, headWidth * 0.42, 0);
  ctx.stroke();

  if (stage >= 2) {
    const tongue = Math.sin(now * 0.014) > 0.4 ? 1 : 0;
    if (tongue) {
      ctx.strokeStyle = "#ff5f7d";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(headWidth * 0.45, 0);
      ctx.quadraticCurveTo(headWidth * 0.8, -headHeight * 0.08, headWidth * 1.05, 0);
      ctx.moveTo(headWidth * 0.95, 0);
      ctx.lineTo(headWidth * 1.12, -headHeight * 0.08);
      ctx.moveTo(headWidth * 0.95, 0);
      ctx.lineTo(headWidth * 1.12, headHeight * 0.08);
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawSnakeTail(points, skin, stage, now) {
  if (points.length < 2) return;
  const tail = points[points.length - 1];
  const prev = points[points.length - 2];
  const angle = Math.atan2(tail.y - prev.y, tail.x - prev.x);
  const tailSize = CELL_SIZE * (0.18 + stage * 0.006);

  ctx.save();
  ctx.translate(tail.x, tail.y);
  ctx.rotate(angle);
  ctx.globalCompositeOperation = "lighter";
  ctx.shadowColor = skin.glow;
  ctx.shadowBlur = 10 + stage * 3;
  const tailGradient = ctx.createLinearGradient(-tailSize * 1.4, 0, tailSize * 0.2, 0);
  tailGradient.addColorStop(0, hexToRgba(skin.bodyEnd, 0));
  tailGradient.addColorStop(1, hexToRgba(skin.bodyEnd, 0.95));
  ctx.fillStyle = tailGradient;
  ctx.beginPath();
  ctx.moveTo(-tailSize * 0.2, 0);
  ctx.quadraticCurveTo(-tailSize * 1.2, -tailSize * 0.44, -tailSize * 1.6, 0);
  ctx.quadraticCurveTo(-tailSize * 1.2, tailSize * 0.44, -tailSize * 0.2, 0);
  ctx.fill();
  ctx.restore();
}

function drawSnakeEffects(points, skin, stage, now) {
  const count = Math.max(4, Math.min(8 + stage * 2, points.length));
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.shadowColor = skin.glow;
  ctx.shadowBlur = 18 + stage * 6;

  for (let i = 0; i < count; i += 1) {
    const sample = samplePath(points, ((now * 0.00018 + i / count) % 1 + 1) % 1);
    const oscillation = Math.sin(now * 0.006 + i * 1.9);
    const drift = sample.tangent.y * oscillation * CELL_SIZE * (0.12 + stage * 0.02);
    const lift = -sample.tangent.x * oscillation * CELL_SIZE * (0.12 + stage * 0.02);
    const x = sample.point.x + drift;
    const y = sample.point.y + lift;

    switch (skin.effect) {
      case "flame":
        ctx.fillStyle = hexToRgba("#ffcc66", 0.72);
        ctx.beginPath();
        ctx.arc(x, y, CELL_SIZE * (0.05 + stage * 0.003), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = hexToRgba("#ff7b38", 0.55);
        ctx.beginPath();
        ctx.arc(x + 4, y - 4, CELL_SIZE * 0.02, 0, Math.PI * 2);
        ctx.fill();
        break;
      case "bolt":
        ctx.strokeStyle = hexToRgba("#f7ffff", 0.9);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - 8, y - 5);
        ctx.lineTo(x - 2, y + 2);
        ctx.lineTo(x + 5, y - 3);
        ctx.lineTo(x + 10, y + 5);
        ctx.stroke();
        break;
      case "mist":
        ctx.fillStyle = hexToRgba("#c9fff0", 0.35);
        ctx.beginPath();
        ctx.arc(x, y, CELL_SIZE * 0.05, 0, Math.PI * 2);
        ctx.fill();
        break;
      case "star":
      case "prism":
        ctx.fillStyle = hexToRgba("#fff2a8", 0.85);
        ctx.beginPath();
        ctx.moveTo(x, y - 6);
        ctx.lineTo(x + 2, y - 1);
        ctx.lineTo(x + 8, y);
        ctx.lineTo(x + 2, y + 1);
        ctx.lineTo(x, y + 6);
        ctx.lineTo(x - 2, y + 1);
        ctx.lineTo(x - 8, y);
        ctx.lineTo(x - 2, y - 1);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = hexToRgba("#ffffff", 0.82);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x - 9, y);
        ctx.lineTo(x + 9, y);
        ctx.moveTo(x, y - 9);
        ctx.lineTo(x, y + 9);
        ctx.stroke();
        break;
      default:
        ctx.fillStyle = hexToRgba(skin.accent, 0.6);
        ctx.beginPath();
        ctx.arc(x, y, CELL_SIZE * 0.03, 0, Math.PI * 2);
        ctx.fill();
    }
  }

  ctx.restore();
}

function drawSmoothBody(points, shorten = 0) {
  if (points.length === 1) {
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, CELL_SIZE / 3, 0, Math.PI * 2);
    return;
  }

  const limit = points.length - (shorten > 0 ? 1 : 0);
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < limit - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const centerX = (current.x + next.x) / 2;
    const centerY = (current.y + next.y) / 2;
    ctx.quadraticCurveTo(current.x, current.y, centerX, centerY);
  }
  const last = points[Math.max(0, limit - 1)];
  ctx.lineTo(last.x, last.y);
}

function render(now = performance.now()) {
  drawBoard(now);
  drawFood(now);
  drawSnake(now);
}

function spawnFood() {
  const freeCells = [];
  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      if (!snake.some((segment) => segment.x === x && segment.y === y)) {
        freeCells.push({ x, y });
      }
    }
  }
  const cell = freeCells[Math.floor(Math.random() * freeCells.length)];
  return { ...cell, type: pickFruitType() };
}

function updateScore() {
  scoreElement.textContent = String(score).padStart(3, "0");
  bestScoreElement.textContent = String(bestScore).padStart(3, "0");
}

function setStatus(text) {
  statusElement.textContent = text;
}

function scheduleTick() {
  window.clearTimeout(timer);
  const speed = Math.max(MIN_SPEED, START_SPEED - Math.floor(score / 4) * 8);
  moveDuration = speed;
  moveStartAt = performance.now();
  timer = window.setTimeout(tick, speed);
  return speed;
}

function tick() {
  if (gameState !== "playing") return;

  const previousSnake = cloneSnakeState(snake);
  direction = nextDirection;
  const head = {
    x: snake[0].x + direction.x,
    y: snake[0].y + direction.y,
  };
  const hitWall =
    head.x < 0 || head.x >= GRID_SIZE || head.y < 0 || head.y >= GRID_SIZE;
  const hitSelf = snake.some(
    (segment, index) =>
      index !== snake.length - 1 && segment.x === head.x && segment.y === head.y
  );

  if (hitWall || hitSelf) {
    endGame();
    return;
  }

  snake.unshift(head);
  if (head.x === food.x && head.y === food.y) {
    score += 1;
    if (score > bestScore) {
      bestScore = score;
      localStorage.setItem("snakeBestScore", String(bestScore));
    }
    food = spawnFood();
    updateScore();
  } else {
    snake.pop();
  }

  moveFromSnake = previousSnake;
  moveToSnake = cloneSnakeState(snake);
  scheduleTick();
  render();
}

function changeDirection(name) {
  if (gameState === "over" || gameState === "paused") return;
  const candidate = DIRECTIONS[name];
  if (candidate.x === -direction.x && candidate.y === -direction.y) return;
  nextDirection = candidate;

  if (gameState === "ready") {
    gameState = "playing";
    startHint.hidden = true;
    setStatus("游戏中");
    updateSkinButtons();
    scheduleTick();
  }
}

function togglePause() {
  if (gameState === "ready" || gameState === "over") return;
  if (gameState === "paused") {
    gameState = "playing";
    pauseLabel.textContent = "暂停";
    setStatus("游戏中");
    moveStartAt = performance.now() - moveDuration * pausedProgress;
    const remaining = Math.max(20, moveDuration * (1 - pausedProgress));
    timer = window.setTimeout(tick, remaining);
    updateSkinButtons();
  } else {
    pausedProgress = getMoveProgress();
    gameState = "paused";
    window.clearTimeout(timer);
    pauseLabel.textContent = "继续";
    setStatus("已暂停");
    updateSkinButtons();
  }
}

function endGame() {
  gameState = "over";
  window.clearTimeout(timer);
  finalScoreElement.textContent = String(score);
  gameOverOverlay.hidden = false;
  setStatus("游戏结束");
  updateSkinButtons();
}

function resetGame() {
  window.clearTimeout(timer);
  snake = [
    { x: 9, y: 9 },
    { x: 8, y: 9 },
    { x: 7, y: 9 },
    { x: 6, y: 9 },
  ];
  direction = DIRECTIONS.right;
  nextDirection = DIRECTIONS.right;
  score = 0;
  food = spawnFood();
  gameState = "ready";
  moveFromSnake = cloneSnakeState(snake);
  moveToSnake = cloneSnakeState(snake);
  moveStartAt = performance.now();
  moveDuration = START_SPEED;
  pausedProgress = 0;
  updateScore();
  pauseLabel.textContent = "暂停";
  gameOverOverlay.hidden = true;
  startHint.hidden = false;
  setStatus("等待开始");
  updateSkinButtons();
  render();
}

document.addEventListener("keydown", (event) => {
  if (event.key in KEY_DIRECTIONS) {
    event.preventDefault();
    changeDirection(KEY_DIRECTIONS[event.key]);
  } else if (event.code === "Space") {
    event.preventDefault();
    togglePause();
  } else if (event.key === "r" || event.key === "R") {
    resetGame();
  }
});

document.querySelectorAll("[data-direction]").forEach((button) => {
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    changeDirection(button.dataset.direction);
  });
});

skinButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setSkin(button.dataset.skin);
  });
});

pauseButton.addEventListener("click", togglePause);
restartButton.addEventListener("click", resetGame);

resetGame();

let animationFrameId = 0;
function animationLoop(now) {
  render(now);
  animationFrameId = window.requestAnimationFrame(animationLoop);
}

animationFrameId = window.requestAnimationFrame(animationLoop);
