import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

// --- CONFIGURATION & CONSTANTS ---
const GRID_COUNT = 20;
const CANVAS_SIZE = 400; // Internal resolution
const CELL_SIZE = CANVAS_SIZE / GRID_COUNT; // 20px per cell
const INITIAL_SPEED = 140; // ms per step
const MIN_SPEED = 65; // maximum speed cap
const STORAGE_KEY = 'snake_game_high_score';

const DIRS = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 }
};

export default function App() {
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [isGameOver, setIsGameOver] = useState(false);
  const [activeBtn, setActiveBtn] = useState(null);

  const canvasRef = useRef(null);
  const snakeRef = useRef([]);
  const currentDirRef = useRef(DIRS.RIGHT);
  const nextDirQueueRef = useRef([]);
  const foodRef = useRef({ x: 15, y: 10 });
  const isGameOverRef = useRef(false);
  const gameIntervalRef = useRef(null);
  const tonguePhaseRef = useRef(0);
  const audioCtxRef = useRef(null);

  // Touch tracking for swipe
  const touchStartRef = useRef({ x: 0, y: 0, time: 0 });

  // Web Audio feedback
  const playTone = useCallback((freq, type, duration, vol = 0.1) => {
    try {
      if (!audioCtxRef.current) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) audioCtxRef.current = new AudioContextClass();
      }
      const ctx = audioCtxRef.current;
      if (ctx && ctx.state === 'suspended') {
        ctx.resume();
      }
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {
      // Audio context blocked or unavailable; silent fallback
    }
  }, []);

  const soundEat = useCallback(() => {
    playTone(660, 'sine', 0.08, 0.12);
    setTimeout(() => playTone(880, 'sine', 0.1, 0.12), 60);
  }, [playTone]);

  const soundDie = useCallback(() => {
    playTone(220, 'sawtooth', 0.15, 0.15);
    setTimeout(() => playTone(140, 'sawtooth', 0.25, 0.15), 100);
  }, [playTone]);

  const soundTurn = useCallback(() => {
    playTone(320, 'triangle', 0.03, 0.04);
  }, [playTone]);

  // Load High Score
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored !== null) {
        const parsed = parseInt(stored, 10);
        if (!isNaN(parsed)) setHighScore(parsed);
      }
    } catch {
      // localStorage unavailable or restricted
    }
  }, []);

  // Update High Score helper
  const updateHighScore = useCallback((newScore) => {
    setHighScore((prev) => {
      if (newScore > prev) {
        try {
          localStorage.setItem(STORAGE_KEY, newScore.toString());
        } catch {}
        return newScore;
      }
      return prev;
    });
  }, []);

  // Spawn Food
  const spawnFood = useCallback(() => {
    let valid = false;
    let candidate = { x: 0, y: 0 };
    let attempts = 0;
    const currentSnake = snakeRef.current;

    while (!valid && attempts < 400) {
      attempts++;
      candidate = {
        x: Math.floor(Math.random() * GRID_COUNT),
        y: Math.floor(Math.random() * GRID_COUNT)
      };
      valid = !currentSnake.some(seg => seg.x === candidate.x && seg.y === candidate.y);
    }

    foodRef.current = candidate;
  }, []);

  // Drawing Helper: Rounded Rect
  const roundRect = (ctx, x, y, width, height, radius) => {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  };

  // Render Canvas Scene
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear Canvas
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // 1. Draw Faint Grid
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    for (let i = 1; i < GRID_COUNT; i++) {
      const pos = i * CELL_SIZE;
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, CANVAS_SIZE);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, pos);
      ctx.lineTo(CANVAS_SIZE, pos);
      ctx.stroke();
    }
    ctx.restore();

    // 2. Draw Food (Shiny Red Apple)
    const food = foodRef.current;
    const fx = (food.x + 0.5) * CELL_SIZE;
    const fy = (food.y + 0.5) * CELL_SIZE;
    const fr = CELL_SIZE * 0.40;

    ctx.save();
    ctx.shadowColor = 'rgba(239, 68, 68, 0.7)';
    ctx.shadowBlur = 10;

    const grad = ctx.createRadialGradient(
      fx - fr * 0.35, fy - fr * 0.35, fr * 0.1,
      fx, fy, fr * 1.15
    );
    grad.addColorStop(0, '#fca5a5');
    grad.addColorStop(0.2, '#ef4444');
    grad.addColorStop(0.8, '#dc2626');
    grad.addColorStop(1, '#991b1b');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(fx - fr * 0.22, fy, fr * 0.78, 0, Math.PI * 2);
    ctx.arc(fx + fr * 0.22, fy, fr * 0.78, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    // Gloss shine
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.beginPath();
    ctx.ellipse(fx - fr * 0.38, fy - fr * 0.28, fr * 0.22, fr * 0.12, -Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();

    // Brown Stem
    ctx.strokeStyle = '#854d0e';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(fx, fy - fr * 0.65);
    ctx.quadraticCurveTo(fx + 2, fy - fr * 1.15, fx + 5, fy - fr * 1.25);
    ctx.stroke();

    // Green Leaf
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.moveTo(fx + 2, fy - fr * 0.95);
    ctx.quadraticCurveTo(fx + 8, fy - fr * 1.45, fx + 11, fy - fr * 0.95);
    ctx.quadraticCurveTo(fx + 6, fy - fr * 0.75, fx + 2, fy - fr * 0.95);
    ctx.fill();
    ctx.restore();

    // 3. Draw Snake
    const snake = snakeRef.current;
    if (snake.length === 0) return;

    ctx.save();
    ctx.shadowColor = '#22c55e';
    ctx.shadowBlur = 8;
    const inset = 1.5;

    // Body segments (tail to 1)
    for (let i = snake.length - 1; i >= 1; i--) {
      const seg = snake[i];
      const px = seg.x * CELL_SIZE + inset;
      const py = seg.y * CELL_SIZE + inset;
      const size = CELL_SIZE - inset * 2;
      const cx = px + size / 2;
      const cy = py + size / 2;

      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      roundRect(ctx, px, py, size, size, 5);
      ctx.fill();

      // Darker outline
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#15803d';
      ctx.lineWidth = 1.8;
      ctx.stroke();

      // Light-green dot along body
      ctx.fillStyle = '#bbf7d0';
      ctx.beginPath();
      ctx.arc(cx, cy, CELL_SIZE * 0.14, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 8;
    }

    // Head (segment 0)
    const head = snake[0];
    const hx = head.x * CELL_SIZE + inset;
    const hy = head.y * CELL_SIZE + inset;
    const hsize = CELL_SIZE - inset * 2;
    const hcx = hx + hsize / 2;
    const hcy = hy + hsize / 2;

    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    roundRect(ctx, hx, hy, hsize, hsize, 7);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#15803d';
    ctx.lineWidth = 2;
    ctx.stroke();

    const currentDir = currentDirRef.current;
    const dx = currentDir.x;
    const dy = currentDir.y;
    const px = -dy;
    const py = dx;

    const eyeDistance = CELL_SIZE * 0.22;
    const eyeForward = CELL_SIZE * 0.16;

    const eye1X = hcx + dx * eyeForward + px * eyeDistance;
    const eye1Y = hcy + dy * eyeForward + py * eyeDistance;
    const eye2X = hcx + dx * eyeForward - px * eyeDistance;
    const eye2Y = hcy + dy * eyeForward - py * eyeDistance;

    const eyeR = CELL_SIZE * 0.15;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(eye1X, eye1Y, eyeR, 0, Math.PI * 2);
    ctx.arc(eye2X, eye2Y, eyeR, 0, Math.PI * 2);
    ctx.fill();

    const pupilR = eyeR * 0.58;
    const pupilShift = eyeR * 0.35;
    ctx.fillStyle = '#0a0a0a';
    ctx.beginPath();
    ctx.arc(eye1X + dx * pupilShift, eye1Y + dy * pupilShift, pupilR, 0, Math.PI * 2);
    ctx.arc(eye2X + dx * pupilShift, eye2Y + dy * pupilShift, pupilR, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(eye1X + dx * pupilShift - 0.7, eye1Y + dy * pupilShift - 0.7, pupilR * 0.45, 0, Math.PI * 2);
    ctx.arc(eye2X + dx * pupilShift - 0.7, eye2Y + dy * pupilShift - 0.7, pupilR * 0.45, 0, Math.PI * 2);
    ctx.fill();

    // Animated Red Tongue
    const tongueBaseX = hcx + dx * (hsize / 2 - 1);
    const tongueBaseY = hcy + dy * (hsize / 2 - 1);
    const flickLength = CELL_SIZE * (0.35 + 0.12 * Math.sin(tonguePhaseRef.current * 0.8));
    const tongueTipX = tongueBaseX + dx * flickLength;
    const tongueTipY = tongueBaseY + dy * flickLength;

    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tongueBaseX, tongueBaseY);
    ctx.lineTo(tongueTipX, tongueTipY);
    const forkSize = CELL_SIZE * 0.12;
    ctx.lineTo(tongueTipX + (dx + px) * forkSize, tongueTipY + (dy + py) * forkSize);
    ctx.moveTo(tongueTipX, tongueTipY);
    ctx.lineTo(tongueTipX + (dx - px) * forkSize, tongueTipY + (dy - py) * forkSize);
    ctx.stroke();

    ctx.restore();
  }, []);

  // Direction Request with 180° reversal block
  const requestDirection = useCallback((newDir, btnName = null) => {
    if (isGameOverRef.current) return;

    if (btnName) {
      setActiveBtn(btnName);
      setTimeout(() => setActiveBtn(null), 120);
    }

    const refDir = nextDirQueueRef.current.length > 0
      ? nextDirQueueRef.current[nextDirQueueRef.current.length - 1]
      : currentDirRef.current;

    const isOpposite = (newDir.x === -refDir.x && newDir.y === -refDir.y);
    const isSame = (newDir.x === refDir.x && newDir.y === refDir.y);

    if (!isOpposite && !isSame) {
      if (nextDirQueueRef.current.length < 2) {
        nextDirQueueRef.current.push(newDir);
        soundTurn();
      }
    }
  }, [soundTurn]);

  // Trigger Game Over
  const triggerGameOver = useCallback(() => {
    isGameOverRef.current = true;
    setIsGameOver(true);
    if (gameIntervalRef.current) clearInterval(gameIntervalRef.current);
    soundDie();
    draw();
  }, [soundDie, draw]);

  // Step function
  const step = useCallback(() => {
    if (isGameOverRef.current) return;

    if (nextDirQueueRef.current.length > 0) {
      currentDirRef.current = nextDirQueueRef.current.shift();
    }

    const head = snakeRef.current[0];
    const newHead = {
      x: head.x + currentDirRef.current.x,
      y: head.y + currentDirRef.current.y
    };

    // Wall collision
    if (
      newHead.x < 0 ||
      newHead.x >= GRID_COUNT ||
      newHead.y < 0 ||
      newHead.y >= GRID_COUNT
    ) {
      triggerGameOver();
      return;
    }

    // Self collision
    for (let i = 0; i < snakeRef.current.length; i++) {
      if (snakeRef.current[i].x === newHead.x && snakeRef.current[i].y === newHead.y) {
        triggerGameOver();
        return;
      }
    }

    // Move forward
    snakeRef.current.unshift(newHead);

    // Food collision
    if (newHead.x === foodRef.current.x && newHead.y === foodRef.current.y) {
      setScore((prev) => {
        const next = prev + 1;
        updateHighScore(next);
        return next;
      });
      soundEat();
      spawnFood();
    } else {
      snakeRef.current.pop();
    }

    tonguePhaseRef.current += 1;
    draw();
  }, [triggerGameOver, soundEat, spawnFood, updateHighScore, draw]);

  // Schedule Tick with dynamic speed
  const scheduleTick = useCallback((currentScore) => {
    if (gameIntervalRef.current) clearInterval(gameIntervalRef.current);
    if (isGameOverRef.current) return;

    const speedBoost = Math.floor(currentScore / 5) * 8;
    const delay = Math.max(MIN_SPEED, INITIAL_SPEED - speedBoost);

    gameIntervalRef.current = setInterval(step, delay);
  }, [step]);

  // Re-schedule when score changes (speed up every 5 points)
  useEffect(() => {
    if (!isGameOver) {
      scheduleTick(score);
    }
  }, [score, isGameOver, scheduleTick]);

  // Start / Restart Game
  const initGame = useCallback(() => {
    if (gameIntervalRef.current) clearInterval(gameIntervalRef.current);

    const startX = Math.floor(GRID_COUNT / 2);
    const startY = Math.floor(GRID_COUNT / 2);
    snakeRef.current = [
      { x: startX, y: startY },
      { x: startX - 1, y: startY },
      { x: startX - 2, y: startY }
    ];

    currentDirRef.current = DIRS.RIGHT;
    nextDirQueueRef.current = [];
    isGameOverRef.current = false;
    setIsGameOver(false);
    setScore(0);

    spawnFood();
    draw();
    scheduleTick(0);
  }, [spawnFood, draw, scheduleTick]);

  // Initial mount game start
  useEffect(() => {
    initGame();
    return () => {
      if (gameIntervalRef.current) clearInterval(gameIntervalRef.current);
    };
  }, [initGame]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }

      switch (e.key) {
        case 'ArrowUp':
        case 'KeyW':
        case 'w':
        case 'W':
          requestDirection(DIRS.UP, 'UP');
          break;
        case 'ArrowDown':
        case 'KeyS':
        case 's':
        case 'S':
          requestDirection(DIRS.DOWN, 'DOWN');
          break;
        case 'ArrowLeft':
        case 'KeyA':
        case 'a':
        case 'A':
          requestDirection(DIRS.LEFT, 'LEFT');
          break;
        case 'ArrowRight':
        case 'KeyD':
        case 'd':
        case 'D':
          requestDirection(DIRS.RIGHT, 'RIGHT');
          break;
        case ' ':
        case 'Enter':
          if (isGameOverRef.current) {
            initGame();
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [requestDirection, initGame]);

  // Canvas Touch Swiping (with passive: false to prevent scrolling)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleTouchStart = (e) => {
      if (e.touches.length > 0) {
        touchStartRef.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
          time: Date.now()
        };
      }
    };

    const handleTouchMove = (e) => {
      if (e.cancelable) {
        e.preventDefault();
      }
    };

    const handleTouchEnd = (e) => {
      if (e.changedTouches.length > 0) {
        const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
        const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        const minDistance = 18;

        if (Math.max(absDx, absDy) >= minDistance) {
          if (absDx > absDy) {
            if (dx > 0) requestDirection(DIRS.RIGHT, 'RIGHT');
            else requestDirection(DIRS.LEFT, 'LEFT');
          } else {
            if (dy > 0) requestDirection(DIRS.DOWN, 'DOWN');
            else requestDirection(DIRS.UP, 'UP');
          }
        }
      }
    };

    canvas.addEventListener('touchstart', handleTouchStart, { passive: true });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
    };
  }, [requestDirection]);

  // Helper for touch & click button events
  const createBtnHandlers = (dir, name) => ({
    onTouchStart: (e) => {
      e.preventDefault();
      requestDirection(dir, name);
    },
    onTouchEnd: (e) => {
      e.preventDefault();
      setActiveBtn(null);
    },
    onTouchCancel: () => setActiveBtn(null),
    onMouseDown: (e) => {
      e.preventDefault();
      requestDirection(dir, name);
    },
    onMouseUp: () => setActiveBtn(null),
    onMouseLeave: () => setActiveBtn(null)
  });

  return (
    <main className="game-container">
      <section className="game-board-container" aria-label="Snake Game Board and Controls">
        {/* HEADER */}
        <header className="game-header">
          <svg className="snake-icon" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs>
              <linearGradient id="snakeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#4ade80" />
                <stop offset="100%" stopColor="#16a34a" />
              </linearGradient>
              <filter id="iconGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#22c55e" floodOpacity="0.8" />
              </filter>
            </defs>
            <path d="M 18 78 C 18 52, 45 42, 60 48 C 76 54, 82 72, 70 82 C 58 92, 36 90, 30 82" stroke="url(#snakeGrad)" strokeWidth="14" strokeLinecap="round" fill="none" filter="url(#iconGlow)"/>
            <path d="M 58 48 C 65 38, 70 20, 52 14 C 36 8, 30 26, 32 36" stroke="url(#snakeGrad)" strokeWidth="14" strokeLinecap="round" fill="none"/>
            <circle cx="50" cy="20" r="16" fill="#22c55e" stroke="#15803d" strokeWidth="2.5" />
            <circle cx="45" cy="17" r="4.5" fill="#ffffff" />
            <circle cx="44" cy="17" r="2.2" fill="#050505" />
            <circle cx="43" cy="15.8" r="0.9" fill="#ffffff" />
            <path d="M 64 21 Q 72 20 78 18 M 74 19 L 78 22" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
          <h1 className="game-title">SNAKE GAME</h1>
        </header>

        {/* CANVAS BOARD */}
        <div className="canvas-wrapper">
          <canvas
            id="game-canvas"
            ref={canvasRef}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            className={isGameOver ? 'board-dimmed' : ''}
            aria-label="Game board"
          />
        </div>

        {/* CONTROLS PANEL */}
        <div className="controls-panel">
          <div className="scores-group">
            <div className="score-display">Score: <span id="score-val">{score}</span></div>
            <div className="high-score-display">Best: <span id="high-score-val">{highScore}</span></div>
          </div>
          <button
            id="restart-btn"
            className="restart-btn"
            type="button"
            onClick={initGame}
            aria-label="Restart Game"
          >
            Restart
          </button>
        </div>

        {/* GAME OVER BANNER (BELOW SCORE) */}
        <div
          id="game-over-banner"
          className={`game-over-banner ${isGameOver ? 'active' : ''}`}
          role="alert"
          onClick={initGame}
          style={{ cursor: 'pointer' }}
        >
          <span className="game-over-title">GAME OVER!</span>
          <span className="game-over-hint">Press Restart or Space to play again</span>
        </div>

        {/* ON-SCREEN D-PAD */}
        <div className="dpad-container" aria-label="Directional Controls">
          <button
            id="btn-up"
            className={`dpad-btn dpad-up ${activeBtn === 'UP' ? 'pressed' : ''}`}
            type="button"
            aria-label="Move Up"
            {...createBtnHandlers(DIRS.UP, 'UP')}
          >
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 4L4 13H9V20H15V13H20L12 4Z"/>
            </svg>
          </button>

          <button
            id="btn-left"
            className={`dpad-btn dpad-left ${activeBtn === 'LEFT' ? 'pressed' : ''}`}
            type="button"
            aria-label="Move Left"
            {...createBtnHandlers(DIRS.LEFT, 'LEFT')}
          >
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 12L13 4V9H20V15H13V20L4 12Z"/>
            </svg>
          </button>

          <div className="dpad-center" aria-hidden="true">
            <div className="dpad-center-hub" />
          </div>

          <button
            id="btn-right"
            className={`dpad-btn dpad-right ${activeBtn === 'RIGHT' ? 'pressed' : ''}`}
            type="button"
            aria-label="Move Right"
            {...createBtnHandlers(DIRS.RIGHT, 'RIGHT')}
          >
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M20 12L11 4V9H4V15H11V20L20 12Z"/>
            </svg>
          </button>

          <button
            id="btn-down"
            className={`dpad-btn dpad-down ${activeBtn === 'DOWN' ? 'pressed' : ''}`}
            type="button"
            aria-label="Move Down"
            {...createBtnHandlers(DIRS.DOWN, 'DOWN')}
          >
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 20L20 11H15V4H9V11H4L12 20Z"/>
            </svg>
          </button>
        </div>
      </section>
    </main>
  );
}
