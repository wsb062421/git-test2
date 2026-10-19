(() => {
  'use strict';

  const SIZE = 480;
  const GRID = 20;
  const CELL = SIZE / GRID;
  const TAU = Math.PI * 2;

  const BASE_STEP = 160; // 初始移动间隔（毫秒）
  const MIN_STEP = 70; // 最快移动间隔
  const STEP_DECREASE = 6; // 每吃一个果实缩短的间隔
  const POINTS_PER_FOOD = 10;
  const BEST_KEY = 'canvas-snake-best-v1';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const scoreValueEl = document.getElementById('scoreValue');
  const bestValueEl = document.getElementById('bestValue');
  const overlay = document.getElementById('overlay');
  const overlayIcon = document.getElementById('overlayIcon');
  const overlayTitle = document.getElementById('overlayTitle');
  const overlayMessage = document.getElementById('overlayMessage');
  const finalScore = document.getElementById('finalScore');
  const finalScoreValue = document.getElementById('finalScoreValue');
  const overlayBtn = document.getElementById('overlayBtn');
  const overlayHint = document.getElementById('overlayHint');
  const restartBtn = document.getElementById('restartBtn');
  const dirButtons = document.querySelectorAll('[data-dir]');

  const DIRECTIONS = Object.freeze({
    up: Object.freeze({ x: 0, y: -1 }),
    down: Object.freeze({ x: 0, y: 1 }),
    left: Object.freeze({ x: -1, y: 0 }),
    right: Object.freeze({ x: 1, y: 0 })
  });

  const KEY_TO_DIRECTION = Object.freeze({
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
    w: 'up',
    a: 'left',
    s: 'down',
    d: 'right'
  });

  // 按设备像素比放大画布，保证在高分屏下依然清晰
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(SIZE * dpr);
  canvas.height = Math.round(SIZE * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  let snake = [];
  let direction = DIRECTIONS.right;
  let directionQueue = [];
  let food = null;
  let score = 0;
  let bestScore = readBestScore();
  let stepInterval = BASE_STEP;
  let phase = 'ready'; // ready | playing | over | won
  let accumulator = 0;
  let lastFrameTime = 0;

  bestValueEl.textContent = String(bestScore);

  // ---------- 游戏状态 ----------

  function resetGame(startImmediately = false) {
    snake = [
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 }
    ];
    direction = DIRECTIONS.right;
    directionQueue = [];
    score = 0;
    stepInterval = BASE_STEP;
    accumulator = 0;
    lastFrameTime = performance.now();
    food = spawnFood();
    phase = startImmediately ? 'playing' : 'ready';

    scoreValueEl.textContent = '0';
    bestValueEl.textContent = String(bestScore);

    if (startImmediately) {
      hideOverlay();
    } else {
      showReadyOverlay();
    }

    draw(performance.now());
  }

  function startGame() {
    if (phase !== 'ready') return;

    phase = 'playing';
    accumulator = 0;
    lastFrameTime = performance.now();
    hideOverlay();
  }

  function stepGame() {
    // 每步只取一个已排队的转向，避免同一帧连转两次造成反方向
    if (directionQueue.length > 0) {
      const nextDirection = directionQueue.shift();
      if (
        nextDirection.x !== -direction.x ||
        nextDirection.y !== -direction.y
      ) {
        direction = nextDirection;
      }
    }

    const head = snake[0];
    const nextHead = {
      x: head.x + direction.x,
      y: head.y + direction.y
    };

    // 撞墙
    if (
      nextHead.x < 0 ||
      nextHead.x >= GRID ||
      nextHead.y < 0 ||
      nextHead.y >= GRID
    ) {
      endGame('撞到墙壁了。');
      return;
    }

    const willEat =
      food !== null && nextHead.x === food.x && nextHead.y === food.y;

    // 不吃果实时蛇尾会移开，因此尾巴所在的格子可以进入
    const bodyToCheck = willEat ? snake : snake.slice(0, -1);
    const hitSelf = bodyToCheck.some(
      (segment) => segment.x === nextHead.x && segment.y === nextHead.y
    );

    if (hitSelf) {
      endGame('哎呀，咬到自己了。');
      return;
    }

    snake.unshift(nextHead);

    if (!willEat) {
      snake.pop();
      return;
    }

    // 吃到食物：加分、提速、刷新最高分
    score += POINTS_PER_FOOD;
    scoreValueEl.textContent = String(score);
    bump(scoreValueEl);

    if (score > bestScore) {
      bestScore = score;
      bestValueEl.textContent = String(bestScore);
      saveBestScore(bestScore);
      bump(bestValueEl);
    }

    const foodsEaten = score / POINTS_PER_FOOD;
    stepInterval = Math.max(
      MIN_STEP,
      BASE_STEP - foodsEaten * STEP_DECREASE
    );
    accumulator = Math.min(accumulator, stepInterval);

    // 重新放置食物；若棋盘已填满则通关
    food = spawnFood();
    if (!food) {
      endGame('整张棋盘都被你填满了，太厉害了！', true);
    }
  }

  function endGame(message, isWin = false) {
    phase = isWin ? 'won' : 'over';
    directionQueue = [];

    if (isWin) {
      showOverlay({
        icon: '🏆',
        title: '完美通关！',
        message,
        buttonText: '再玩一次',
        hint: '你填满了整个棋盘，来挑战新的记录吧',
        withScore: true
      });
    } else {
      showOverlay({
        icon: '💥',
        title: '游戏结束',
        message,
        buttonText: '再来一局',
        hint: '点击按钮，再挑战一次',
        withScore: true
      });
    }
  }

  // ---------- 食物 ----------

  function spawnFood() {
    const freeCells = [];

    for (let y = 0; y < GRID; y += 1) {
      for (let x = 0; x < GRID; x += 1) {
        const occupied = snake.some(
          (segment) => segment.x === x && segment.y === y
        );
        if (!occupied) freeCells.push({ x, y });
      }
    }

    if (freeCells.length === 0) return null;
    return freeCells[Math.floor(Math.random() * freeCells.length)];
  }

  // ---------- 页面遮罩与分数 ----------

  function showOverlay({ icon, title, message, buttonText, hint, withScore }) {
    overlayIcon.textContent = icon;
    overlayTitle.textContent = title;
    overlayMessage.textContent = message;
    overlayBtn.textContent = buttonText;
    overlayHint.textContent = hint;
    finalScore.hidden = !withScore;

    if (withScore) {
      finalScoreValue.textContent = String(score);
    }

    overlay.classList.remove('is-hidden');
    overlay.removeAttribute('aria-hidden');
  }

  function showReadyOverlay() {
    showOverlay({
      icon: '🐍',
      title: '准备好了吗？',
      message: '吃掉果实获得分数，小心不要撞到墙和自己。',
      buttonText: '开始游戏',
      hint: '按方向键 / WASD 也可以开始',
      withScore: false
    });
  }

  function hideOverlay() {
    overlay.classList.add('is-hidden');
    overlay.setAttribute('aria-hidden', 'true');

    if (overlay.contains(document.activeElement)) {
      document.activeElement.blur();
    }
  }

  function bump(element) {
    element.classList.remove('bump');
    void element.offsetWidth;
    element.classList.add('bump');
  }

  function readBestScore() {
    try {
      const saved = window.localStorage.getItem(BEST_KEY);
      if (!saved) return 0;
      const value = Number.parseInt(saved, 10);
      return Number.isFinite(value) && value > 0 ? value : 0;
    } catch (error) {
      return 0;
    }
  }

  function saveBestScore(value) {
    try {
      window.localStorage.setItem(BEST_KEY, String(value));
    } catch (error) {
      // 浏览器禁用本地存储时静默忽略
    }
  }

  // ---------- 输入 ----------

  function handleDirectionInput(dirName) {
    if (phase === 'ready') startGame();
    if (phase !== 'playing') return;

    enqueueDirection(DIRECTIONS[dirName]);
  }

  function enqueueDirection(nextDirection) {
    if (!nextDirection) return;

    const lastDirection =
      directionQueue.length > 0
        ? directionQueue[directionQueue.length - 1]
        : direction;

    const isSame =
      nextDirection.x === lastDirection.x &&
      nextDirection.y === lastDirection.y;
    const isReverse =
      nextDirection.x === -lastDirection.x &&
      nextDirection.y === -lastDirection.y;

    if (isSame || isReverse || directionQueue.length >= 2) return;
    directionQueue.push(nextDirection);
  }

  function handleKeyDown(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const dirName = KEY_TO_DIRECTION[key];
    if (!dirName) return;

    event.preventDefault();
    handleDirectionInput(dirName);
  }

  document.addEventListener('keydown', handleKeyDown);

  dirButtons.forEach((button) => {
    button.addEventListener('click', () => {
      handleDirectionInput(button.dataset.dir);
    });
  });

  overlayBtn.addEventListener('click', () => resetGame(true));
  restartBtn.addEventListener('click', () => resetGame(true));

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      lastFrameTime = performance.now();
      accumulator = 0;
    }
  });

  // ---------- 主循环 ----------

  function loop(timestamp) {
    const elapsed = lastFrameTime
      ? Math.min(Math.max(timestamp - lastFrameTime, 0), 120)
      : 0;
    lastFrameTime = timestamp;

    if (phase === 'playing') {
      accumulator += elapsed;

      let steps = 0;
      while (
        accumulator >= stepInterval &&
        phase === 'playing' &&
        steps < 3
      ) {
        accumulator -= stepInterval;
        stepGame();
        steps += 1;
      }

      if (phase !== 'playing') accumulator = 0;
    } else {
      accumulator = 0;
    }

    draw(timestamp);
    requestAnimationFrame(loop);
  }

  // ---------- 绘制 ----------

  function draw(timestamp) {
    drawBoard();
    drawFood(timestamp);
    drawSnake();
  }

  function drawBoard() {
    ctx.fillStyle = '#08141f';
    ctx.fillRect(0, 0, SIZE, SIZE);

    const ambient = ctx.createRadialGradient(
      SIZE * 0.28,
      SIZE * 0.14,
      10,
      SIZE * 0.28,
      SIZE * 0.14,
      SIZE * 0.85
    );
    ambient.addColorStop(0, 'rgba(45, 212, 191, 0.08)');
    ambient.addColorStop(1, 'rgba(45, 212, 191, 0)');
    ctx.fillStyle = ambient;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // 非常淡的棋盘格，帮助判断距离
    for (let y = 0; y < GRID; y += 1) {
      for (let x = 0; x < GRID; x += 1) {
        ctx.fillStyle =
          (x + y) % 2 === 0
            ? 'rgba(255, 255, 255, 0.012)'
            : 'rgba(0, 0, 0, 0.03)';
        ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
    }

    ctx.strokeStyle = 'rgba(148, 210, 190, 0.045)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < GRID; i += 1) {
      const position = i * CELL + 0.5;
      ctx.moveTo(position, 0);
      ctx.lineTo(position, SIZE);
      ctx.moveTo(0, position);
      ctx.lineTo(SIZE, position);
    }
    ctx.stroke();

    const vignette = ctx.createRadialGradient(
      SIZE / 2,
      SIZE / 2,
      SIZE * 0.24,
      SIZE / 2,
      SIZE / 2,
      SIZE * 0.72
    );
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.2)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, SIZE, SIZE);
  }

  function drawFood(timestamp) {
    if (!food) return;

    const pulse = 1 + Math.sin(timestamp / 260) * 0.055;
    const cx = (food.x + 0.5) * CELL;
    const cy = (food.y + 0.5) * CELL;
    const radius = CELL * 0.33 * pulse;

    // 柔和的光晕
    const glow = ctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius * 2.3);
    glow.addColorStop(0, 'rgba(251, 113, 133, 0.22)');
    glow.addColorStop(1, 'rgba(251, 113, 133, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 2.3, 0, TAU);
    ctx.fill();

    // 果实本体
    ctx.save();
    ctx.shadowColor = 'rgba(251, 113, 133, 0.65)';
    ctx.shadowBlur = 16;

    const fruitGradient = ctx.createRadialGradient(
      cx - radius * 0.35,
      cy - radius * 0.4,
      radius * 0.15,
      cx,
      cy,
      radius
    );
    fruitGradient.addColorStop(0, '#ffd6a5');
    fruitGradient.addColorStop(0.45, '#fb7185');
    fruitGradient.addColorStop(1, '#e11d48');

    ctx.fillStyle = fruitGradient;
    ctx.beginPath();
    ctx.arc(cx, cy + radius * 0.06, radius, 0, TAU);
    ctx.fill();
    ctx.restore();

    // 高光
    ctx.fillStyle = 'rgba(255, 255, 255, 0.62)';
    ctx.beginPath();
    ctx.ellipse(
      cx - radius * 0.32,
      cy - radius * 0.3,
      radius * 0.23,
      radius * 0.14,
      -0.6,
      0,
      TAU
    );
    ctx.fill();

    // 叶子
    ctx.save();
    ctx.translate(cx + radius * 0.3, cy - radius * 1.02);
    ctx.rotate(-0.5);
    ctx.fillStyle = '#4ade80';
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 0.52, radius * 0.24, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawSnake() {
    if (snake.length === 0) return;

    // 从尾巴向头部绘制，身体颜色由亮到暗形成层次
    for (let i = snake.length - 1; i >= 1; i -= 1) {
      const segment = snake[i];
      const ratio = i / Math.max(1, snake.length - 1);
      const inset = 2 + ratio * 1.8;
      const x = segment.x * CELL + inset;
      const y = segment.y * CELL + inset;
      const size = CELL - inset * 2;

      ctx.fillStyle = `hsl(${152 + ratio * 26}, ${70 - ratio * 14}%, ${
        63 - ratio * 13
      }%)`;
      roundedRectPath(x, y, size, size, size * 0.34);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    drawHead();
  }

  function drawHead() {
    const head = snake[0];
    const inset = 1.3;
    const x = head.x * CELL + inset;
    const y = head.y * CELL + inset;
    const size = CELL - inset * 2;
    const cx = x + size / 2;
    const cy = y + size / 2;

    ctx.save();
    ctx.shadowColor = 'rgba(94, 234, 160, 0.55)';
    ctx.shadowBlur = 16;

    const headGradient = ctx.createLinearGradient(x, y, x + size, y + size);
    headGradient.addColorStop(0, '#c8ffdf');
    headGradient.addColorStop(0.48, '#7df0b0');
    headGradient.addColorStop(1, '#2dd4a0');

    ctx.fillStyle = headGradient;
    roundedRectPath(x, y, size, size, size * 0.36);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1;
    roundedRectPath(x, y, size, size, size * 0.36);
    ctx.stroke();

    // 眼睛朝向当前移动方向
    const forward = direction;
    const perpendicular = { x: -forward.y, y: forward.x };
    const forwardOffset = CELL * 0.14;
    const sideOffset = CELL * 0.18;
    const eyeRadius = CELL * 0.105;
    const pupilRadius = CELL * 0.052;

    [-1, 1].forEach((side) => {
      const eyeX =
        cx + forward.x * forwardOffset + perpendicular.x * sideOffset * side;
      const eyeY =
        cy + forward.y * forwardOffset + perpendicular.y * sideOffset * side;

      ctx.fillStyle = '#f7fffb';
      ctx.beginPath();
      ctx.arc(eyeX, eyeY, eyeRadius, 0, TAU);
      ctx.fill();

      ctx.fillStyle = '#08251a';
      ctx.beginPath();
      ctx.arc(
        eyeX + forward.x * 1.2,
        eyeY + forward.y * 1.2,
        pupilRadius,
        0,
        TAU
      );
      ctx.fill();
    });
  }

  function roundedRectPath(x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ---------- 启动 ----------

  resetGame(false);
  requestAnimationFrame(loop);
})();
