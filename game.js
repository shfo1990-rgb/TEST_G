/**
 * ============================================================================
 * NEON STACK: CYBER TOWER
 * ============================================================================
 * C++ MFC 대응 개념:
 * - GameEngine     : CWinApp / Main Frame Controller
 * - Canvas 2D      : CDC / OnPaint() GDI 렌더러
 * - Game Loop      : OnTimer() / High-Resolution Multimedia Loop (60 FPS)
 * - SoundEngine    : DirectSound / Web Audio API 사운드 합성기
 * ============================================================================
 */

// 1. 게임 상태 정의 (MFC의 enum class와 동일)
const GameState = {
  READY: 'READY',
  PLAYING: 'PLAYING',
  GAMEOVER: 'GAMEOVER'
};

// 2. 사운드 합성 엔진 (Web Audio API - 외부 음원 파일 없이 코드로 주파수 합성)
class SoundEngine {
  constructor() {
    this.ctx = null;
    // 도레미파솔라시도 주파수 (Hz)
    this.scale = [261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88, 523.25, 587.33, 659.25, 783.99, 880.00];
  }

  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // 콤보/일반 착지 사운드
  playHit(combo = 0, isPerfect = false) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = isPerfect ? 'triangle' : 'sine';
    const noteIndex = Math.min(combo, this.scale.length - 1);
    const freq = this.scale[noteIndex];

    osc.frequency.setValueAtTime(freq, now);
    if (isPerfect) {
      // 퍼펙트일 때 고음 하모닉스 추가
      osc.frequency.exponentialRampToValueAtTime(freq * 1.5, now + 0.15);
    }

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isPerfect ? 0.35 : 0.2));

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + (isPerfect ? 0.35 : 0.2));
  }

  // 게임 오버 사운드
  playGameOver() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.5);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.5);
  }
}

// 3. 메인 게임 엔진
class NeonStackGame {
  constructor() {
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
    this.BLOCK_HEIGHT = 28;    // 각 블록의 두께
    this.INITIAL_WIDTH = 220;  // 시작 블록 폭
    this.INITIAL_DEPTH = 220;  // 시작 블록 깊이 (등각투영)
    this.PERFECT_TOLERANCE = 5; // 퍼펙트 판정 허용 오차 (픽셀)

    // 게임 런타임 변수
    this.state = GameState.READY;
    this.score = 0;
    this.bestScore = parseInt(localStorage.getItem('neon_stack_best') || '0', 10);
    this.combo = 0;
    this.colorHue = 180; // HSL 색상 기준값 (층마다 회전)

    this.stack = [];          // 고정된 블록 배열
    this.fallingPieces = [];  // 잘려나간 뒤 추락하는 파편 배열
    this.currentBlock = null; // 현재 좌우/앞뒤로 움직이는 블록
    this.cameraY = 0;         // 타워가 높아질 때 아래로 내리는 카메라 Y 오프셋
    this.targetCameraY = 0;

    this.resizeCanvas();
    this.initEvents();
    this.resetGame();

    this.startBestScoreEl.innerText = this.bestScore;

    // 게임 루프 시작 (MFC의 OnTimer 또는 멀티미디어 루프)
    requestAnimationFrame(this.loop.bind(this));
  }

  // 캔버스 크기 화면에 맞춤 (DPI 스케일링 적용으로 선명도 확보)
  resizeCanvas() {
    const container = document.getElementById('game-container');
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.ctx.scale(dpr, dpr);
  }

  // 이벤트 핸들러 등록
  initEvents() {
    window.addEventListener('resize', () => this.resizeCanvas());

    // 클릭 / 터치 입력
    const handleTap = (e) => {
      // 버튼 클릭 시에는 전체 탭 이벤트 방지
      if (e.target.tagName === 'BUTTON') return;
      this.onTap();
    };

    this.canvas.addEventListener('pointerdown', handleTap);
    this.startScreen.addEventListener('pointerdown', handleTap);

    this.restartBtn.addEventListener('click', () => {
      this.resetGame();
      this.state = GameState.PLAYING;
      this.gameOverScreen.classList.add('hidden');
    });

    // 보상형 광고 시뮬레이션 (수익화 로직)
    this.rewardAdBtn.addEventListener('click', () => {
      this.watchRewardAd();
    });
  }

  // 게임 초기화
  resetGame() {
    this.score = 0;
    this.combo = 0;
    this.colorHue = Math.floor(Math.random() * 360);
    this.stack = [];
    this.fallingPieces = [];
    this.cameraY = 0;
    this.targetCameraY = 0;

    this.scoreEl.innerText = '0';
    this.comboBox.classList.add('hidden');

    // 베이스 기초 블록 생성
    const baseBlock = {
      x: 0,
      z: 0,
      width: this.INITIAL_WIDTH,
      depth: this.INITIAL_DEPTH,
      y: 0,
      hue: this.colorHue
    };
    this.stack.push(baseBlock);

    // 첫 번째 움직이는 블록 스폰
    this.spawnNextBlock();
  }

  // 다음 이동 블록 생성
  spawnNextBlock() {
    const topBlock = this.stack[this.stack.length - 1];
    const isEven = this.stack.length % 2 === 0;
    this.colorHue = (this.colorHue + 9) % 360;

    // 홀수 층: X축 이동, 짝수 층: Z축 이동
    const axis = isEven ? 'z' : 'x';
    const speed = 3.5 + Math.min(this.score * 0.08, 6.0); // 층이 높아질수록 점진적 가속

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

    // 이동 축의 시작 위치를 화면 밖으로 세팅
    if (axis === 'x') {
      this.currentBlock.x = -260;
    } else {
      this.currentBlock.z = -260;
    }

    // 카메라 타겟 계산 (블록이 5층 이상 쌓이면 점차 화면을 아래로 내림)
    if (this.stack.length > 6) {
      this.targetCameraY = (this.stack.length - 6) * this.BLOCK_HEIGHT;
    }
  }

  // 터치 / 클릭 처리 (AABB 슬라이스 알고리즘)
  onTap() {
    this.sound.init();

    if (this.state === GameState.READY) {
      this.state = GameState.PLAYING;
      this.startScreen.classList.add('hidden');
      return;
    }

    if (this.state !== GameState.PLAYING || !this.currentBlock) return;

    const prev = this.stack[this.stack.length - 1];
    const cur = this.currentBlock;
    const axis = cur.axis;

    // 차이 계산 (Delta)
    const delta = cur[axis] - prev[axis];
    const absDelta = Math.abs(delta);
    const sizeProp = axis === 'x' ? 'width' : 'depth';
    const originalSize = prev[sizeProp];

    // 1. 퍼펙트 판정 (오차가 허용치 이내면 자동 스냅 & 블록 크기 유지)
    if (absDelta <= this.PERFECT_TOLERANCE) {
      cur[axis] = prev[axis];
      this.combo++;
      this.sound.playHit(this.combo, true);
      this.showComboEffect(this.combo);
      this.stack.push(cur);
      this.score++;
      this.scoreEl.innerText = this.score;
      this.spawnNextBlock();
      return;
    }

    // 2. 완벽히 빗나간 경우 (게임 오버)
    if (absDelta >= originalSize) {
      // 현재 블록 전체가 파편이 되어 추락
      this.fallingPieces.push({
        x: cur.x,
        z: cur.z,
        y: cur.y,
        width: cur.width,
        depth: cur.depth,
        hue: cur.hue,
        vy: 0,
        rotX: (Math.random() - 0.5) * 0.1,
        rotZ: (Math.random() - 0.5) * 0.1
      });
      this.currentBlock = null;
      this.gameOver();
      return;
    }

    // 3. 잘라내기 (Slice AABB)
    this.combo = 0; // 콤보 리셋
    this.comboBox.classList.add('hidden');
    this.sound.playHit(0, false);

    const newSize = originalSize - absDelta;
    const fallingSize = absDelta;

    // 고정될 새 블록
    cur[sizeProp] = newSize;
    if (delta > 0) {
      // 오른쪽/앞쪽으로 삐져나온 경우
      cur[axis] = prev[axis] + absDelta / 2;
    } else {
      // 왼쪽/뒤쪽으로 삐져나온 경우
      cur[axis] = prev[axis] - absDelta / 2;
    }
    this.stack.push(cur);
    this.score++;
    this.scoreEl.innerText = this.score;

    // 잘려나간 추락 파편 생성
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

  // 콤보 HUD 애니메이션
  showComboEffect(combo) {
    this.comboCountEl.innerText = 'x' + combo;
    this.comboBox.classList.remove('hidden');
    this.comboBox.classList.remove('pop');
    void this.comboBox.offsetWidth; // DOM Reflow 트리거
    this.comboBox.classList.add('pop');
  }

  // 게임 오버
  gameOver() {
    this.state = GameState.GAMEOVER;
    this.sound.playGameOver();

    if (this.score > this.bestScore) {
      this.bestScore = this.score;
      localStorage.setItem('neon_stack_best', this.bestScore.toString());
    }

    this.finalScoreEl.innerText = this.score;
    this.finalBestEl.innerText = this.bestScore;

    // 약간의 딜레이 후 게임오버 창 표시
    setTimeout(() => {
      this.gameOverScreen.classList.remove('hidden');
    }, 600);
  }

  // 보상형 광고 시뮬레이션 (부활)
  watchRewardAd() {
    this.rewardAdBtn.disabled = true;
    const originalText = this.rewardAdBtn.innerHTML;
    this.rewardAdBtn.innerHTML = '<span>광고 시청 중... (3초)</span>';

    setTimeout(() => {
      this.rewardAdBtn.disabled = false;
      this.rewardAdBtn.innerHTML = originalText;
      this.gameOverScreen.classList.add('hidden');

      // 부활 처리: 마지막 블록 크기를 초기 최대 크기로 복구하고 이어서 플레이!
      const top = this.stack[this.stack.length - 1];
      top.width = this.INITIAL_WIDTH;
      top.depth = this.INITIAL_DEPTH;
      top.x = 0;
      top.z = 0;

      this.state = GameState.PLAYING;
      this.spawnNextBlock();
    }, 3000);
  }

  // 물리 및 위치 업데이트 (MFC의 상태 업데이트)
  update() {
    // 1. 현재 블록 왕복 이동
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

    // 2. 추락 파편 중력 계산
    for (let i = this.fallingPieces.length - 1; i >= 0; i--) {
      const p = this.fallingPieces[i];
      p.vy += 0.8; // 중력 가속도
      p.y -= p.vy;

      // 화면 아래로 완전히 사라지면 배열에서 제거
      if (p.y < this.cameraY - 400) {
        this.fallingPieces.splice(i, 1);
      }
    }

    // 3. 카메라 부드러운 이동 (Lerp 보간)
    this.cameraY += (this.targetCameraY - this.cameraY) * 0.1;
  }

  // 등각 투영(Isometric) 3D 좌표 변환
  // 3D (x, y, z) ➡️ 2D Canvas (screenX, screenY)
  project(x, y, z) {
    const originX = this.width / 2;
    const originY = this.height * 0.68 + this.cameraY;

    // 30도 등각투영 공식
    const isoX = originX + (x - z) * 0.866;
    const isoY = originY + (x + z) * 0.5 - y;

    return { x: isoX, y: isoY };
  }

  // 3D 큐브 블록 그리기
  drawBlock(x, y, z, width, depth, height, hue, alpha = 1.0) {
    const halfW = width / 2;
    const halfD = depth / 2;

    // 8개 꼭짓점 계산
    const p0 = this.project(x - halfW, y + height, z - halfD); // 윗면 뒤
    const p1 = this.project(x + halfW, y + height, z - halfD); // 윗면 우
    const p2 = this.project(x + halfW, y + height, z + halfD); // 윗면 앞
    const p3 = this.project(x - halfW, y + height, z + halfD); // 윗면 좌

    const b1 = this.project(x + halfW, y, z - halfD);          // 밑면 우
    const b2 = this.project(x + halfW, y, z + halfD);          // 밑면 앞
    const b3 = this.project(x - halfW, y, z + halfD);          // 밑면 좌

    const ctx = this.ctx;

    // 1. 앞쪽 왼쪽 면 (Front-Left Side)
    ctx.fillStyle = hsla(, 85%, 35%, );
    ctx.beginPath();
    ctx.moveTo(p3.x, p3.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(b2.x, b2.y);
    ctx.lineTo(b3.x, b3.y);
    ctx.closePath();
    ctx.fill();

    // 2. 앞쪽 오른쪽 면 (Front-Right Side)
    ctx.fillStyle = hsla(, 85%, 22%, );
    ctx.beginPath();
    ctx.moveTo(p2.x, p2.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(b1.x, b1.y);
    ctx.lineTo(b2.x, b2.y);
    ctx.closePath();
    ctx.fill();

    // 3. 윗면 (Top Face - 네온 발광)
    ctx.fillStyle = hsla(, 95%, 58%, );
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.closePath();
    ctx.fill();

    // 윗면 네온 테두리 선
    ctx.strokeStyle = hsla(, 100%, 80%, );
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // 렌더링 루프 (MFC의 OnPaint/OnDraw)
  render() {
    this.ctx.clearRect(0, 0, this.width, this.height);

    // 1. 쌓여있는 고정 블록 렌더링
    for (let i = 0; i < this.stack.length; i++) {
      const b = this.stack[i];
      this.drawBlock(b.x, b.y, b.z, b.width, b.depth, this.BLOCK_HEIGHT, b.hue);
    }

    // 2. 잘려나가 떨어지는 파편 렌더링
    for (let i = 0; i < this.fallingPieces.length; i++) {
      const p = this.fallingPieces[i];
      this.drawBlock(p.x, p.y, p.z, p.width, p.depth, this.BLOCK_HEIGHT, p.hue, 0.85);
    }

    // 3. 현재 이동 중인 블록 렌더링
    if (this.currentBlock) {
      const c = this.currentBlock;
      this.drawBlock(c.x, c.y, c.z, c.width, c.depth, this.BLOCK_HEIGHT, c.hue);
    }
  }

  // 메인 게임 루프
  loop() {
    this.update();
    this.render();
    requestAnimationFrame(this.loop.bind(this));
  }
}

// 윈도우 로드 시 게임 인스턴스 생성
window.addEventListener('DOMContentLoaded', () => {
  new NeonStackGame();
});
