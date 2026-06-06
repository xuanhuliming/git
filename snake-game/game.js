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

let snake;
let food;
let direction;
let nextDirection;
let score;
let bestScore = Number(localStorage.getItem("snakeBestScore") || 0);
let timer;
let gameState;

function roundedRect(x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function drawBoard() {
  ctx.fillStyle = "#f5ecd5";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

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

  ctx.fillStyle = "#11161b";
  ctx.beginPath();
  ctx.arc(centerX, centerY + 3, radius + 3, 0, Math.PI * 2);
  ctx.fill();

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
}

function drawSnake() {
  snake.forEach((segment, index) => {
    const inset = 2.5;
    const x = segment.x * CELL_SIZE + inset;
    const y = segment.y * CELL_SIZE + inset;
    const size = CELL_SIZE - inset * 2;

    ctx.fillStyle = "#11161b";
    roundedRect(x + 2, y + 4, size, size, 8);
    ctx.fill();

    const gradient = ctx.createLinearGradient(x, y, x, y + size);
    gradient.addColorStop(0, index === 0 ? "#ff6854" : "#f45a48");
    gradient.addColorStop(1, "#df3b35");
    ctx.fillStyle = gradient;
    roundedRect(x, y, size, size, 8);
    ctx.fill();
    ctx.strokeStyle = "#611a1d";
    ctx.lineWidth = 2;
    ctx.stroke();

    if (index === 0) {
      drawEyes(segment, x, y, size);
    }
  });
}

function drawEyes(head, x, y, size) {
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
    ctx.fillStyle = "#f5ecd5";
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
    scheduleTick();
  }
}

function togglePause() {
  if (gameState === "ready" || gameState === "over") return;
  if (gameState === "paused") {
    gameState = "playing";
    pauseLabel.textContent = "暂停";
    setStatus("游戏中");
    scheduleTick();
  } else {
    gameState = "paused";
    window.clearTimeout(timer);
    pauseLabel.textContent = "继续";
    setStatus("已暂停");
  }
}

function endGame() {
  gameState = "over";
  window.clearTimeout(timer);
  finalScoreElement.textContent = String(score);
  gameOverOverlay.hidden = false;
  setStatus("游戏结束");
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

pauseButton.addEventListener("click", togglePause);
restartButton.addEventListener("click", resetGame);

resetGame();
