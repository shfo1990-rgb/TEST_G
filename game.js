/**
 * ============================================================================
 * NEON STACK: CYBER TOWER (Bulletproof Engine)
 * ============================================================================
 */

// 1. 게임 상태 정의 (MFC enum class 대응)
const GameState = {
  READY: 'READY',
  PLAYING: 'PLAYING',
  GAMEOVER: 'GAMEOVER'
};

// 2. 사운드 합성 엔진 (브라우저 보안 차단 및 예외 방지)
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.scale = [261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88, 523.25, 587.33, 659.25, 783.99, 880.00];
  }

  init() {
    try {
      if (!this.ctx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          this.ctx = new AudioContext();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    } catch (e) {
      console.warn('AudioContext init skipped:', e);
    }
  }

  playHit(combo = 0, isPerfect = false) {
    try {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = isPerfect ? 'triangle' : 'sine';
      const noteIndex = Math.min(combo, this.scale.length - 1);
      const freq = this.scale[noteIndex];

      osc.frequency.setValueAtTime(freq, now);
      if (isPerfect) {
        osc.frequency.exponentialRampToValueAtTime(freq * 1.5, now + 0.15);
      }

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + (isPerfect ? 0.35 : 0.2));

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + (isPerfect ? 0.35 : 0.2));
    } catch (e) {}
  }

  playGameOver() {
    try {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(55, now + 0.5);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.5);
    } catch (e) {}
  }
}

// 3. 메인 게임 엔진
class NeonStackGame {
  constructor() {
    this.container = document.getElementById('game-container');
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.sound = new SoundEngine();

    // DOM 요소
    this.scoreEl = document.getElementById('score');
    this.comboBox = document.getElementById('combo-box');
    this.comboCountEl = document.getElementById('combo-count');
    this.startScreen = document.getElementById('start-screen');
    this.gameOverScreen = document.getElementById('game-over-screen');
    this.startBestScoreEl = document.getElementById('start-best-score');
    this.finalScoreEl = document.getElementById('final-score');
    this.finalBestEl = document.getElementById('final-best');
    this.restartBtn = document.getElementById('restart-btn');
    this.rewardAdBtn = document.getElementById('reward-ad-btn');

    // 게임 상수 설정
    this.BLOCK_HEIGHT = 28;
    this.INITIAL_WIDTH = 220;
    this.INITIAL_DEPTH = 220;
    this.PERFECT_TOLERANCE = 6;

    // file:// 프로토콜 보안 에러 방지용 localStorage 안전 읽기
    this.bestScore = 0;
    try {
      this.bestScore = parseInt(localStorage.getItem('neon_stack_best') || '0', 10);
    } catch (e) {
      console.warn('localStorage access error:', e);
    }

    // 런타임 변수
    this.state = GameState.READY;
    this.score = 0;
    this.combo = 0;
    this.colorHue = 190;
    this.stack = [];
    this.fallingPieces = [];
    this.currentBlock = null;
    this.cameraY = 0;
    this.targetCameraY = 0;

    this.resizeCanvas();
    this.initEvents();
    this.resetGame();

    if (this.startBestScoreEl) {
      this.startBestScoreEl.innerText = this.bestScore;
    }

    // 렌더 루프 가동
    requestAnimationFrame(this.loop.bind(this));
    console.log('[NeonStack] Engine initialized successfully in READY state');
  }

  resizeCanvas() {
    const rect = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    this.width = rect.width || 360;
    this.height = rect.height || 640;
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0); // 매트릭스 리셋
    this.ctx.scale(dpr, dpr);
  }

  initEvents() {
    window.addEventListener('resize', () => this.resizeCanvas());

    // 클릭/터치 방탄 핸들러 (중복 트리거 방지 100ms 디바운스)
    let lastTapTime = 0;
    const triggerTap = (e) => {
      // 버튼 자체를 클릭한 경우 제외
      if (e.target && (e.target.tagName === 'BUTTON' || e.target.closest('button'))) {
        return;
      }
      const now = performance.now();
      if (now - lastTapTime < 80) return; // 연속 중복 입력 차단
      lastTapTime = now;

      e.preventDefault();
      this.onTap();
    };

    // 컨테이너 전체에 클릭 & 터치 리스너 부착
    this.container.addEventListener('pointerdown', triggerTap, { passive: false });

    // 시작 화면 자체 클릭
    if (this.startScreen) {
      this.startScreen.addEventListener('click', triggerTap);
    }

    // 다시 시작 버튼
    if (this.restartBtn) {
      this.restartBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.resetGame();
        this.state = GameState.PLAYING;
        this.gameOverScreen.classList.add('hidden');
      });
    }

    // 광고 보고 부활 버튼
    if (this.rewardAdBtn) {
      this.rewardAdBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.watchRewardAd();
      });
    }
  }

  resetGame() {
    this.score = 0;
    this.combo = 0;
    this.colorHue = Math.floor(Math.random() * 360);
    this.stack = [];
    this.fallingPieces = [];
    this.cameraY = 0;
    this.targetCameraY = 0;

    if (this.scoreEl) this.scoreEl.innerText = '0';
    if (this.comboBox) this.comboBox.classList.add('hidden');

    // 1층 바닥 블록
    const baseBlock = {
      x: 0,
      z: 0,
      width: this.INITIAL_WIDTH,
      depth: this.INITIAL_DEPTH,
      y: 0,
      hue: this.colorHue
    };
    this.stack.push(baseBlock);

    this.spawnNextBlock();
  }

  spawnNextBlock() {
    const topBlock = this.stack[this.stack.length - 1];
    const isEven = this.stack.length % 2 === 0;
    this.colorHue = (this.colorHue + 10) % 360;

    const axis = isEven ? 'z' : 'x';
    const speed = 3.8 + Math.min(this.score * 0.08, 6.5);

    this.currentBlock = {
      x: topBlock.x,
      z: topBlock.z,
      width: topBlock.width,
      depth: topBlock.depth,
      y: this.stack.length * this.BLOCK_HEIGHT,
      axis: axis,
      dir: 1,
      speed: speed,
      hue: this.colorHue
    };

    if (axis === 'x') {
      this.currentBlock.x = -260;
    } else {
      this.currentBlock.z = -260;
    }

    if (this.stack.length > 6) {
      this.targetCameraY = (this.stack.length - 6) * this.BLOCK_HEIGHT;
    }
  }

  onTap() {
    this.sound.init();

    // 1. 대기 상태에서 시작 상태로 전환
    if (this.state === GameState.READY) {
      console.log('[NeonStack] Game started!');
      this.state = GameState.PLAYING;
      if (this.startScreen) {
        this.startScreen.classList.add('hidden');
      }
      return;
    }

    if (this.state !== GameState.PLAYING || !this.currentBlock) return;

    const prev = this.stack[this.stack.length - 1];
    const cur = this.currentBlock;
    const axis = cur.axis;

    const delta = cur[axis] - prev[axis];
    const absDelta = Math.abs(delta);
    const sizeProp = axis === 'x' ? 'width' : 'depth';
    const originalSize = prev[sizeProp];

    // 1) 퍼펙트 스냅 판정
    if (absDelta <= this.PERFECT_TOLERANCE) {
      cur[axis] = prev[axis];
      this.combo++;
      this.sound.playHit(this.combo, true);
      this.showComboEffect(this.combo);
      this.stack.push(cur);
      this.score++;
      if (this.scoreEl) this.scoreEl.innerText = this.score;
      this.spawnNextBlock();
      return;
    }

    // 2) 완전 탈락 (게임 오버)
    if (absDelta >= originalSize) {
      this.fallingPieces.push({
        x: cur.x,
        z: cur.z,
        y: cur.y,
        width: cur.width,
        depth: cur.depth,
        hue: cur.hue,
        vy: 0
      });
      this.currentBlock = null;
      this.gameOver();
      return;
    }

    // 3) 슬라이스 처리 (AABB 자르기)
    this.combo = 0;
    if (this.comboBox) this.comboBox.classList.add('hidden');
    this.sound.playHit(0, false);

    const newSize = originalSize - absDelta;
    const fallingSize = absDelta;

    cur[sizeProp] = newSize;
    if (delta > 0) {
      cur[axis] = prev[axis] + absDelta / 2;
    } else {
      cur[axis] = prev[axis] - absDelta / 2;
    }
    this.stack.push(cur);
    this.score++;
    if (this.scoreEl) this.scoreEl.innerText = this.score;

    // 낙하 파편 생성
    const fallingPiece = {
      x: cur.x,
      z: cur.z,
      y: cur.y,
      width: cur.width,
      depth: cur.depth,
      hue: cur.hue,
      vy: 0
    };
    fallingPiece[sizeProp] = fallingSize;

    if (delta > 0) {
      fallingPiece[axis] = cur[axis] + newSize / 2 + fallingSize / 2;
    } else {
      fallingPiece[axis] = cur[axis] - newSize / 2 - fallingSize / 2;
    }

    this.fallingPieces.push(fallingPiece);
    this.spawnNextBlock();
  }

  showComboEffect(combo) {
    if (!this.comboBox || !this.comboCountEl) return;
    this.comboCountEl.innerText = 'x' + combo;
    this.comboBox.classList.remove('hidden');
    this.comboBox.classList.remove('pop');
    void this.comboBox.offsetWidth;
    this.comboBox.classList.add('pop');
  }

  gameOver() {
    this.state = GameState.GAMEOVER;
    this.sound.playGameOver();

    if (this.score > this.bestScore) {
      this.bestScore = this.score;
      try {
        localStorage.setItem('neon_stack_best', this.bestScore.toString());
      } catch (e) {}
    }

    if (this.finalScoreEl) this.finalScoreEl.innerText = this.score;
    if (this.finalBestEl) this.finalBestEl.innerText = this.bestScore;

    setTimeout(() => {
      if (this.gameOverScreen) {
        this.gameOverScreen.classList.remove('hidden');
      }
    }, 600);
  }

  watchRewardAd() {
    if (!this.rewardAdBtn) return;
    this.rewardAdBtn.disabled = true;
    const originalText = this.rewardAdBtn.innerHTML;
    this.rewardAdBtn.innerHTML = '<span>광고 시청 중... (3초)</span>';

    setTimeout(() => {
      this.rewardAdBtn.disabled = false;
      this.rewardAdBtn.innerHTML = originalText;
      if (this.gameOverScreen) {
        this.gameOverScreen.classList.add('hidden');
      }

      const top = this.stack[this.stack.length - 1];
      top.width = this.INITIAL_WIDTH;
      top.depth = this.INITIAL_DEPTH;
      top.x = 0;
      top.z = 0;

      this.state = GameState.PLAYING;
      this.spawnNextBlock();
    }, 3000);
  }

  update() {
    if (this.state === GameState.PLAYING && this.currentBlock) {
      const b = this.currentBlock;
      b[b.axis] += b.speed * b.dir;

      const LIMIT = 270;
      if (b[b.axis] > LIMIT) {
        b[b.axis] = LIMIT;
        b.dir = -1;
      } else if (b[b.axis] < -LIMIT) {
        b[b.axis] = -LIMIT;
        b.dir = 1;
      }
    }

    for (let i = this.fallingPieces.length - 1; i >= 0; i--) {
      const p = this.fallingPieces[i];
      p.vy += 0.85;
      p.y -= p.vy;

      if (p.y < this.cameraY - 450) {
        this.fallingPieces.splice(i, 1);
      }
    }

    this.cameraY += (this.targetCameraY - this.cameraY) * 0.1;
  }

  project(x, y, z) {
    const originX = this.width / 2;
    const originY = this.height * 0.68 + this.cameraY;
    const isoX = originX + (x - z) * 0.866;
    const isoY = originY + (x + z) * 0.5 - y;
    return { x: isoX, y: isoY };
  }

  drawBlock(x, y, z, width, depth, height, hue, alpha = 1.0) {
    const halfW = width / 2;
    const halfD = depth / 2;

    const p0 = this.project(x - halfW, y + height, z - halfD);
    const p1 = this.project(x + halfW, y + height, z - halfD);
    const p2 = this.project(x + halfW, y + height, z + halfD);
    const p3 = this.project(x - halfW, y + height, z + halfD);

    const b1 = this.project(x + halfW, y, z - halfD);
    const b2 = this.project(x + halfW, y, z + halfD);
    const b3 = this.project(x - halfW, y, z + halfD);

    const ctx = this.ctx;

    // 앞 왼쪽 면
    ctx.fillStyle = hsla(, 85%, 35%, );
    ctx.beginPath();
    ctx.moveTo(p3.x, p3.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(b2.x, b2.y);
    ctx.lineTo(b3.x, b3.y);
    ctx.closePath();
    ctx.fill();

    // 앞 오른쪽 면
    ctx.fillStyle = hsla(, 85%, 22%, );
    ctx.beginPath();
    ctx.moveTo(p2.x, p2.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(b1.x, b1.y);
    ctx.lineTo(b2.x, b2.y);
    ctx.closePath();
    ctx.fill();

    // 윗면
    ctx.fillStyle = hsla(, 95%, 58%, );
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = hsla(, 100%, 82%, );
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  render() {
    this.ctx.clearRect(0, 0, this.width, this.height);

    for (let i = 0; i < this.stack.length; i++) {
      const b = this.stack[i];
      this.drawBlock(b.x, b.y, b.z, b.width, b.depth, this.BLOCK_HEIGHT, b.hue);
    }

    for (let i = 0; i < this.fallingPieces.length; i++) {
      const p = this.fallingPieces[i];
      this.drawBlock(p.x, p.y, p.z, p.width, p.depth, this.BLOCK_HEIGHT, p.hue, 0.85);
    }

    if (this.currentBlock) {
      const c = this.currentBlock;
      this.drawBlock(c.x, c.y, c.z, c.width, c.depth, this.BLOCK_HEIGHT, c.hue);
    }
  }

  loop() {
    this.update();
    this.render();
    requestAnimationFrame(this.loop.bind(this));
  }
}

// 브라우저 로딩 즉시 초기화
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new NeonStackGame());
} else {
  new NeonStackGame();
}
