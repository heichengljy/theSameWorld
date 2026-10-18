/* =========================================================
 *  js/ui-game.js — 游戏页控制器
 * ========================================================= */
import {
  MapSource, MapParser, Game, Renderer, Audio,
  showFatal, nl2br, Archive
} from './world.js';
import { Router } from './router.js';
import { GameBg, preloadAllBackgrounds } from './background.js';
import { loadImage } from './imageAsset.js'; // ★ 统一图片加载层

const playSafely  = n => { try { Audio.play(n);    } catch (_) {} };
const playBgmLoop = n => { try { Audio.playBgm(n); } catch (_) {} };

const FATAL  = document.getElementById('fatal');
const SCREEN = document.getElementById('page-game');
const BOARD  = document.getElementById('board');

const CURTAIN_IN_MS  = 180;
const CURTAIN_OUT_MS = 225;
const UI_IN_MS       = 225;

const PAUSE_UP_MS   = 180;
const PAUSE_DOWN_MS = 450;
const PAUSE_SCALE   = 1.5;

const EXIT_UI_MS     = 400;
const EXIT_BOOM_MS   = 600;
const EXIT_MOVE_MS   = 800;

const END_SCENE_DELAY_MS = 600;
const END_SCENE_FADE_MS  = 450;

const TRANS_DIR_BASE = '../image/select/icons/selectToGame';
const TRANS_MAX_CH   = { 1: 11, 2: 6, 3: 7 };
const MODE_CH_COUNT  = { 1: 11, 2: 6, 3: 7 };
const MODE_ORDER     = [1, 2, 3];

const END_ICON_WIN_WHITE = '../image/game/END/success_lcon_white_2.png';
const END_ICON_WIN_BLACK = '../image/game/END/success_lcon_black_3.png';

const END_BTN_WIN_SUCCESS = '../image/bg_title/success_next_bt.png';
const END_BTN_WIN_STORY   = '../image/select/setup/Next.png';

function chapterOfIndex(ci, mode = 1) {
  return { mode, chapterNumber: ci + 1 };
}

function transitionImgSrc(mode, chapter) {
  const maxCh = TRANS_MAX_CH[mode] || 0;
  if (chapter < 1 || chapter > maxCh) return null;
  const name = (mode === 1) ? `replace_out_${chapter}.png` : `replace_out${mode}_${chapter}.png`;
  return `${TRANS_DIR_BASE}${mode}/${name}`;
}

function computeBoomScale(stageRect, btnW, btnH) {
  if (!stageRect || !stageRect.width || !stageRect.height) return 6;
  const diag = Math.hypot(stageRect.width, stageRect.height);
  const boxSize = Math.max(1, Math.min(btnW, btnH));
  return diag / boxSize;
}

function parseKey(key) {
  const m = String(key || '').match(/^(\d+)-(\d+)$/);
  return m ? { c: +m[1], l: +m[2] } : null;
}
function isLevelAfter(a, b) {
  const pa = parseKey(a), pb = parseKey(b);
  if (!pa) return false;
  if (!pb) return true;
  return pa.c !== pb.c ? pa.c > pb.c : pa.l > pb.l;
}

export const GamePage = {
  el: SCREEN,
  game: new Game(),
  renderer: null,
  dragging: false,
  lastTime: 0,
  needLayout: true,
  _inited: false,
  _gameMode: 1,

  _pd: null,
  _pdShiftMax: 0,
  _pdCurShift: 0,
  _pdStartTotal: 0,
  _pdHeroShown: false,
  _pdMoveTimer: null,
  _pdUiOpacity: 1,

  _revealed: true,
  _uiOverride: false,
  _uiOverrideTimer: null,

  _flashing: false,
  _pausing:  false,
  _exiting:  false,
  _entering: false,

  _enterBtnIndex:  -1,
  _enterScrollTop: -1,
  _enterFromStory: false,

  setBgReady(v) { GameBg.setReady(!!v); },

  setRevealed(v, instant = false, durationMs = 400) {
    this._revealed = !!v;
    this._applyReveal(instant, durationMs);
  },

  _applyReveal(instant = false, durationMs = 400) {
    if (!this._pd) return;
    const show = this._revealed;
    const els  = [this._pd.hud, this._pd.deco, this._pd.board].filter(Boolean);
    if (!els.length) return;

    if (instant) {
      for (const el of els) {
        el.style.transition    = 'none';
        el.style.opacity       = show ? '1' : '0';
        el.style.pointerEvents = show ? '' : 'none';
      }
      void els[0].offsetHeight;
      for (const el of els) el.style.transition = '';
      this._uiOverride = false;
      clearTimeout(this._uiOverrideTimer);
      return;
    }

    for (const el of els) {
      el.style.transition    = 'none';
      el.style.opacity       = show ? '0' : '1';
      el.style.pointerEvents = 'none';
    }
    void els[0].offsetHeight;
    for (const el of els) {
      el.style.transition    = `opacity ${durationMs}ms ease`;
      el.style.opacity       = show ? '1' : '0';
      el.style.pointerEvents = show ? '' : 'none';
    }

    this._uiOverride = true;
    clearTimeout(this._uiOverrideTimer);
    this._uiOverrideTimer = setTimeout(() => {
      this._uiOverride = false;
    }, durationMs + 80);
  },

  _hideAllGameUI() {
    if (!this._pd) return;
    const els = [this._pd.hud, this._pd.deco, this._pd.board].filter(Boolean);
    for (const el of els) {
      el.style.transition    = `opacity ${END_SCENE_FADE_MS}ms ease`;
      el.style.opacity       = '0';
      el.style.pointerEvents = 'none';
    }
    if (this._pd.hero)  this._pd.hero.classList.remove('show');
    if (this._pd.left)  this._pd.left.style.opacity  = '0';
    if (this._pd.right) this._pd.right.style.opacity = '0';
    this._uiOverride = true;
    clearTimeout(this._uiOverrideTimer);
  },

  _showAllGameUI() {
    if (!this._pd) return;
    const els = [this._pd.hud, this._pd.deco, this._pd.board].filter(Boolean);
    for (const el of els) {
      el.style.transition    = 'opacity 500ms ease';
      el.style.opacity       = '';
      el.style.pointerEvents = '';
    }
    if (this._pd.left)  this._pd.left.style.opacity  = '';
    if (this._pd.right) this._pd.right.style.opacity = '';
    this._uiOverride = false;
    clearTimeout(this._uiOverrideTimer);
  },

  prepareCurtainReveal() {
    if (!this._pd) return;
    const els = [this._pd.board, this._pd.deco, this._pd.hud].filter(Boolean);
    for (const el of els) {
      el.style.transition = 'none';
      el.style.opacity    = '0';
    }
    if (this._pd.hud) this._pd.hud.style.pointerEvents = 'none';
    this._uiOverride = true;
    clearTimeout(this._uiOverrideTimer);
  },

  revealHudAfterCurtain(durationMs = UI_IN_MS) {
    if (!this._pd) return;
    const els = [this._pd.board, this._pd.deco, this._pd.hud].filter(Boolean);
    if (!els.length) return;

    for (const el of els) {
      el.style.transition = 'none';
      el.style.opacity    = '0';
    }
    if (this._pd.hud) this._pd.hud.style.pointerEvents = 'none';
    void els[0].offsetHeight;

    const trans = `opacity ${durationMs}ms ease`;
    for (const el of els) {
      el.style.transition    = trans;
      el.style.opacity       = '1';
      el.style.pointerEvents = '';
    }

    clearTimeout(this._uiOverrideTimer);
    this._uiOverrideTimer = setTimeout(() => {
      this._uiOverride = false;
    }, durationMs + 80);
  },

  async leave() {
    this.setBgReady(false);
    SCREEN.classList.add('leaving');
    await new Promise(r => setTimeout(r, 400));
    SCREEN.classList.remove('leaving');
    GameBg.reset();
  },

  async enter(params) {
    const hasIdx     = params && Number.isFinite(params.i);
    const idx        = hasIdx ? params.i : 0;
    const autoReveal = !(params && params.reveal === false);
    const mode       = params && params.mode ? params.mode : 1;

    this._entering = true;

    try {
      if (!this._inited) {
        this._inited = true;
        this._gameMode = mode;
        await this._init(idx);
      } else if (this._gameMode !== mode) {
        this._gameMode = mode;
        await this._init(idx);
      } else if (hasIdx) {
        this.game.go(params.i);
        this._syncHintButton();
        this._updateHintCount();
        this._resetProgressDeco();
      }
      this.needLayout = true;

      this._revealed = !!autoReveal;
      if (autoReveal) {
        this.setRevealed(true, false, 400);
      } else {
        this.setRevealed(false, true);
      }

      playBgmLoop('bgm_game');
    } finally {
      this._entering = false;
    }
  },

  async _init(startIndex = 0) {
    this.renderer = new Renderer(document.getElementById('game'));
    this.renderer.setMode(this._gameMode || 1);
    
    try { Audio.bind(this.game); } catch (_) {}
    try { await Archive.load(); } catch (_) {}

    this.game.onWin   = () => this._handleWin();
    this.game.onFail  = () => this._showFail();
    this.game.onLevel = async () => {
      this.needLayout = true;
      const targetCh = (this.game.level.chapterIndexInMode || 0) + 1;
      if (!this._entering) {
        try { await GameBg.crossFadeChapter(targetCh, 900); } catch (e) {}
      }
      this._syncHintButton();
      this._updateHintCount();
      this._resetProgressDeco();
    };

    this._bindUI();
    this._bindInput();
    this._bindResize();
    this._bindProgressDeco();

    preloadAllBackgrounds().catch(() => {});

    try {
      const raw = await MapSource.load();
      const parsed = MapParser.parse(raw);
      this.game.load(parsed, startIndex);
      document.title = parsed.title;
    } catch (e) {
      showFatal(FATAL, '读取关卡数据失败：\n' + e.message, () => this._init(startIndex));
      return;
    }

    this._syncHintButton();
    this._updateHintCount();
    this.lastTime = performance.now();
    requestAnimationFrame(this._frame.bind(this));
  },

  _computeCanvasSize() {
    if (!this.game.level) return null;
    const rootRect = document.getElementById('stage').getBoundingClientRect();
    if (!rootRect.width) return null;
    const scale = rootRect.width / 900;
    const r = BOARD.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const availW = r.width / scale;
    const availH = r.height / scale;
    const { rows, cols } = this.game.level;
    const ratio = cols / rows;
    let w, h;
    if (availW / availH > ratio) { h = availH; w = h * ratio; }
    else                          { w = availW; h = w / ratio; }
    return { w: Math.max(1, Math.floor(w)), h: Math.max(1, Math.floor(h)) };
  },

  async _handleWin() {
    try {
      const g = this.game, nextIndex = g.index + 1;
      if (nextIndex < g.flat.length) {
        const e = g.flat[nextIndex];
        if (e) {
          // ★ 使用绝对章节号（全局 1~24）
          const key = (e.chapterIndex + 1) + '-' + (e.levelIndex + 1);
          const cur = (Archive.data && Archive.data.unlocked) || '1-1';
          if (isLevelAfter(key, cur)) await Archive.save({ unlocked: key });
        }
      }
    } catch (_) {}
    this._showWin();
  },

  async _restartWithFlash() {
    if (this._flashing) return;
    this._flashing = true;

    const stage = document.getElementById('stage');
    const white = document.createElement('div');
    white.className = 'story-white-fade';
    white.style.transition = 'none';
    white.style.opacity    = '0';
    stage.appendChild(white);
    void getComputedStyle(white).opacity;

    white.style.transition = `opacity ${CURTAIN_IN_MS}ms ease`;
    white.style.opacity    = '1';
    await new Promise(r => setTimeout(r, CURTAIN_IN_MS + 20));

    this.prepareCurtainReveal();

    this._hideOverlays();
    this.game.restart();
    this._syncHintButton();
    this._updateHintCount();
    this.needLayout = true;

    this._pdStartTotal = this._countStarts();
    this._pdCurShift   = 0;
    this._pdUiOpacity  = 1;
    clearTimeout(this._pdMoveTimer);
    if (this._pd) {
      this._pd.left.style.transform  = 'translateX(0px)';
      this._pd.right.style.transform = 'translateX(0px)';
      this._pd.left.classList.remove('moving');
      this._pd.right.classList.remove('moving');
      this._pd.left.style.opacity  = '';
      this._pd.right.style.opacity = '';
      this._pd.hero.classList.remove('show');
    }
    this._pdHeroShown = false;

    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    white.style.transition = `opacity ${CURTAIN_OUT_MS}ms ease`;
    white.style.opacity    = '0';
    this.revealHudAfterCurtain(CURTAIN_OUT_MS);

    await new Promise(r => setTimeout(r, CURTAIN_OUT_MS + 20));
    if (white.parentNode) white.parentNode.removeChild(white);

    await new Promise(r => setTimeout(r, UI_IN_MS / 2 + 20));
    this._flashing = false;
  },

  openPause() {
    if (this._pausing) return;
    const overlay = document.getElementById('pause-overlay');
    const gameEl  = document.getElementById('page-game');
    if (!overlay || !gameEl) return;

    this._updatePauseLevel();

    const wrap = document.getElementById('pause-frame-wrap');
    const mask = document.getElementById('pause-mask');

    overlay.classList.remove('show');
    if (wrap) { wrap.style.transition = 'none'; wrap.style.transform  = ''; }
    if (mask) { mask.style.transition = 'none'; mask.style.opacity    = ''; }
    void overlay.offsetWidth;
    if (wrap) wrap.style.transition = '';
    if (mask) mask.style.transition = '';

    gameEl.classList.add('pause-on');

    requestAnimationFrame(() => {
      overlay.classList.add('show');
    });
  },

  async closePause(animate = true) {
    if (this._pausing) return;

    const overlay = document.getElementById('pause-overlay');
    const wrap    = document.getElementById('pause-frame-wrap');
    const mask    = document.getElementById('pause-mask');
    const gameEl  = document.getElementById('page-game');
    if (!overlay || !wrap || !mask || !gameEl) return;

    if (!overlay.classList.contains('show')) {
      wrap.style.transition = 'none';
      wrap.style.transform  = '';
      mask.style.transition = 'none';
      mask.style.opacity    = '';
      gameEl.classList.remove('pause-on');
      void wrap.offsetWidth;
      requestAnimationFrame(() => {
        wrap.style.transition = '';
        mask.style.transition = '';
      });
      return;
    }

    this._pausing = true;
    try {
      if (!animate) {
        overlay.classList.remove('show');
        wrap.style.transition = 'none';
        wrap.style.transform  = '';
        mask.style.transition = 'none';
        mask.style.opacity    = '';
        gameEl.classList.remove('pause-on');
        void wrap.offsetWidth;
        requestAnimationFrame(() => {
          wrap.style.transition = '';
          mask.style.transition = '';
        });
        return;
      }

      wrap.style.transition = `transform ${PAUSE_UP_MS}ms ease`;
      wrap.style.transform  = `translate(-50%, -50%) translateY(-30px) scale(${PAUSE_SCALE})`;
      await new Promise(r => setTimeout(r, PAUSE_UP_MS));

      wrap.style.transition = `transform ${PAUSE_DOWN_MS}ms cubic-bezier(.6,0,.8,.3)`;
      wrap.style.transform  = `translate(-50%, -50%) translateY(1700px) scale(${PAUSE_SCALE})`;
      mask.style.transition = `opacity ${PAUSE_DOWN_MS}ms ease`;
      mask.style.opacity    = '0';
      gameEl.classList.remove('pause-on');

      await new Promise(r => setTimeout(r, PAUSE_DOWN_MS + 20));

      overlay.classList.remove('show');
      wrap.style.transition = 'none';
      wrap.style.transform  = '';
      mask.style.transition = 'none';
      mask.style.opacity    = '';
      void wrap.offsetWidth;
      requestAnimationFrame(() => {
        wrap.style.transition = '';
        mask.style.transition = '';
      });
    } finally {
      this._pausing = false;
    }
  },

  _updatePauseLevel() {
    const g = this.game;
    if (!g || !g.level) return;
    const chapter = (g.level.chapterIndexInMode || 0) + 1;
    const entry   = g.flat && g.flat[g.index];
    const levelNum = entry ? (entry.levelIndex + 1) : 1;

    const mode = g.level.mode || 1;
    const base = mode === 3 ? '../image/select/icons/select_button2/' : (mode === 2 ? '../image/select/icons/select_button3/' : '../image/select/icons/select_button1/');
    const prefix = mode === 3 ? '3' : (mode === 2 ? '2' : '');
    
    const sfx = '3';
    const src = base + prefix + 'select_button' + chapter + '_' + sfx + '.png';

    const iconEl  = document.getElementById('pause-level-icon');
    const labelEl = document.getElementById('pause-level-label');
    
    if (iconEl) {
      // ★ 使用统一加载层
      loadImage(src).then(img => { iconEl.src = img.src; }).catch(() => {});
    }
    if (labelEl) labelEl.textContent = chapter + '-' + levelNum;
  },

  async _backToSelect() {
    if (this._exiting) return;
    this._exiting = true;

    const stage    = document.getElementById('stage');
    const pageMain = document.getElementById('page-main');
    const pageGame = document.getElementById('page-game');

    const pd = this._pd;
    const fadeEls = pd ? [pd.hud, pd.board, pd.deco].filter(Boolean) : [];

    let overlay = null;
    let ghost   = null;
    let targetBtn = null;
    let prevBtnVisibility = '';

    const mainContent = document.getElementById('main-content');
    const selScroll   = document.querySelector('#scene-select .sel-scroll');
    const selUIEls    = [mainContent, selScroll].filter(Boolean);

    const restoreIndex     = this._enterBtnIndex;
    const restoreScrollTop = this._enterScrollTop;

    try {
      if (!stage || !pageMain || !pageGame) {
        try { Router.setCurrent('main'); } catch (_) {}
        if (pageGame) pageGame.classList.remove('active');
        return;
      }

      try { this._hideOverlays(); } catch (_) {}
      try { await this.closePause(true); } catch (e) {}

      pageGame.style.backgroundColor = 'transparent';
      pageMain.classList.remove('fading-out');
      pageMain.classList.add('sel-open');
      pageMain.classList.add('active');

      let newCh = 1;
      try {
        await Archive.load();
        const u = Archive.parse();
        newCh = Math.min(11, Math.max(1, u.chapter));
        const mod = await import('./ui-main.js');
        if (mod.MainPage && typeof mod.MainPage.refreshSelect === 'function') {
          await mod.MainPage.refreshSelect(restoreIndex, restoreScrollTop);
        } else {
          const bgMod = await import('./background.js');
          bgMod.MainBg.go(newCh);
          bgMod.SelectBg.go(newCh);
        }
      } catch (e) {}

      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));

      const selScrollEl = document.getElementById('sel-scroll');
      if (selScrollEl) {
        void selScrollEl.scrollTop;
        void selScrollEl.offsetHeight;
      }
      const trackEl0 = document.getElementById('sel-track');
      if (trackEl0) void trackEl0.offsetHeight;

      const allBtnsNow = Array.from(document.querySelectorAll('#sel-track .lv-btn'));
      allBtnsNow.forEach(b => {
        try { b.getAnimations().forEach(a => a.finish()); } catch (_) {}
      });
      if (trackEl0) void trackEl0.offsetHeight;

      const g = this.game;
      const btns = allBtnsNow;
      const btnIdx = Number.isFinite(restoreIndex) && restoreIndex >= 0 ? restoreIndex : g.index;
      targetBtn = btns[btnIdx] || btns[g.index] || btns[0];

      const r = targetBtn ? targetBtn.getBoundingClientRect() : null;
      const btnScreenW  = r ? r.width  : 180;
      const btnScreenH  = r ? r.height : 180;
      const btnScreenCX = r ? (r.left + r.width  / 2) : window.innerWidth  / 2;
      const btnScreenCY = r ? (r.top  + r.height / 2) : window.innerHeight / 2;

      const viewCX = window.innerWidth  / 2;
      const viewCY = window.innerHeight / 2;

      if (targetBtn) {
        prevBtnVisibility = targetBtn.style.visibility;
        targetBtn.style.visibility = 'hidden';
      }

      const stageRect = stage.getBoundingClientRect();
      const designW = stage.offsetWidth  || 900;
      const designH = stage.offsetHeight || 1600;
      const scaleX  = (stageRect.width  / designW) || 1;
      const scaleY  = (stageRect.height / designH) || 1;

      const dxLocal = (viewCX - btnScreenCX) / scaleX;
      const dyLocal = (viewCY - btnScreenCY) / scaleY;

      for (const el of selUIEls) {
        el.style.transition      = 'none';
        el.style.transformOrigin = 'center center';
        el.style.transform       = `translate(${dxLocal}px, ${dyLocal}px)`;
        el.style.opacity         = '0';
        el.style.willChange      = 'transform, opacity';
      }

      for (const el of fadeEls) {
        el.style.transition = `opacity ${EXIT_UI_MS}ms ease`;
        el.style.opacity    = '0';
      }
      await new Promise(r => setTimeout(r, EXIT_UI_MS + 20));

      const chapterIdx = g.level ? (g.level.chapterIndexInMode || 0) : 0;
      const info = chapterOfIndex(chapterIdx, g.level.mode);
      const imgSrc = transitionImgSrc(info.mode, info.chapterNumber);

      const overlayLeft = viewCX - btnScreenW / 2;
      const overlayTop  = viewCY - btnScreenH / 2;

      const boomScale = computeBoomScale(stageRect, btnScreenW, btnScreenH);

      overlay = document.createElement('img');
      overlay.className = 'level-transition';
      if (imgSrc) {
        try {
          const loaded = await loadImage(imgSrc);
          overlay.src = loaded.src; // ★ 统一加载层
        } catch (_) {}
      }
      overlay.style.position        = 'fixed';
      overlay.style.left            = overlayLeft + 'px';
      overlay.style.top             = overlayTop + 'px';
      overlay.style.width           = btnScreenW + 'px';
      overlay.style.height          = btnScreenH + 'px';
      overlay.style.opacity         = '0';
      overlay.style.zIndex          = '99999';
      overlay.style.pointerEvents   = 'none';
      overlay.style.transformOrigin = 'center center';
      overlay.style.transform       = `scale(${boomScale.toFixed(3)})`;
      overlay.style.transition      = 'none';
      document.body.appendChild(overlay);

      try { await overlay.decode?.(); } catch (_) {}
      void overlay.offsetWidth;

      overlay.style.transition = `transform ${EXIT_BOOM_MS}ms cubic-bezier(.4,0,.2,1), opacity ${EXIT_BOOM_MS}ms ease`;

      const boomPromise = new Promise(resolve => {
        requestAnimationFrame(() => {
          overlay.style.transform = 'scale(1)';
          overlay.style.opacity   = '1';
          setTimeout(resolve, EXIT_BOOM_MS + 20);
        });
      });

      const bgPromise = GameBg.crossFadeExit(newCh, EXIT_BOOM_MS).catch(() => {});

      await Promise.all([boomPromise, bgPromise]);

      try { Router.setCurrent('main'); } catch (e) {}
      pageGame.classList.remove('active');

      if (targetBtn) {
        ghost = targetBtn.cloneNode(true);
        ghost.removeAttribute('id');
        ghost.classList.add('lv-ghost');
        ghost.querySelectorAll('.lv-label').forEach(el => el.remove());
        ghost.style.cssText = [
          'position: fixed', `left: ${overlayLeft}px`, `top: ${overlayTop}px`,
          `width: ${btnScreenW}px`, `height: ${btnScreenH}px`,
          'margin: 0', 'box-sizing: border-box', 'transform: none',
          'opacity: 0', 'animation: none', 'transition: none', 'z-index: 99999',
          'pointer-events: none', 'transform-origin: center center', 'will-change: transform, opacity',
        ].join('; ');
        ghost.querySelectorAll('*').forEach(el => {
          el.style.animation  = 'none';
          el.style.transition = 'none';
        });
        document.body.appendChild(ghost);
      }

      overlay.style.transition = 'opacity 120ms ease';
      overlay.style.opacity    = '0';
      await new Promise(r => setTimeout(r, 120));
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      overlay = null;

      if (ghost) ghost.style.opacity = '1';

      if (ghost) {
        const gDx = btnScreenCX - viewCX;
        const gDy = btnScreenCY - viewCY;
        ghost.style.transition = `transform ${EXIT_MOVE_MS}ms cubic-bezier(.4,.05,.3,1)`;
        requestAnimationFrame(() => {
          ghost.style.transform = `translate(${gDx}px, ${gDy}px)`;
        });
      }
      for (const el of selUIEls) {
        el.style.transition = `transform ${EXIT_MOVE_MS}ms cubic-bezier(.4,.05,.3,1), opacity ${EXIT_MOVE_MS}ms ease`;
        el.style.transform = '';
        el.style.opacity   = '';
      }

      await new Promise(r => setTimeout(r, EXIT_MOVE_MS + 100));

      if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
      ghost = null;
      if (targetBtn) targetBtn.style.visibility = prevBtnVisibility;

      for (const el of fadeEls) {
        el.style.transition = 'none';
        el.style.opacity    = '';
      }
      if (fadeEls[0]) void fadeEls[0].offsetWidth;
      for (const el of fadeEls) el.style.transition = '';

      try {
        const audioMod = await import('./audio.js');
        audioMod.Audio.playBgm('bgm_select');
      } catch (_) {}

    } catch (e) {
      console.error('[GamePage._backToSelect] failed:', e);
      try { Router.setCurrent('main'); } catch (_) {}
      if (pageGame) pageGame.classList.remove('active');
    } finally {
      if (pageGame) pageGame.style.backgroundColor = '';
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (ghost   && ghost.parentNode)   ghost.parentNode.removeChild(ghost);
      if (targetBtn) targetBtn.style.visibility = prevBtnVisibility;

      for (const el of selUIEls) {
        el.style.transition = 'none';
        el.style.transform  = '';
        el.style.opacity    = '';
        el.style.willChange = '';
        void el.offsetWidth;
        el.style.transition = '';
      }

      for (const el of fadeEls) {
        el.style.transition = 'none';
        el.style.opacity    = '';
      }
      if (fadeEls[0]) void fadeEls[0].offsetWidth;
      for (const el of fadeEls) el.style.transition = '';

      this._exiting = false;
    }
  },

  _bindProgressDeco() {
    const deco  = document.getElementById('progress-deco');
    if (!deco) return;
    const left  = document.getElementById('pd-left');
    const right = document.getElementById('pd-right');
    const hero  = document.getElementById('pd-hero');
    const top   = document.getElementById('game-top');
    const board = document.getElementById('board');
    if (!left || !right || !hero) return;

    this._pd = { deco, left, right, hero, hud: top, board };
    this._pdHeroShown = false;

    const recompute = () => { this._pdShiftMax = this._computeShiftRange(); };
    left.querySelectorAll('img').forEach(img => {
      if (!img.complete) img.addEventListener('load', recompute, { once: true });
    });
    right.querySelectorAll('img').forEach(img => {
      if (!img.complete) img.addEventListener('load', recompute, { once: true });
    });
    recompute();
    window.addEventListener('resize', recompute);
    window.addEventListener('orientationchange', recompute);
    if (window.ResizeObserver) {
      new ResizeObserver(recompute).observe(deco);
    }
    this._applyReveal(true);
  },

  _computeShiftRange() {
    if (!this._pd) return 0;
    const rootW   = 900;
    const edgeGap = 0;
    const endGap  = 8;
    const lw = this._pd.left.offsetWidth  || 140;
    const rw = this._pd.right.offsetWidth || 140;
    return Math.max(0, (rootW - lw - rw - edgeGap * 2 - endGap) / 2);
  },

  _countStarts() {
    if (!this.game.level) return 0;
    let n = 0;
    for (const row of this.game.level.cells) {
      for (const cell of row) {
        if (!cell.empty && cell.start) n++;
      }
    }
    return n;
  },

  _computeProgress() {
    const g = this.game;
    if (!g || !g.level) return 0;
    const total = this._pdStartTotal || 1;
    if (g.solved) return 1.0;
    if (total <= 1) return 0.0;
    if (total === 2) {
      if (g.failed) return 0.6;
      return Math.min(g.moves, 1) * 0.4;
    }
    if (total === 3) {
      if (g.failed) return 0.5;
      return Math.min(g.moves, 2) * 0.33;
    }
    if (g.failed) return 0.5;
    return Math.min(g.moves / total, 1);
  },

  _updateProgressDeco() {
    if (!this._pd) return;
    if (!this._pdShiftMax || this._pd.left.offsetWidth === 0) {
      this._pdShiftMax = this._computeShiftRange();
    }

    const p = this._computeProgress();
    const shift = p * this._pdShiftMax;
    const changed = Math.abs(shift - this._pdCurShift) > 0.5;
    this._pdCurShift = shift;
    this._pd.left.style.transform  = `translateX(${shift}px)`;
    this._pd.right.style.transform = `translateX(${-shift}px)`;
    if (changed) {
      this._pd.left.classList.add('moving');
      this._pd.right.classList.add('moving');
      clearTimeout(this._pdMoveTimer);
      this._pdMoveTimer = setTimeout(() => {
        if (!this._pd) return;
        this._pd.left.classList.remove('moving');
        this._pd.right.classList.remove('moving');
      }, 400);
    }

    if (this._uiOverride) return;
    if (!this._revealed) return;

    const FADE_START = 0.7;
    let uiOpacity = 1;
    if (p > FADE_START) {
      uiOpacity = Math.max(0, 1 - (p - FADE_START) / (1 - FADE_START));
    }
    if (Math.abs(uiOpacity - this._pdUiOpacity) > 0.01) {
      this._pdUiOpacity = uiOpacity;
      if (this._pd.hud) {
        this._pd.hud.style.opacity = uiOpacity;
        this._pd.hud.style.transition = 'opacity .25s ease';
        this._pd.hud.style.pointerEvents = uiOpacity < 0.1 ? 'none' : '';
      }
    }
  },

  _resetProgressDeco() {
    this._pdStartTotal = this._countStarts();
    this._pdCurShift = 0;
    this._pdUiOpacity = 1;
    clearTimeout(this._pdMoveTimer);
    if (this._pd) {
      this._pd.left.style.transform  = 'translateX(0px)';
      this._pd.right.style.transform = 'translateX(0px)';
      this._pd.left.classList.remove('moving');
      this._pd.right.classList.remove('moving');
      this._pd.left.style.opacity  = '';
      this._pd.right.style.opacity = '';
      this._pd.hero.classList.remove('show');
      this._applyReveal(true);
    }
    this._pdHeroShown = false;
  },

  _hideOverlays() {
    const w = document.getElementById('overlay-win');
    const f = document.getElementById('overlay-fail');
    if (w) w.classList.remove('show');
    if (f) f.classList.remove('show');
  },

  _syncHintButton() {
    const btn = document.getElementById('btn-hint');
    if (!btn) return;
    const n = this.game.tipsCount || 0;
    btn.disabled = n === 0;
    btn.classList.toggle('active', this.game.hintIndex >= 0);
  },

  _updateHintCount() {
    const el = document.getElementById('game-hint-count');
    if (!el) return;
    const n = Math.min(999, Math.max(0, this.game.tipsCount || 0));
    const s = String(n);
    if (el.textContent !== s) el.textContent = s;
  },

  _bindUI() {
    const $ = id => document.getElementById(id);

    const restart = () => {
      this._hideOverlays();
      this.game.restart();
      this._syncHintButton();
      this._updateHintCount();
      this._resetProgressDeco();
    };

    $('btn-restart').addEventListener('click', () => { playSafely('click'); this._restartWithFlash(); });
    $('btn-hint').addEventListener('click', () => {
      if (!this.game.tipsCount) return;
      playSafely('click');
      this.game.cycleHint();
      this._syncHintButton();
      this._updateHintCount();
    });
    $('btn-suspend').addEventListener('click', () => { playSafely('click'); this.openPause(); });

    const btnPauseClose = $('pause-close');
    if (btnPauseClose) btnPauseClose.addEventListener('click', () => { playSafely('click'); this.closePause(true); });

    const btnPauseMenu = $('pause-menu');
    if (btnPauseMenu) btnPauseMenu.addEventListener('click', () => { playSafely('click'); this._backToSelect(); });

    const btnPauseRestart = $('pause-restart');
    if (btnPauseRestart) {
      btnPauseRestart.addEventListener('click', async () => {
        playSafely('click'); await this.closePause(true); this._restartWithFlash();
      });
    }

    const btnWinNext = $('btn-win-next');
    if (btnWinNext) {
      btnWinNext.addEventListener('click', async () => {
        playSafely('click');
        const ov = document.getElementById('overlay-win');
        ov.classList.remove('show');
        await new Promise(r => setTimeout(r, 400));
        this._backToSelect();
      });
    }

    const btnFailRetry = $('btn-fail-retry');
    if (btnFailRetry) {
      btnFailRetry.addEventListener('click', async () => {
        playSafely('click');
        const ov = document.getElementById('overlay-fail');
        ov.classList.remove('show');
        await new Promise(r => setTimeout(r, 400));
        this._restartWithFlash();
      });
    }
  },

  _bindInput() {
    const canvas = this.renderer.canvas;

    const onDown = e => {
      if (this.game.solved || this.game.failed) return;
      const p = this.renderer.hit(e.clientX, e.clientY);
      if (!p || !this.game.begin(p.r, p.c)) return;
      this._syncHintButton();
      e.preventDefault();
      this.dragging = true;
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    };
    const onMove = e => {
      if (!this.dragging) return;
      e.preventDefault();
      const p = this.renderer.hit(e.clientX, e.clientY);
      if (p) this.game.extend(p.r, p.c);
    };
    const onUp = e => {
      if (!this.dragging) return;
      this.dragging = false;
      try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
      this.game.end();
      this._syncHintButton();
    };

    canvas.addEventListener('pointerdown',   onDown, { passive: false });
    canvas.addEventListener('pointermove',   onMove, { passive: false });
    canvas.addEventListener('pointerup',     onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('contextmenu',   e => e.preventDefault());
  },

  _bindResize() {
    const mark = () => { this.needLayout = true; };
    window.addEventListener('resize', mark);
    window.addEventListener('orientationchange', mark);
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(mark);
      ro.observe(document.getElementById('stage'));
      ro.observe(BOARD);
    }
  },

  _frame(now) {
    const dt = Math.min(now - this.lastTime, 60);
    this.lastTime = now;
    this.game.tick(dt);
    this._updateProgressDeco();

    if (this.needLayout && this.game.level) {
      const sz = this._computeCanvasSize();
      if (sz) {
        this.needLayout = false;
        const { rows, cols, chapterIndexInMode } = this.game.level;
        this.renderer.layout(sz.w, sz.h, rows, cols, (chapterIndexInMode || 0) + 1);
      }
    }
    if (this.game.level) this.renderer.draw(this.game);

    requestAnimationFrame(this._frame.bind(this));
  },

  _showWin() {
    const game = this.game;
    if (!game || !game.level) return;

    let finalColor = 1;
    outer: for (const row of game.level.cells) {
      for (const cell of row) {
        if (!cell.empty) { finalColor = cell.color; break outer; }
      }
    }

    const iconEl = document.getElementById('win-top-icon');
    if (iconEl) {
      const src = finalColor === 1 ? END_ICON_WIN_WHITE : END_ICON_WIN_BLACK;
      // ★ 统一加载层
      loadImage(src).then(img => { iconEl.src = img.src; }).catch(() => {});
    }

    const nextBtnImg = document.querySelector('#btn-win-next > img');
    if (nextBtnImg) {
      const src = this._enterFromStory ? END_BTN_WIN_STORY : END_BTN_WIN_SUCCESS;
      // ★ 统一加载层
      loadImage(src).then(img => { nextBtnImg.src = img.src; }).catch(() => {});
    }

    const cur = game.currentText;
    const text = nl2br(cur && cur.text ? cur.text : '');
    const textEl = document.getElementById('win-text');
    if (textEl) textEl.innerHTML = text || '同 一 个 世 界';

    setTimeout(() => {
      this._hideAllGameUI();
      const ov = document.getElementById('overlay-win');
      if (ov) ov.classList.add('show');
    }, END_SCENE_DELAY_MS);
  },

  _showFail() {
    const texts = (this.game.endings.fail && this.game.endings.fail.texts) || [];
    const raw = texts.length ? texts[Math.floor(Math.random() * texts.length)] : '再 试 一 次';
    const textEl = document.getElementById('fail-text');
    if (textEl) textEl.innerHTML = nl2br(raw);

    setTimeout(() => {
      this._hideAllGameUI();
      const ov = document.getElementById('overlay-fail');
      if (ov) ov.classList.add('show');
    }, END_SCENE_DELAY_MS);
  }
};

window.__GamePage__ = GamePage;