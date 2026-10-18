import { CFG } from './config.js';
import { loadImage } from './imageAsset.js'; // ★ 引入统一图片加载层

/* =========================================================
 *  素材路径
 * ========================================================= */
const BLOCK_BASE_1 = '../image/game/blocks/gameSprite1/';
const BLOCK_BASE_2 = '../image/game/blocks/gameSprite2/';
const BLOCK_BASE_3 = '../image/game/blocks/gameSprite3/';
const LINE_SRC   = '../image/game/ING/line1.png';

/* =========================================================
 *  光晕色板
 * ========================================================= */
const WORMHOLE_GLOW = ['#ff5e5e', '#5eff8a', '#5ec8ff', '#ff5edb', '#ffff5e', '#ff8a5e', '#c65eff'];
const SINGULARITY_GLOW = ['#ff3b5c', '#3bc6ff', '#b0ff3b', '#a03bff'];

/* =========================================================
 *  缩放参数
 * ========================================================= */
const SOLID_BOOST = 1.25;
const SOLID_SCALE_OVERRIDE = null;
const SOLID_RATIO_MIN = 0.60;
const SOLID_RATIO_MAX = 1.00;
const BBOX_ALPHA_MIN = 128;

/* =========================================================
 *  图片工具
 * ========================================================= */
function invertImage(img) {
  const w = img.naturalWidth  || img.width  || 1;
  const h = img.naturalHeight || img.height || 1;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  try {
    const data = ctx.getImageData(0, 0, w, h);
    const d = data.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i]     = 255 - d[i];
      d[i + 1] = 255 - d[i + 1];
      d[i + 2] = 255 - d[i + 2];
    }
    ctx.putImageData(data, 0, 0);
  } catch (_) {
    ctx.clearRect(0, 0, w, h);
    ctx.filter = 'invert(1)';
    ctx.drawImage(img, 0, 0);
    ctx.filter = 'none';
  }
  if (img.__od !== undefined) c.__od = img.__od;
  return c;
}

function getOpaqueDiameter(img, alphaMin = BBOX_ALPHA_MIN) {
  if (!img) return 0;
  if (img.__od !== undefined) return img.__od;
  const w = img.naturalWidth  || img.width  || 0;
  const h = img.naturalHeight || img.height || 0;
  if (!w || !h) { img.__od = 0; return 0; }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  let data;
  try { data = ctx.getImageData(0, 0, w, h).data; }
  catch (_) { img.__od = Math.max(w, h); return img.__od; }
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      if (data[row + x * 4 + 3] >= alphaMin) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) img.__od = 0;
  else img.__od = Math.max(maxX - minX + 1, maxY - minY + 1);
  return img.__od;
}

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

/* =========================================================
 *  Renderer
 * ========================================================= */
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.W = 0; this.H = 0;
    this.size = 40;
    this.padX = 0; this.padY = 0;
    this.rows = 1; this.cols = 1;
    this.chapter = 1;
    this.mode = 1;

    this.img = {};
    this.imagesReady = false;
    this._t0 = performance.now();

    this.solidScale = 1;
    this.solidStartScale = {};
  }

  setMode(mode) {
    if (this.mode === mode && this.imagesReady) return;
    this.mode = mode;
    this._preloadAll();
  }

  async _preloadAll() {
    this.imagesReady = false;
    this.img = {
      white: null, whiteInv: null,
      wall: null, wallInv:  null,
      trap: null, trapInv:  null,
      start: {},   startInv: {},
      wormhole: null, wormholeInv: null,
      singularity: null, singularityInv: null,
      solid_black: null, solid_white: null,
      hollow_black: null, hollow_white: null,
      startSolid: {}, startSolidInv: {},
      startHollow: {}, startHollowInv: {},
      fakeSolid: null, fakeSolidInv: null,
      fakeHollow: null, fakeHollowInv: null,
      line: null
    };

    const tasks = [];

    if (this.mode === 1) {
      tasks.push(loadImage(BLOCK_BASE_1 + 'game1_2.png').then(img => {
        this.img.white = img; this.img.whiteInv = invertImage(img);
      }).catch(() => {}));
      tasks.push(loadImage(BLOCK_BASE_1 + 'game1_7.png').then(img => {
        this.img.wall = img; this.img.wallInv = invertImage(img);
      }).catch(() => {}));
      tasks.push(loadImage(BLOCK_BASE_1 + 'game1_9.png').then(img => {
        this.img.trap = img; this.img.trapInv = invertImage(img);
      }).catch(() => {}));
      for (let ch = 1; ch <= 11; ch++) {
        tasks.push(loadImage(BLOCK_BASE_1 + 'game1_' + ch + '_4.png').then(img => {
          this.img.start[ch] = img; this.img.startInv[ch] = invertImage(img);
        }).catch(() => {}));
      }
    } else if (this.mode === 2) {
      tasks.push(loadImage(BLOCK_BASE_2 + 'game2_202.png').then(img => {
        this.img.solid_white = img;
        this.img.solid_black = invertImage(img);
      }).catch(() => {}));
      tasks.push(loadImage(BLOCK_BASE_2 + 'game2_252.png').then(img => {
        this.img.hollow_white = img;
        this.img.hollow_black = invertImage(img);
      }).catch(() => {}));
      tasks.push(loadImage(BLOCK_BASE_2 + 'game2_208.png').then(img => {
        this.img.fakeSolid     = img;
        this.img.fakeSolidInv  = invertImage(img);
      }).catch(() => {}));
      tasks.push(loadImage(BLOCK_BASE_2 + 'game2_258.png').then(img => {
        this.img.fakeHollow    = img;
        this.img.fakeHollowInv = invertImage(img);
      }).catch(() => {}));

      for (let ch = 1; ch <= 6; ch++) {
        tasks.push(loadImage(BLOCK_BASE_2 + 'game2_' + ch + '_204.png').then(img => {
          this.img.startSolid[ch]    = img;
          this.img.startSolidInv[ch] = invertImage(img);
        }).catch(() => {}));
        tasks.push(loadImage(BLOCK_BASE_2 + 'game2_' + ch + '_254.png').then(img => {
          this.img.startHollow[ch]    = img;
          this.img.startHollowInv[ch] = invertImage(img);
        }).catch(() => {}));
      }
    } else if (this.mode === 3) {
      tasks.push(loadImage(BLOCK_BASE_3 + 'game3_302.png').then(img => {
        this.img.white = img; this.img.whiteInv = invertImage(img);
      }).catch(() => {}));
      tasks.push(loadImage(BLOCK_BASE_3 + 'game3_312.png').then(img => {
        this.img.trap = img; this.img.trapInv = invertImage(img);
      }).catch(() => {}));
      tasks.push(loadImage(BLOCK_BASE_3 + 'game3_352.png').then(img => {
        this.img.wormhole = img; this.img.wormholeInv = invertImage(img);
      }).catch(() => {}));
      tasks.push(loadImage(BLOCK_BASE_3 + 'game3_354.png').then(img => {
        this.img.singularity    = img;
        this.img.singularityInv = invertImage(img);
      }).catch(() => {}));
      for (let ch = 1; ch <= 7; ch++) {
        tasks.push(loadImage(BLOCK_BASE_3 + 'game3_' + ch + '_304.png').then(img => {
          this.img.start[ch] = img; this.img.startInv[ch] = invertImage(img);
        }).catch(() => {}));
      }
    }

    tasks.push(loadImage(LINE_SRC).then(img => { this.img.line = img; }).catch(() => {}));

    await Promise.all(tasks);
    this.imagesReady = true;

    if (this.mode === 2) {
      const dSolid  = getOpaqueDiameter(this.img.solid_white);
      const dHollow = getOpaqueDiameter(this.img.hollow_white);
      if (dSolid > 0 && dHollow > 0) {
        const ratio = clamp(dHollow / dSolid, SOLID_RATIO_MIN, SOLID_RATIO_MAX);
        this.solidScale = ratio * SOLID_BOOST;
      } else {
        this.solidScale = SOLID_BOOST;
      }

      for (let ch = 1; ch <= 6; ch++) {
        const d204 = getOpaqueDiameter(this.img.startSolid[ch]);
        const d254 = getOpaqueDiameter(this.img.startHollow[ch]);
        if (d204 > 0 && d254 > 0) {
          const ratio = clamp(d254 / d204, SOLID_RATIO_MIN, SOLID_RATIO_MAX);
          this.solidStartScale[ch] = ratio * SOLID_BOOST;
        } else {
          this.solidStartScale[ch] = SOLID_BOOST;
        }
      }
    }
  }

  layout(logicalW, logicalH, rows, cols, chapter) {
    this.rows = rows; this.cols = cols;
    this.W = logicalW; this.H = logicalH;
    if (chapter && chapter >= 1) this.chapter = chapter;

    const dpr = Math.min(window.devicePixelRatio || 1, CFG.dprMax);

    this.canvas.style.width  = logicalW + 'px';
    this.canvas.style.height = logicalH + 'px';
    this.canvas.width  = Math.round(logicalW * dpr);
    this.canvas.height = Math.round(logicalH * dpr);

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const p   = CFG.padRatio;
    const byW = logicalW / (cols + p * 2);
    const byH = logicalH / (rows + p * 2);
    this.size = Math.max(CFG.minCell, Math.min(byW, byH));

    this.padX = (logicalW - cols * this.size) / 2;
    this.padY = (logicalH - rows * this.size) / 2;
  }

  hit(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const x = (clientX - rect.left) * (this.W / rect.width);
    const y = (clientY - rect.top ) * (this.H / rect.height);
    const c = Math.floor((x - this.padX) / this.size);
    const r = Math.floor((y - this.padY) / this.size);
    if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return null;
    return { r, c };
  }

  draw(game) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);
    if (!game.level) return;

    const t = (performance.now() - this._t0) / 1000;
    const lv = game.level;
    for (let r = 0; r < lv.rows; r++) {
      for (let c = 0; c < lv.cols; c++) {
        this._drawCell(lv.cells[r][c], r, c, game.path, t);
      }
    }

    const hint = game.currentHint;
    if (hint) this._drawHint(hint);

    this._drawPath(game.path, t);
  }

  _drawCell(cell, r, c, path, t) {
    if (cell.empty) return;
    const size = this.size;
    const cx = this.padX + c * size + size / 2;
    const cy = this.padY + r * size + size / 2;

    let scale = 1;
    if (cell.pulse > 0) {
      const k = 1 - cell.pulse;
      scale = 1 + 0.25 * Math.sin(k * Math.PI);
    }

    const ctx = this.ctx;
    ctx.save();
    ctx.translate(cx, cy);

    const onPath = path.length > 1 && path.some(p => p.r === r && p.c === c);
    if (onPath) {
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.46, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(150,195,255,.45)';
      ctx.lineWidth = Math.max(1.5, size * 0.03);
      ctx.stroke();
    }

    ctx.scale(scale, scale);
    this._drawCellContent(cell, size);
    ctx.restore();
  }

  _drawGlow(colorHex, size, alpha = 0.65, radius = 0.6) {
    const ctx = this.ctx;
    ctx.save();
    const grad = ctx.createRadialGradient(0, 0, size * 0.1, 0, 0, size * radius);
    grad.addColorStop(0, colorHex);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(0, 0, size * radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _mode2StartImg(hollow, color) {
    const ch = this.chapter;
    if (hollow) return color === 1 ? this.img.startHollowInv[ch] : this.img.startHollow[ch];
    return color === 1 ? this.img.startSolidInv[ch] : this.img.startSolid[ch];
  }

  _mode2BaseImg(hollow, color) {
    if (hollow) return color === 1 ? this.img.hollow_black : this.img.hollow_white;
    return color === 1 ? this.img.solid_black : this.img.solid_white;
  }

  _mode2FakeStartImg(hollow, color) {
    if (hollow) return color === 1 ? this.img.fakeHollowInv : this.img.fakeHollow;
    return color === 1 ? this.img.fakeSolidInv : this.img.fakeSolid;
  }

  _solidBaseScale() {
    if (SOLID_SCALE_OVERRIDE !== null) return SOLID_SCALE_OVERRIDE;
    return this.solidScale;
  }

  _solidStartScale(ch) {
    if (SOLID_SCALE_OVERRIDE !== null) return SOLID_SCALE_OVERRIDE;
    return this.solidStartScale[ch] ?? 1;
  }

  _drawCellContent(cell, size) {
    const ctx = this.ctx;

    /* ---------- mode2 ---------- */
    if (this.mode === 2) {
      if (cell.fakeStart) {
        const fromImg = this._mode2FakeStartImg(cell.hollow, cell.fromColor);
        const toImg   = this._mode2FakeStartImg(cell.hollow, cell.color);
        const extra   = cell.hollow ? 1 : this._solidBaseScale();

        if (cell.anim > 0) {
          const a = cell.anim;
          ctx.globalAlpha = a;
          this._drawImgCentered(fromImg, size, extra);
          ctx.globalAlpha = 1 - a;
          this._drawImgCentered(toImg, size, extra);
          ctx.globalAlpha = 1;
        } else {
          this._drawImgCentered(toImg || fromImg, size, extra);
        }
        return;
      }

      if (cell.start) {
        const fromImg = this._mode2StartImg(cell.hollow, cell.fromColor);
        const toImg   = this._mode2StartImg(cell.hollow, cell.color);
        const extra   = cell.hollow ? 1 : this._solidStartScale(this.chapter);

        if (cell.anim > 0) {
          const a = cell.anim;
          ctx.globalAlpha = a;
          this._drawImgCentered(fromImg, size, extra);
          ctx.globalAlpha = 1 - a;
          this._drawImgCentered(toImg, size, extra);
          ctx.globalAlpha = 1;
        } else {
          this._drawImgCentered(toImg || fromImg, size, extra);
        }
        return;
      }

      const fromImg = this._mode2BaseImg(cell.hollow, cell.fromColor);
      const toImg   = this._mode2BaseImg(cell.hollow, cell.color);
      const extra   = cell.hollow ? 1 : this._solidBaseScale();

      if (cell.anim > 0) {
        const a = cell.anim;
        ctx.globalAlpha = a;
        this._drawImgCentered(fromImg, size, extra);
        ctx.globalAlpha = 1 - a;
        this._drawImgCentered(toImg, size, extra);
        ctx.globalAlpha = 1;
      } else {
        this._drawImgCentered(toImg, size, extra);
      }

      if (cell.fade > 0) {
        let sImg = null;
        if (cell.fadeType === 'fake') {
          sImg = this._mode2FakeStartImg(cell.hollow, cell.fromColor);
        } else {
          sImg = this._mode2StartImg(cell.hollow, cell.fromColor);
        }
        if (sImg) {
          ctx.globalAlpha = cell.fade;
          this._drawImgCentered(sImg, size, extra);
          ctx.globalAlpha = 1;
        }
      }
      return;
    }

    /* ---------- 虫洞（含交换动画） ---------- */
    if (cell.wormhole) {
      let dx = 0, dy = 0, scale = 1;
      if (cell.wormholeSwap) {
        const p = Math.min(1, cell.wormholeSwap.progress);
        const t = p * p * (3 - 2 * p);
        const fromX = (cell.wormholeSwap.fromC - cell.wormholeSwap.toC) * size;
        const fromY = (cell.wormholeSwap.fromR - cell.wormholeSwap.toR) * size;
        dx = fromX * (1 - t);
        dy = fromY * (1 - t);
        scale = 1 + 0.3 * Math.sin(p * Math.PI);
      }

      ctx.save();
      ctx.translate(dx, dy);
      ctx.scale(scale, scale);

      const img = cell.color === 1 ? this.img.wormhole : (this.img.wormholeInv || this.img.wormhole);
      if (cell.wormholeColor !== undefined) {
        const glow = WORMHOLE_GLOW[cell.wormholeColor % WORMHOLE_GLOW.length];
        this._drawGlow(glow, size, 0.65, 0.72); 
      }
      
      if (img) this._drawImgCentered(img, size);
      else     this._drawImgCentered(cell.color === 1 ? this.img.white : this.img.whiteInv, size);
      
      ctx.restore();
      return;
    }

    /* ---------- 奇点 ---------- */
    if (cell.singularity) {
      const idx  = (cell.singularityColor || 0) % SINGULARITY_GLOW.length;
      this._drawGlow(SINGULARITY_GLOW[idx], size, 0.72, 0.768);
      const img = cell.color === 1
        ? this.img.singularity
        : (this.img.singularityInv || this.img.singularity);
      if (img) this._drawImgCentered(img, size);
      else     this._drawImgCentered(cell.color === 1 ? this.img.white : this.img.whiteInv, size);
      return;
    }

    /* ---------- 起点（mode1 / mode3） ---------- */
    if (cell.start) {
      const fromImg = this._startImgFor(cell.fromColor);
      const toImg   = this._startImgFor(cell.color);
      if (cell.anim > 0) {
        const a = cell.anim;
        ctx.globalAlpha = a;
        this._drawImgCentered(fromImg, size);
        ctx.globalAlpha = 1 - a;
        this._drawImgCentered(toImg, size);
        ctx.globalAlpha = 1;
      } else {
        this._drawImgCentered(toImg, size);
      }
      return;
    }

    /* ---------- 普通块（mode1 / mode3） ---------- */
    const fromImg = this._baseImgFor(cell, cell.fromColor);
    const toImg   = this._baseImgFor(cell, cell.color);
    if (cell.anim > 0) {
      const a = cell.anim;
      ctx.globalAlpha = a;
      this._drawImgCentered(fromImg, size);
      ctx.globalAlpha = 1 - a;
      this._drawImgCentered(toImg, size);
      ctx.globalAlpha = 1;
    } else {
      this._drawImgCentered(toImg, size);
    }

    if (cell.fade > 0) {
      const sImg = this._startImgFor(cell.fromColor);
      if (sImg) {
        ctx.globalAlpha = cell.fade;
        this._drawImgCentered(sImg, size);
        ctx.globalAlpha = 1;
      }
    }
  }

  _baseImgFor(cell, color) {
    if (cell.fix && this.img.wall) return color === 1 ? this.img.wall : this.img.wallInv;
    if (cell.trap && this.img.trap) return color === 1 ? this.img.trap : this.img.trapInv;
    return color === 1 ? this.img.white : this.img.whiteInv;
  }

  _startImgFor(color) {
    const map = color === 1 ? this.img.start : this.img.startInv;
    return map[this.chapter] || null;
  }

  _drawImgCentered(img, size, extra = 1) {
    if (!img) return;
    
    // 根据模式设定基础倍数：mode 2 = 0.75，mode 1/3 = 1.0
    const baseScale = (this.mode === 2) ? 0.75 : 1.0;
    
    const target = size * baseScale * extra;
    const iw = img.naturalWidth  || img.width  || 1;
    const ih = img.naturalHeight || img.height || 1;
    const s  = Math.min(target / iw, target / ih);
    const dw = iw * s;
    const dh = ih * s;
    this.ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  }

  _drawPath(path, t) {
    if (path.length < 2) return;
    const ctx  = this.ctx;
    const size = this.size;
    const img  = this.img.line;
    const px = p => this.padX + p.c * size + size / 2;
    const py = p => this.padY + p.r * size + size / 2;

    if (!img) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(px(path[0]), py(path[0]));
      for (let i = 1; i < path.length; i++) ctx.lineTo(px(path[i]), py(path[i]));
      ctx.lineCap  = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = size * 0.055;
      ctx.strokeStyle = 'rgba(190,222,255,.62)';
      ctx.shadowColor = 'rgba(120,180,255,.9)';
      ctx.shadowBlur  = size * 0.35;
      ctx.stroke();
      ctx.restore();
      return;
    }

    const sw = img.naturalWidth  || img.width;
    const sh = img.naturalHeight || img.height;
    const strokeH = size * 0.42;

    ctx.save();
    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';

    for (let i = 1; i < path.length; i++) {
      const x1 = px(path[i - 1]), y1 = py(path[i - 1]);
      const x2 = px(path[i]),     y2 = py(path[i]);
      const dx = x2 - x1, dy = y2 - y1;
      const L = Math.hypot(dx, dy);
      if (L < 0.5) continue;
      const angle = Math.atan2(dy, dx);

      const seed = ((x1 * 73 + y1 * 137 + x2 * 31 + y2 * 71) | 0);
      const rand = ((seed * 9301 + 49297) % 233280) / 233280;

      ctx.save();
      ctx.translate(x1, y1);
      ctx.rotate(angle);

      ctx.beginPath();
      ctx.rect(0, -strokeH / 2, L, strokeH);
      ctx.clip();

      if (L <= sw) {
        const maxOffset = sw - L;
        const period = 3.2;
        const phase  = ((t / period) + rand) % 1;
        const tri    = 1 - Math.abs(2 * phase - 1);
        const offset = tri * maxOffset;
        ctx.drawImage(img, offset, 0, L, sh, 0, -strokeH / 2, L, strokeH);
      } else {
        const speed  = 90;
        const offset = ((t * speed + rand * sw) % sw + sw) % sw;
        for (let sx = -offset; sx < L; sx += sw) {
          ctx.drawImage(img, 0, 0, sw, sh, sx, -strokeH / 2, sw, strokeH);
        }
      }
      ctx.restore();
    }
    ctx.restore();
  }

  _drawHint(path) {
    if (!path || path.length < 2) return;
    const ctx  = this.ctx;
    const size = this.size;
    const px = p => this.padX + p.c * size + size / 2;
    const py = p => this.padY + p.r * size + size / 2;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(px(path[0]), py(path[0]));
    for (let i = 1; i < path.length; i++) ctx.lineTo(px(path[i]), py(path[i]));
    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';

    ctx.lineWidth = size * 0.18;
    ctx.strokeStyle = 'rgba(255,180,80,.14)';
    ctx.stroke();

    ctx.lineWidth = size * 0.06;
    ctx.strokeStyle = 'rgba(255,200,120,.72)';
    ctx.shadowColor = 'rgba(255,170,60,.9)';
    ctx.shadowBlur  = size * 0.4;
    ctx.stroke();
    ctx.shadowBlur = 0;

    const s = path[0];
    const e = path[path.length - 1];

    ctx.beginPath();
    ctx.arc(px(s), py(s), size * 0.12, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,220,140,.9)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(px(e), py(e), size * 0.14, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,220,140,.9)';
    ctx.lineWidth = Math.max(1.5, size * 0.045);
    ctx.stroke();
    ctx.restore();
  }
}