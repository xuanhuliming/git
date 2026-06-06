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
    name: "星辉",
    bodyStart: "#ffdeff",
    bodyMid: "#ff77da",
    bodyEnd: "#775bff",
    edge: "#30185e",
    glow: "rgba(191, 119, 255, 0.6)",
    aura: "rgba(113, 216, 255, 0.4)",
    spark: "#fff5c5",
    accent: "#fff0fb",
    effect: "star",
  },
};

let snake;
let food;
let direction;
let nextDirection;
let score;
let bestScore = Number(localStorage.getItem("snakeBestScore") || 0);
let snakeSkin = localStorage.getItem("snakeSkin") || "ember";
let timer;
let gameState;

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
  const boardGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  boardGradient.addColorStop(0, "#f8efd9");
  boardGradient.addColorStop(1, "#eedeb4");
  ctx.fillStyle = boardGradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.globalAlpha = 0.34;
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.beginPath();
  ctx.arc(canvas.width * 0.5, canvas.height * 0.45, canvas.width * 0.24, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = "rgba(78, 72, 58, 0.17)";
  ctx.lineWidth = 1;
  for (let i = 1; i < GRID_SIZE; i += 1) {
    const point = i * CELL_SIZE;
    ctx.beginPath();
    ctx.moveTo(point, 0);
    ctx.lineTo(point, canvas.height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, point);
    ctx.lineTo(canvas.width, point);
    ctx.stroke();
  }
}

function drawFood() {
  const centerX = food.x * CELL_SIZE + CELL_SIZE / 2;
  const centerY = food.y * CELL_SIZE + CELL_SIZE / 2;
  const radius = CELL_SIZE * 0.32;

  ctx.save();
  ctx.shadowColor = "rgba(17, 22, 27, 0.38)";
  ctx.shadowBlur = 8;
  ctx.fillStyle = "#11161b";
  ctx.beginPath();
  ctx.arc(centerX, centerY + 3, radius + 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const gradient = ctx.createRadialGradient(
    centerX - radius * 0.35,
    centerY - radius * 0.45,
    1,
    centerX,
    centerY,
    radius
  );
  gradient.addColorStop(0, "#e6f47a");
  gradient.addColorStop(1, "#9dbb29");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#fffbe6";
  ctx.beginPath();
  ctx.arc(centerX - radius * 0.3, centerY - radius * 0.35, 3.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.strokeStyle = "rgba(183, 214, 60, 0.2)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius + 7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawSnake() {
  const skin = getSkin();
  const stage = getGrowthStage();
  const glowBoost = 1 + stage * 0.65;
  const auraBoost = 1 + stage * 0.18;

  snake.forEach((segment, index) => {
    const inset = 2.5;
    const x = segment.x * CELL_SIZE + inset;
    const y = segment.y * CELL_SIZE + inset;
    const size = CELL_SIZE - inset * 2;
    const segmentProgress = index / Math.max(1, snake.length - 1);
    const segmentAlpha = 0.82 + (1 - segmentProgress) * 0.14;
    const glowBlur = 10 + stage * 6 + (1 - segmentProgress) * 6;
    const sparkBias = pseudoRandom(segment.x * 12.3 + segment.y * 4.7 + index * 1.9);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.35 + stage * 0.1;
    ctx.shadowColor = skin.glow;
    ctx.shadowBlur = glowBlur * auraBoost;
    ctx.fillStyle = skin.aura;
    roundedRect(x - 3, y - 3, size + 6, size + 6, 12);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.72 + segmentAlpha * 0.18;
    ctx.shadowColor = skin.glow;
    ctx.shadowBlur = glowBlur * glowBoost;
    ctx.fillStyle = "rgba(17, 22, 27, 0.9)";
    roundedRect(x + 2, y + 4, size, size, 8);
    ctx.fill();
    ctx.restore();

    const gradient = ctx.createLinearGradient(x, y, x, y + size);
    gradient.addColorStop(0, skin.bodyStart);
    gradient.addColorStop(0.48, skin.bodyMid);
    gradient.addColorStop(1, skin.bodyEnd);
    ctx.fillStyle = gradient;
    roundedRect(x, y, size, size, 8);
    ctx.fill();

    ctx.strokeStyle = skin.edge;
    ctx.lineWidth = 2.2;
    ctx.stroke();

    if (stage >= 1 && index !== 0) {
      drawBodyAccent(segment, x, y, size, skin, stage, index, sparkBias);
    }

    if (index === 0) {
      drawHeadEffects(segment, x, y, size, skin, stage);
      drawEyes(segment, x, y, size, skin);
    }
  });
}

function drawBodyAccent(segment, x, y, size, skin, stage, index, sparkBias) {
  const offset = size * 0.16;
  const trail = size * (0.14 + stage * 0.08);
  const directionSign = index % 2 === 0 ? -1 : 1;
  const alpha = clamp(0.16 + stage * 0.12 + sparkBias * 0.12, 0.12, 0.75);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = skin.spark;
  ctx.fillStyle = skin.spark;
  ctx.lineWidth = 2;

  switch (skin.effect) {
    case "flame":
      ctx.beginPath();
      ctx.moveTo(x + size * 0.2, y + size * 0.26);
      ctx.lineTo(x + size * 0.34, y + size * (0.08 - stage * 0.01));
      ctx.lineTo(x + size * 0.48, y + size * 0.22);
      ctx.lineTo(x + size * 0.58, y + size * 0.04);
      ctx.lineTo(x + size * 0.7, y + size * 0.26);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + size * 0.16, y + size * 0.68);
      ctx.lineTo(x + size * 0.28, y + size * 0.46);
      ctx.lineTo(x + size * 0.4, y + size * 0.74);
      ctx.fill();
      break;
    case "bolt":
      ctx.beginPath();
      ctx.moveTo(x + size * 0.2, y + size * 0.22);
      ctx.lineTo(x + size * 0.34, y + size * 0.1);
      ctx.lineTo(x + size * 0.42, y + size * 0.3);
      ctx.lineTo(x + size * 0.56, y + size * 0.16);
      ctx.lineTo(x + size * 0.68, y + size * 0.38);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + size * 0.72, y + size * 0.72, 1.8 + stage, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "mist":
      ctx.beginPath();
      ctx.arc(x + size * 0.28, y + size * 0.24, 2 + stage * 0.6, 0, Math.PI * 2);
      ctx.arc(x + size * 0.68, y + size * 0.66, 1.6 + stage * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + size * 0.14, y + size * 0.42);
      ctx.quadraticCurveTo(x + size * 0.3, y + size * (0.16 + trail * 0.02), x + size * 0.46, y + size * 0.38);
      ctx.quadraticCurveTo(x + size * 0.62, y + size * 0.62, x + size * 0.84, y + size * 0.34);
      ctx.stroke();
      break;
    case "star":
      ctx.beginPath();
      ctx.moveTo(x + size * 0.22, y + size * 0.28);
      ctx.lineTo(x + size * 0.3, y + size * 0.18);
      ctx.lineTo(x + size * 0.38, y + size * 0.3);
      ctx.lineTo(x + size * 0.5, y + size * 0.16);
      ctx.lineTo(x + size * 0.62, y + size * 0.34);
      ctx.lineTo(x + size * 0.78, y + size * 0.2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + size * 0.74, y + size * 0.68, 1.6 + stage * 0.8, 0, Math.PI * 2);
      ctx.fill();
      break;
    default:
      ctx.beginPath();
      ctx.arc(x + size * 0.5, y + size * 0.26, 2 + stage * 0.7, 0, Math.PI * 2);
      ctx.fill();
  }

  if (stage >= 3) {
    ctx.globalAlpha = 0.12 + stage * 0.08;
    ctx.strokeStyle = hexToRgba(skin.accent, 0.9);
    ctx.beginPath();
    ctx.arc(x + size * 0.5, y + size * 0.5, size * (0.48 + stage * 0.04), 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawHeadEffects(head, x, y, size, skin, stage) {
  const baseX = x + size * 0.5;
  const baseY = y + size * 0.5;
  const power = clamp(stage / 4, 0, 1);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.28 + power * 0.32;
  ctx.strokeStyle = skin.spark;
  ctx.fillStyle = skin.spark;
  ctx.lineWidth = 2;
  ctx.shadowColor = skin.glow;
  ctx.shadowBlur = 12 + stage * 8;

  if (skin.effect === "flame") {
    const flameHeight = size * (0.55 + power * 0.36);
    for (let i = -1; i <= 1; i += 1) {
      const xOffset = i * size * (0.16 + power * 0.04);
      ctx.beginPath();
      ctx.moveTo(baseX + xOffset, y + size * 0.14);
      ctx.quadraticCurveTo(
        baseX + xOffset * 0.65,
        y - flameHeight * (0.16 + i * 0.03),
        baseX + xOffset * 1.15,
        y + size * 0.05
      );
      ctx.quadraticCurveTo(
        baseX + xOffset * 1.28,
        y + size * 0.34,
        baseX + xOffset * 0.42,
        y + size * 0.28
      );
      ctx.fill();
    }
  } else if (skin.effect === "bolt") {
    const boltReach = size * (0.58 + power * 0.4);
    ctx.beginPath();
    ctx.moveTo(baseX - size * 0.14, y - boltReach * 0.06);
    ctx.lineTo(baseX - size * 0.02, y - boltReach * 0.34);
    ctx.lineTo(baseX + size * 0.1, y - boltReach * 0.08);
    ctx.lineTo(baseX + size * 0.22, y - boltReach * 0.42);
    ctx.lineTo(baseX + size * 0.36, y - boltReach * 0.14);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(baseX, baseY - size * 0.33, 4 + stage * 1.2, 0, Math.PI * 2);
    ctx.fill();
    if (stage >= 3) {
      ctx.globalAlpha = 0.2 + power * 0.3;
      ctx.beginPath();
      ctx.arc(baseX, baseY - size * 0.33, size * (0.48 + power * 0.16), 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (skin.effect === "mist") {
    const orbitRadius = size * (0.36 + power * 0.24);
    for (let i = 0; i < 3 + stage; i += 1) {
      const angle = (Math.PI * 2 * i) / (3 + stage) - Math.PI / 2;
      const px = baseX + Math.cos(angle) * orbitRadius;
      const py = baseY + Math.sin(angle) * orbitRadius * 0.72;
      ctx.beginPath();
      ctx.arc(px, py, 2 + stage * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 0.16 + power * 0.2;
    ctx.beginPath();
    ctx.arc(baseX, baseY, size * (0.5 + power * 0.18), 0, Math.PI * 2);
    ctx.stroke();
  } else if (skin.effect === "star") {
    const ringRadius = size * (0.42 + power * 0.28);
    ctx.beginPath();
    ctx.arc(baseX, baseY, ringRadius, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 5 + stage; i += 1) {
      const angle = (Math.PI * 2 * i) / (5 + stage) - Math.PI / 2;
      const outer = ringRadius + size * (0.08 + power * 0.04);
      const inner = ringRadius - size * (0.12 + power * 0.06);
      ctx.beginPath();
      ctx.moveTo(baseX + Math.cos(angle) * inner, baseY + Math.sin(angle) * inner);
      ctx.lineTo(baseX + Math.cos(angle + 0.08) * outer, baseY + Math.sin(angle + 0.08) * outer);
      ctx.lineTo(baseX + Math.cos(angle - 0.08) * outer, baseY + Math.sin(angle - 0.08) * outer);
      ctx.fill();
    }
  }

  ctx.restore();
}

function drawEyes(head, x, y, size, skin) {
  const eyePositions =
    direction.x !== 0
      ? [
          { x: direction.x > 0 ? 0.7 : 0.3, y: 0.32 },
          { x: direction.x > 0 ? 0.7 : 0.3, y: 0.68 },
        ]
      : [
          { x: 0.32, y: direction.y > 0 ? 0.7 : 0.3 },
          { x: 0.68, y: direction.y > 0 ? 0.7 : 0.3 },
        ];

  eyePositions.forEach((eye) => {
    ctx.fillStyle = skin.accent;
    ctx.beginPath();
    ctx.arc(x + size * eye.x, y + size * eye.y, size * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#11161b";
    ctx.beginPath();
    ctx.arc(x + size * eye.x, y + size * eye.y, size * 0.04, 0, Math.PI * 2);
    ctx.fill();
  });
}

function render() {
  drawBoard();
  drawFood();
  drawSnake();
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
  return freeCells[Math.floor(Math.random() * freeCells.length)];
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
  timer = window.setTimeout(tick, speed);
}

function tick() {
  if (gameState !== "playing") return;

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

  render();
  scheduleTick();
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
    updateSkinButtons();
    scheduleTick();
  } else {
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
