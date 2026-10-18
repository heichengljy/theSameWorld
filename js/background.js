/* =========================================================
 *  js/background.js — 背景渲染 / 切换统一控制器
 * ========================================================= */
import { loadImage } from './imageAsset.js'; // ★ 统一引入

const BG_DIR  = '../image/bg_title/';
const MAX_CH  = 11;
const bgUrl = ch => `${BG_DIR}bg_${ch}.jpg`;

const clampChapter = ch => {
  const n = parseInt(ch, 10);
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_CH, Math.max(1, n));
};

/* =========================================================
 *  预解码缓存
 * ========================================================= */
const _cache = {};
let _cachePromise = null;

function preloadOne(ch) {
  ch = clampChapter(ch);
  if (_cache[ch]) return Promise.resolve(_cache[ch]);
  return loadImage(bgUrl(ch)).then(img => {
    _cache[ch] = img;
    return img;
  }).catch(() => null);
}

export function preloadAllBackgrounds() {
  if (_cachePromise) return _cachePromise;
  _cachePromise = Promise.all(
    Array.from({ length: MAX_CH }, (_, i) => preloadOne(i + 1))
  ).then(() => _cache);
  return _cachePromise;
}
export function preloadBackground(ch) { return preloadOne(ch); }

function resolveUrl(ch) {
  ch = clampChapter(ch);
  const c = _cache[ch];
  return (c && c.src) ? c.src : bgUrl(ch);
}
export function chapterBgUrl(ch) { return bgUrl(clampChapter(ch)); }

/* ---------------------------------------------------------
 *  工具
 * --------------------------------------------------------- */
function applyBg(el, url) {
  if (!el || !url) return;
  el.style.backgroundImage    = `url('${url}')`;
  el.style.backgroundRepeat   = 'no-repeat';
  el.style.backgroundPosition = 'center center';
  el.style.backgroundSize     = 'cover';
}

export function readSelectChapter() {
  const sel = document.getElementById('bg-select');
  if (!sel) return null;
  const url = sel.style.backgroundImage || '';
  const m = url.match(/bg_(\d+)\.jpg/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n)) return null;
  return Math.min(MAX_CH, Math.max(1, n));
}

export function switchBg(container, bg1, bg2, duration = 800, opts = {}) {
  const fromTransform = opts.fromTransform || '';
  const toTransform   = opts.toTransform   || '';
  const keepLayers    = !!opts.keepLayers;

  if (!container || !bg2) return Promise.resolve();

  container.querySelectorAll(':scope > .bg-crossfade-layer')
           .forEach(el => el.remove());

  if (!fromTransform && !toTransform) {
    if (bg1) applyBg(container, bg1);
    const ov = document.createElement('div');
    ov.className = 'bg-crossfade-layer';
    ov.style.backgroundImage = `url('${bg2}')`;
    ov.style.opacity = '0';
    ov.style.transition = `opacity ${duration}ms ease`;
    container.appendChild(ov);
    void ov.offsetWidth;
    ov.classList.add('show');
    return new Promise(resolve => {
      setTimeout(() => {
        applyBg(container, bg2);
        if (ov.parentNode) ov.parentNode.removeChild(ov);
        resolve();
      }, duration + 40);
    });
  }

  applyBg(container, bg2);

  const ov1 = document.createElement('div');
  ov1.className = 'bg-crossfade-layer';
  if (bg1) ov1.style.backgroundImage = `url('${bg1}')`;
  if (fromTransform) {
    ov1.style.transform       = fromTransform;
    ov1.style.transformOrigin = 'center center';
  }
  ov1.style.opacity = '1';
  ov1.style.transition = `opacity ${duration}ms ease`;
  container.appendChild(ov1);

  const ov2 = document.createElement('div');
  ov2.className = 'bg-crossfade-layer';
  ov2.style.backgroundImage = `url('${bg2}')`;
  if (toTransform) {
    ov2.style.transform       = toTransform;
    ov2.style.transformOrigin = 'center center';
  }
  ov2.style.opacity = '0';
  ov2.style.transition = `opacity ${duration}ms ease`;
  container.appendChild(ov2);

  void ov2.offsetWidth;

  ov1.style.opacity = '0';
  ov2.style.opacity = '1';

  return new Promise(resolve => {
    setTimeout(() => {
      if (ov1.parentNode) ov1.parentNode.removeChild(ov1);
      const keepOv2 = toTransform && keepLayers;
      if (!keepOv2 && ov2.parentNode) ov2.parentNode.removeChild(ov2);
      resolve();
    }, duration + 40);
  });
}

export async function prepareLoadBg(ch) {
  ch = clampChapter(ch);
  if (ch <= 1) return;
  await preloadOne(ch);
  const el = document.getElementById('load-bg');
  if (!el) return;
  el.style.backgroundImage = `url('${resolveUrl(ch)}')`;
  void el.offsetWidth;
  el.classList.add('show');
}

export const MainBg = {
  go(ch) { applyBg(document.getElementById('bg-main'), resolveUrl(ch)); }
};
export const SelectBg = {
  go(ch) { applyBg(document.getElementById('bg-select'), resolveUrl(ch)); }
};

let _bgChain = Promise.resolve();
function runSerial(fn) {
  const next = _bgChain.then(fn, fn);
  _bgChain = next.catch(() => {});
  return next;
}

export const GameBg = {
  _currentCh: 1,
  _currentFlip: false,

  _el() { return document.getElementById('page-game'); },

  getState() {
    return { ch: this._currentCh, flip: this._currentFlip };
  },

  set(ch, opts = {}) {
    ch = clampChapter(ch);
    const flip = !!opts.flip;
    const el = this._el();
    if (!el) {
      this._currentCh = ch;
      this._currentFlip = flip;
      return;
    }
    const url = resolveUrl(ch);
    applyBg(el, url);
    el.querySelectorAll(':scope > .bg-crossfade-layer').forEach(x => x.remove());

    if (flip) {
      const ov = document.createElement('div');
      ov.className = 'bg-crossfade-layer';
      ov.style.backgroundImage = `url('${url}')`;
      ov.style.transform       = 'scaleY(-1)';
      ov.style.transformOrigin = 'center center';
      ov.style.transition      = 'none';
      ov.style.opacity         = '1';
      el.appendChild(ov);
    }
    this._currentCh = ch;
    this._currentFlip = flip;
  },

  crossFadeTo(ch, duration = 900, opts = {}) {
    return runSerial(() => this._doCrossFade(ch, duration, opts));
  },

  async _doCrossFade(ch, duration, opts) {
    ch = clampChapter(ch);
    const toFlip     = !!opts.toFlip;
    const force      = !!opts.force;
    const keepLayers = !!opts.keepLayers;

    const el = this._el();
    if (!el) {
      this._currentCh = ch;
      this._currentFlip = toFlip;
      return;
    }

    const from     = resolveUrl(this._currentCh);
    const to       = resolveUrl(ch);
    const fromFlip = this._currentFlip;

    if (from === to && fromFlip === toFlip && !force) {
      this._currentCh = ch;
      return;
    }

    await switchBg(el, from, to, duration, {
      fromTransform: fromFlip ? 'scaleY(-1)' : '',
      toTransform:   toFlip   ? 'scaleY(-1)' : '',
      keepLayers,
    });

    this._currentCh = ch;
    this._currentFlip = toFlip;
  },

  prepareEnter(ch) {
    this.set(ch, { flip: true });
  },

  crossFadeEnter(targetCh, duration = 900) {
    return this.crossFadeTo(targetCh, duration, {
      toFlip: false,
      force: true,
    });
  },

  crossFadeExit(newCh, duration = 700) {
    return this.crossFadeTo(newCh, duration, {
      toFlip: true,
      force: true,
      keepLayers: true,
    });
  },

  crossFadeChapter(targetCh, duration = 900) {
    return this.crossFadeTo(targetCh, duration);
  },

  reset() {
    const el = this._el();
    if (el) el.querySelectorAll(':scope > .bg-crossfade-layer').forEach(x => x.remove());
  },
  setReady() {},
};