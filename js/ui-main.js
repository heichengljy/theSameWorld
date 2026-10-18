/* =========================================================
 *  js/ui-main.js — 主菜单 / 选关页控制器
 * ========================================================= */
import { Audio }    from './audio.js';
import { Router }   from './router.js';
import { Archive }  from './archive.js';
import { escapeHtml, nl2br } from './utils.js';
import { MainBg, SelectBg, GameBg } from './background.js';
import { loadImage } from './imageAsset.js';

const playSafely  = n => { try { Audio.play(n);    } catch (_) {} };
const playBgmLoop = n => { try { Audio.playBgm(n); } catch (_) {} };

const toastEl = document.getElementById('toast');
let toastTimer = null;
export function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1600);
}

let _selectT0 = 0;
const SCENE_SLIDE_MS  = 920;
const SCENE_BUFFER_MS = 80;

function tlog(label) {
  if (!_selectT0) return;
  const dt = (performance.now() - _selectT0).toFixed(0);
  console.log(`%c[TSW-T] +${dt.padStart(4, ' ')}ms  ${label}`, 'color:#8af;font-weight:bold');
}

function computeBoomScale(stageRect, btnW, btnH) {
  if (!stageRect || !stageRect.width || !stageRect.height) return 6;
  const diag = Math.hypot(stageRect.width, stageRect.height);
  const boxSize = Math.max(1, Math.min(btnW, btnH));
  return diag / boxSize;
}

const TRANS_DIR_BASE = '../image/select/icons/selectToGame';
const TRANS_MAX_CH   = { 1: 11, 2: 6, 3: 7 };
const MODE_CH_COUNT  = { 1: 11, 2: 6, 3: 7 };
const MODE_ORDER     = [1, 2, 3];
const MOVE_MS  = 800;
const HOLD_MS  = 800;

const BOOM_MS      = 600;
const BOOM_HALF_MS = BOOM_MS / 2;
const UI_SHOW_MS   = BOOM_MS;
const TOTAL_MS     = BOOM_HALF_MS + UI_SHOW_MS;

function transitionImgSrc(mode, chapter) {
  const maxCh = TRANS_MAX_CH[mode] || 0;
  if (chapter < 1 || chapter > maxCh) return null;
  const name = (mode === 1) ? `replace_out_${chapter}.png` : `replace_out${mode}_${chapter}.png`;
  return `${TRANS_DIR_BASE}${mode}/${name}`;
}

const _preloaded = new Set();
function preloadOne(mode, chapter) {
  const src = transitionImgSrc(mode, chapter);
  if (!src || _preloaded.has(src)) return;
  _preloaded.add(src);
  loadImage(src).then(img => {
    if (img.decode) img.decode().catch(() => {});
  }).catch(() => {});
}
function preloadMode(mode) {
  const maxCh = TRANS_MAX_CH[mode] || 0;
  for (let ch = 1; ch <= maxCh; ch++) preloadOne(mode, ch);
}

let _transitioning = false;

let _storyPromise = null;
function loadStoryData() {
  if (_storyPromise) return _storyPromise;
  _storyPromise = (async () => {
    const paths = [
      '../json/strings/CNstrings/storyScene.json',
      './json/strings/CNstrings/storyScene.json',
      'json/strings/CNstrings/storyScene.json',
    ];
    for (const p of paths) {
      try {
        const res = await fetch(p + '?_t=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) continue;
        return await res.json();
      } catch (_) {}
    }
    return null;
  })();
  return _storyPromise;
}

function storyTextToHtml(raw) {
  return nl2br(raw);
}

async function openStory(mode, chapterNumber, targetIndex) {
  if (_transitioning) return;

  const overlay = document.getElementById('story-overlay');
  const textEl  = document.getElementById('story-text');
  const nextBtn = document.getElementById('story-next');
  if (!overlay || !textEl || !nextBtn) return;

  const bgPath = `../image/bg_title/bg_${chapterNumber}.jpg`;
  let realBgUrl = bgPath;
  try {
    const img = await loadImage(bgPath);
    if (img.decode) await img.decode().catch(() => {});
    realBgUrl = img.src;
  } catch (_) {}
  overlay.style.backgroundImage = `url('${realBgUrl}')`;

  const data  = await loadStoryData();
  const key   = 'gameModle' + mode;
  const arr   = (data && Array.isArray(data[key])) ? data[key] : [];
  const entry = arr[chapterNumber - 1];
  const raw   = (entry && entry.textString) || '';

  textEl.innerHTML = raw ? storyTextToHtml(raw) : '（暂无剧情）';
  overlay.classList.add('show');

  nextBtn.onclick = () => {
    nextBtn.onclick = null;
    playSafely('click');
    playStoryTransition(targetIndex, chapterNumber, mode);
  };
}

async function playStoryTransition(targetIndex, chapterNumber, mode) {
  if (_transitioning) return;
  _transitioning = true;

  const stage       = document.getElementById('stage');
  const pageMain    = document.getElementById('page-main');
  const pageGame    = document.getElementById('page-game');
  const storyLayer  = document.getElementById('story-overlay');

  const enterCh = Math.min(11, Math.max(1, Number(chapterNumber) || 1));
  const selScroller    = document.querySelector('#scene-select .sel-scroll');
  const savedScrollTop = selScroller ? selScroller.scrollTop : 0;

  const oldCh = Archive.parse().chapter;
  GameBg.prepareEnter(oldCh);

  const white = document.createElement('div');
  white.className = 'story-white-fade';
  stage.appendChild(white);
  void white.offsetWidth;

  white.style.opacity = '1';
  await new Promise(r => setTimeout(r, 500));

  let GamePageMod = null;
  try {
    GamePageMod = await import('./ui-game.js');
    await GamePageMod.GamePage.enter({ i: targetIndex, mode: mode, reveal: false });
    if (GamePageMod.GamePage) {
      GamePageMod.GamePage._enterBtnIndex  = targetIndex;
      GamePageMod.GamePage._enterScrollTop = savedScrollTop;
      GamePageMod.GamePage._enterFromStory = true;
    }
  } catch (e) {}

  if (storyLayer) storyLayer.classList.remove('show');
  pageGame.classList.add('active');
  pageMain.classList.remove('active');
  Router.setCurrent('game');

  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  if (GamePageMod && GamePageMod.GamePage) {
    GamePageMod.GamePage.setBgReady(true);
    GamePageMod.GamePage.setRevealed(true, false, 600);
  }

  const crossPromise = GameBg.crossFadeEnter(enterCh, 600).catch(() => {});

  white.style.transition = 'opacity 600ms ease';
  white.style.opacity    = '0';
  await new Promise(r => setTimeout(r, 700));

  if (white.parentNode) white.parentNode.removeChild(white);
  await crossPromise;
  _transitioning = false;
}

async function playLevelTransition(btn, mode, chapterNumber, targetIndex) {
  if (_transitioning) return;
  _transitioning = true;

  const stage    = document.getElementById('stage');
  const pageMain = document.getElementById('page-main');
  const pageGame = document.getElementById('page-game');
  const selScroller    = document.querySelector('#scene-select .sel-scroll');
  const savedScrollTop = selScroller ? selScroller.scrollTop : 0;

  try { btn.getAnimations().forEach(a => a.finish()); } catch (_) {}
  void btn.offsetWidth;

  const allBtns = Array.from(document.querySelectorAll('#sel-track .lv-btn'));
  const btnIndex = allBtns.indexOf(btn);

  const oldCh = Archive.parse().chapter;
  GameBg.prepareEnter(oldCh);

  const btnRect   = btn.getBoundingClientRect();
  const stageRect = stage.getBoundingClientRect();

  const designW = stage.offsetWidth  || 900;
  const designH = stage.offsetHeight || 1600;
  const scaleX  = (stageRect.width  / designW) || 1;
  const scaleY  = (stageRect.height / designH) || 1;

  const targetScreenX = stageRect.left + stageRect.width  / 2;
  const targetScreenY = stageRect.top  + stageRect.height / 2;
  const dxScreen = targetScreenX - (btnRect.left + btnRect.width  / 2);
  const dyScreen = targetScreenY - (btnRect.top  + btnRect.height / 2);
  const dxLocal = dxScreen / scaleX;
  const dyLocal = dyScreen / scaleY;

  const ghost = btn.cloneNode(true);
  ghost.removeAttribute('id');
  ghost.classList.add('lv-ghost');
  ghost.querySelectorAll('.lv-label').forEach(el => el.remove());
  ghost.style.cssText = [
    'position: fixed',
    `left: ${btnRect.left}px`, `top: ${btnRect.top}px`,
    `width: ${btnRect.width}px`, `height: ${btnRect.height}px`,
    'margin: 0', 'box-sizing: border-box', 'transform: none',
    'opacity: 1', 'animation: none', 'transition: none',
    'z-index: 99999', 'pointer-events: none', 'will-change: transform'
  ].join('; ');
  ghost.querySelectorAll('*').forEach(el => {
    el.style.animation  = 'none'; el.style.transition = 'none';
  });
  document.body.appendChild(ghost);

  const prevVisibility = btn.style.visibility;
  btn.style.visibility = 'hidden';

  const fgEls = [
    document.getElementById('main-content'),
    document.querySelector('#scene-select .sel-scroll'),
  ].filter(Boolean);

  const fgSnapshot = fgEls.map(el => ({
    el, transition: el.style.transition, transform: el.style.transform,
    opacity: el.style.opacity, willChange: el.style.willChange, transformOrigin: el.style.transformOrigin,
  }));

  fgEls.forEach(el => {
    el.style.transition = 'none'; el.style.transform = ''; el.style.opacity = ''; el.style.willChange = 'transform, opacity';
  });

  void ghost.offsetWidth;
  void stage.offsetWidth;

  const EASE_MOVE = 'cubic-bezier(.4,.05,.3,1)';
  fgEls.forEach(el => {
    el.style.transition = `transform ${MOVE_MS}ms ${EASE_MOVE}, opacity ${MOVE_MS}ms ease`;
    el.style.transformOrigin = 'center center';
  });
  ghost.style.transition = `transform ${MOVE_MS}ms ${EASE_MOVE}`;
  pageMain.classList.add('fading-out');

  requestAnimationFrame(() => {
    fgEls.forEach(el => {
      el.style.transform = `translate(${dxLocal}px, ${dyLocal}px)`; el.style.opacity = '0';
    });
    ghost.style.transform = `translate(${dxScreen}px, ${dyScreen}px)`;
  });

  await new Promise(r => setTimeout(r, MOVE_MS));

  let GamePageMod = null;
  const gamePromise = (async () => {
    try {
      GamePageMod = await import('./ui-game.js');
      await GamePageMod.GamePage.enter({ i: targetIndex, mode: mode, reveal: false });
      if (GamePageMod.GamePage) {
        if (btnIndex >= 0) GamePageMod.GamePage._enterBtnIndex = btnIndex;
        GamePageMod.GamePage._enterScrollTop = savedScrollTop;
        GamePageMod.GamePage._enterFromStory = false;
      }
    } catch (e) {}
  })();

  await new Promise(r => setTimeout(r, HOLD_MS));
  ghost.style.opacity = '0';

  const stageOrigPos = stage.style.position;
  if (getComputedStyle(stage).position === 'static') stage.style.position = 'relative';

  const finalSrc = transitionImgSrc(mode, chapterNumber);
  const overlay  = document.createElement('img');
  overlay.className = 'level-transition';
  if (finalSrc) {
    try {
      const loaded = await loadImage(finalSrc);
      overlay.src = loaded.src;
    } catch (_) {}
  }
  overlay.style.position        = 'fixed';
  overlay.style.left            = (targetScreenX - btnRect.width  / 2) + 'px';
  overlay.style.top             = (targetScreenY - btnRect.height / 2) + 'px';
  overlay.style.width           = btnRect.width  + 'px';
  overlay.style.height          = btnRect.height + 'px';
  overlay.style.opacity         = '1';
  overlay.style.zIndex          = '1000';
  overlay.style.pointerEvents   = 'none';
  overlay.style.transformOrigin = 'center center';
  document.body.appendChild(overlay);
  try { await overlay.decode?.(); } catch (_) {}

  try { await gamePromise; } catch (_) {}

  pageGame.classList.add('active');
  pageMain.classList.remove('active');
  Router.setCurrent('game');

  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  overlay.style.transition = `transform ${BOOM_MS}ms cubic-bezier(.4,0,.2,1), opacity ${BOOM_MS}ms ease`;

  if (GamePageMod && GamePageMod.GamePage) GamePageMod.GamePage.setBgReady(true);

  const boomScale = computeBoomScale(stageRect, btnRect.width, btnRect.height);
  requestAnimationFrame(() => {
    overlay.style.transform = `scale(${boomScale.toFixed(3)})`; overlay.style.opacity   = '0';
  });

  GameBg.crossFadeEnter(chapterNumber, BOOM_MS);
  if (GamePageMod && GamePageMod.GamePage) GamePageMod.GamePage.setRevealed(true, false, BOOM_MS);

  await new Promise(r => setTimeout(r, TOTAL_MS + 100));
  if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  if (ghost.parentNode)   ghost.parentNode.removeChild(ghost);

  btn.style.visibility = prevVisibility;
  stage.style.position = stageOrigPos;

  fgSnapshot.forEach(s => {
    s.el.style.transition = s.transition; s.el.style.transform = s.transform;
    s.el.style.opacity = s.opacity; s.el.style.willChange = s.willChange;
    s.el.style.transformOrigin = s.transformOrigin;
  });

  pageMain.classList.remove('fading-out');
  _transitioning = false;
}

const carousel = {
  slides: Array.from(document.querySelectorAll('.slide')),
  dots  : Array.from(document.querySelectorAll('#dots button')),
  title : document.getElementById('chapter-name'),
  index : 0,
  currentMode() {
    const s = this.slides[this.index];
    const m = s && parseInt(s.dataset.mode, 10);
    return Number.isFinite(m) && m >= 1 && m <= 3 ? m : 1;
  },
  init() {
    this.updateTitle(this.index);
    this.dots.forEach((dot, i) => dot.addEventListener('click', () => { playSafely('click'); this.go(i); }));
    let armed = false, startX = 0, startY = 0, moved = false, activeId = null;
    const box = document.getElementById('carousel');
    box.addEventListener('pointerdown', e => {
      armed = true; activeId = e.pointerId;
      startX = e.clientX; startY = e.clientY; moved = false;
      try { box.setPointerCapture(e.pointerId); } catch (_) {}
    });
    box.addEventListener('pointermove', e => {
      if (!armed || e.pointerId !== activeId || moved) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
        moved = true; dx < 0 ? this.next() : this.prev();
      }
    });
    const reset = e => {
      if (e && activeId != null && e.pointerId !== activeId) return;
      armed = false; moved = false;
      if (activeId != null) {
        try { box.releasePointerCapture(activeId); } catch (_) {}
        activeId = null;
      }
    };
    box.addEventListener('pointerup', reset);
    box.addEventListener('pointercancel', reset);
    preloadMode(this.currentMode());
  },
  updateTitle(i) {
    const s = this.slides[i];
    if (!s || !this.title) return;
    const t = s.dataset.title || '';
    if (this.title.textContent === t) return;
    this.title.style.opacity = '0';
    setTimeout(() => {
      this.title.textContent = t; this.title.style.opacity = '1';
    }, 180);
  },
  go(i) {
    const n = this.slides.length;
    i = (i + n) % n;
    this.slides.forEach((s, k) => {
      s.classList.remove('active', 'prev');
      if (k === i) s.classList.add('active');
      else if (k === this.index) s.classList.add('prev');
    });
    this.dots.forEach((d, k) => d.classList.toggle('active', k === i));
    this.index = i;
    this.updateTitle(i);
    preloadMode(this.currentMode());
  },
  next() { this.go(this.index + 1); },
  prev() { this.go(this.index - 1); }
};

const Select = {
  parsed: null,
  currentMode: 1,
  async load(mode = 1) {
    this.currentMode = mode;
    const mod = await import('./world.js');
    const raw = await mod.MapSource.load();
    this.parsed = mod.MapParser.parse(raw);
    loadStoryData().catch(() => null);
  },

  render() {
    if (!this.parsed) return;
    const track = document.getElementById('sel-track');
    track.innerHTML = '';

    const curUnlocked = Archive.parse().chapter;
    let gi = 0; 
    let modeChCount = 0;
    
    const modeOffset = this.currentMode === 3 ? 11 : (this.currentMode === 2 ? 18 : 0);

    const base = this.currentMode === 3 ? '../image/select/icons/select_button2/' : (this.currentMode === 2 ? '../image/select/icons/select_button3/' : '../image/select/icons/select_button1/');
    const prefix = this.currentMode === 3 ? '3' : (this.currentMode === 2 ? '2' : '');
    
    const levelIconSrc = (localCh, lv, absCh) => {
      const st = Archive.levelState(absCh, lv);
      const sfx = st === 'passed' ? '2' : st === 'current' ? '3' : '1';
      return base + prefix + 'select_button' + localCh + '_' + sfx + '.png';
    };
    
    const chapterKeyIconSrc = (localCh, unlocked) => {
      return unlocked ? base + prefix + 'plot_key' + localCh + '.png' : base + prefix + 'lock_button' + localCh + '1.png';
    };
    
    const chapterDecoSrc = localCh => base + prefix + 'decoration_' + localCh + '.png';

    this.parsed.chapters.forEach((ch) => {
      if (ch.mode !== this.currentMode) {
        gi += ch.levels.length;
        return; 
      }
      
      const localChapter = modeChCount + 1;
      const absChapter = modeOffset + localChapter;
      modeChCount++;
      
      const isUnlocked = Archive.chapterState(absChapter) !== 'locked';
      const firstLevelIndex = gi; 

      const group = document.createElement('div');
      group.className = 'ch-group';
      group.dataset.chapter = localChapter;
      group.style.animationDelay = (localChapter * 55) + 'ms';

      const row = document.createElement('div');
      row.className = 'lv-row';

      ch.levels.forEach((lv, li) => {
        const myIndex = gi++; 
        const levelNumber = li + 1;
        const state = Archive.levelState(absChapter, levelNumber);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'lv-btn ' + (state === 'passed' ? 'lv-passed' : state === 'current' ? 'lv-current' : 'lv-locked');
        btn.style.animationDelay = (localChapter * 55 + li * 22) + 'ms';

        const img = document.createElement('img');
        loadImage(levelIconSrc(localChapter, levelNumber, absChapter)).then(i => { img.src = i.src; }).catch(() => {});
        img.alt = ch.name + ' · ' + levelNumber;
        btn.appendChild(img);

        const label = document.createElement('span');
        label.className = 'lv-label';
        label.textContent = localChapter + '-' + levelNumber;
        btn.appendChild(label);

        if (state !== 'locked') {
          btn.addEventListener('click', () => {
            if (_transitioning) return;
            playSafely('click');
            playLevelTransition(btn, this.currentMode, localChapter, myIndex);
          });
        } else {
          btn.disabled = true;
        }
        row.appendChild(btn);
      });

      group.appendChild(row);

      const keyRow = document.createElement('div');
      keyRow.className = 'ch-key-row';

      const keyBtn = document.createElement('button');
      keyBtn.type = 'button';
      keyBtn.className = 'ch-key-btn' + (isUnlocked ? '' : ' locked');
      keyBtn.style.animationDelay = (localChapter * 55) + 'ms';
      if (!isUnlocked) keyBtn.disabled = true;

      const keyImg = document.createElement('img');
      loadImage(chapterKeyIconSrc(localChapter, isUnlocked)).then(i => { keyImg.src = i.src; }).catch(() => {});
      keyImg.alt = ch.name + ' · 0';
      keyBtn.appendChild(keyImg);

      if (isUnlocked) {
        keyBtn.addEventListener('click', () => {
          if (_transitioning) return;
          playSafely('click');
          openStory(this.currentMode, localChapter, firstLevelIndex);
        });
      }

      keyRow.appendChild(keyBtn);

      const deco = document.createElement('div');
      deco.className = 'ch-deco';

      const decoImg = document.createElement('img');
      decoImg.className = 'ch-deco-img';
      loadImage(chapterDecoSrc(localChapter)).then(i => { decoImg.src = i.src; }).catch(() => {});
      decoImg.alt = '';
      deco.appendChild(decoImg);

      const decoName = document.createElement('div');
      decoName.className = 'ch-deco-name';
      decoName.textContent = ch.name;
      deco.appendChild(decoName);

      keyRow.appendChild(deco);
      group.appendChild(keyRow);

      track.appendChild(group);
    });

    // =======================================================
    // ★ 追加最终关卡按钮
    // =======================================================
    const finalLocalChapter = modeChCount + 1;
    const finalAbsChapter = modeOffset + finalLocalChapter;
    const isFinalUnlocked = Archive.chapterState(finalAbsChapter) !== 'locked';
    
    let btnNum = '';
    if (this.currentMode === 1) btnNum = '12';
    else if (this.currentMode === 3) btnNum = '8';
    else if (this.currentMode === 2) btnNum = '7';
    
    let sfx = isFinalUnlocked ? '3' : '1';

    const finalGroup = document.createElement('div');
    finalGroup.className = 'ch-group';
    finalGroup.dataset.chapter = finalLocalChapter;
    finalGroup.style.animationDelay = (finalLocalChapter * 55) + 'ms';

    const finalRow = document.createElement('div');
    finalRow.className = 'lv-row';

    const finalBtn = document.createElement('button');
    finalBtn.type = 'button';
    finalBtn.className = 'lv-btn ' + (isFinalUnlocked ? 'lv-current' : 'lv-locked');
    finalBtn.style.animationDelay = (finalLocalChapter * 55) + 'ms';

    const finalImg = document.createElement('img');
    loadImage(base + prefix + 'select_button' + btnNum + '_' + sfx + '.png').then(i => { finalImg.src = i.src; }).catch(() => {});
    finalImg.alt = '最终';
    finalBtn.appendChild(finalImg);

    const finalLabel = document.createElement('span');
    finalLabel.className = 'lv-label';
    finalLabel.textContent = finalLocalChapter + '-1';
    finalBtn.appendChild(finalLabel);

    if (isFinalUnlocked) {
      finalBtn.addEventListener('click', () => {
        if (_transitioning) return;
        playSafely('click');
        this.handleFinalBtn();
      });
    } else {
      finalBtn.disabled = true;
    }
    
    finalRow.appendChild(finalBtn);
    finalGroup.appendChild(finalRow);
    track.appendChild(finalGroup);

    try { sessionStorage.setItem('tsw_seenChapter', String(curUnlocked)); } catch (_) {}

    this.buildSilhouetteLayers();
    this.bindSilhouetteScroll();
  },

  handleFinalBtn() {
    const mode = this.currentMode;
    if (mode === 1) {
      Archive.save({ unlocked: '12-1' }).then(() => {
        if (carousel) carousel.go(1);
        this.load(3).then(() => {
          this.render();
          this.scrollToStart();
          playBgmLoop('bgm_select');
        });
      });
    } else if (mode === 3) {
      Archive.save({ unlocked: '19-1' }).then(() => {
        if (carousel) carousel.go(2);
        this.load(2).then(() => {
          this.render();
          this.scrollToStart();
          playBgmLoop('bgm_select');
        });
      });
    } else {
      toast('已经到达最终的世界');
    }
  },

  scrollToStart() {
    const scroller = document.getElementById('sel-scroll');
    if (!scroller) return;
    void scroller.scrollHeight; void scroller.offsetHeight;
    scroller.scrollTop = scroller.scrollHeight; void scroller.scrollTop;
  },

  scrollToCurrent({ smooth = false } = {}) {
    const track    = document.getElementById('sel-track');
    const scroller = document.getElementById('sel-scroll');
    if (!track || !scroller) return;
    track.querySelectorAll('.ch-group, .lv-btn, .ch-key-btn').forEach(el => {
      try { el.getAnimations().forEach(a => a.finish()); } catch (_) {}
    });
    void track.offsetHeight; void scroller.scrollHeight;
    for (const id of ['stage', 'page-main', 'scene-select']) {
      const el = document.getElementById(id);
      if (el && el.scrollTop) el.scrollTop = 0;
    }
    const u = Archive.parse();
    const groups = track.querySelectorAll('.ch-group');
    const target = groups[u.chapter - 1];
    if (!target) return;
    let targetTop = target.offsetTop;
    if (target.offsetParent && target.offsetParent !== scroller) {
      let node = target; targetTop = 0;
      while (node && node !== scroller && node !== document.body) {
        targetTop += node.offsetTop; node = node.offsetParent;
      }
    }
    const centerOffset = (target.offsetHeight - scroller.clientHeight) / 2;
    const rawTop = targetTop + centerOffset;
    const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const finalTop = Math.max(0, Math.min(maxTop, rawTop));
    if (smooth) { try { scroller.scrollTo({ top: finalTop, behavior: 'smooth' }); } catch (_) { scroller.scrollTop = finalTop; } }
    else { scroller.scrollTop = finalTop; }
  },

  scrollToIndex(index, { smooth = false } = {}) {
    const track    = document.getElementById('sel-track');
    const scroller = document.getElementById('sel-scroll');
    if (!track || !scroller) return;
    track.querySelectorAll('.ch-group, .lv-btn, .ch-key-btn').forEach(el => {
      try { el.getAnimations().forEach(a => a.finish()); } catch (_) {}
    });
    void track.offsetHeight; void scroller.scrollHeight;
    for (const id of ['stage', 'page-main', 'scene-select']) {
      const el = document.getElementById(id);
      if (el && el.scrollTop) el.scrollTop = 0;
    }
    const btns = track.querySelectorAll('.lv-btn');
    const target = btns[index] || null;
    if (!target) { this.scrollToCurrent({ smooth }); return; }
    const group = target.closest('.ch-group') || target;
    let targetTop = group.offsetTop;
    if (group.offsetParent && group.offsetParent !== scroller) {
      let node = group; targetTop = 0;
      while (node && node !== scroller && node !== document.body) {
        targetTop += node.offsetTop; node = node.offsetParent;
      }
    }
    const centerOffset = (group.offsetHeight - scroller.clientHeight) / 2;
    const rawTop = targetTop + centerOffset;
    const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const finalTop = Math.max(0, Math.min(maxTop, rawTop));
    if (smooth) { try { scroller.scrollTo({ top: finalTop, behavior: 'smooth' }); } catch (_) { scroller.scrollTop = finalTop; } }
    else { scroller.scrollTop = finalTop; }
  },

  // =======================================================
  // ★ 剪影视差层核心逻辑
  // =======================================================
  getSilhouetteSrc(mode, chapter) {
    if (mode === 1) return `../image/select/silhouette/silhouette_${chapter}.png`;
    if (mode === 3) return `../image/select/silhouette/silhouette3_${chapter}.png`;
    return `../image/select/silhouette/silhouette2_${chapter}.png`;
  },

  buildSilhouetteLayers() {
    const container = document.getElementById('sel-silhouette');
    if (!container) return;
    container.innerHTML = '';

    const track = document.getElementById('sel-track');
    if (!track) return;
    const groups = track.querySelectorAll('.ch-group');

    groups.forEach((group) => {
      const chapter = parseInt(group.dataset.chapter, 10);
      if (isNaN(chapter)) return;

      const src = this.getSilhouetteSrc(this.currentMode, chapter);
      const extraSrc = (this.currentMode === 1 && chapter === 9)
        ? `../image/select/silhouette/silhouette_9_2.png`
        : null;

      const div = document.createElement('div');
      div.className = 'sil-item';
      div.dataset.chapter = chapter;
      container.appendChild(div);

      Promise.all([
        loadImage(src).catch(() => null),
        extraSrc ? loadImage(extraSrc).catch(() => null) : Promise.resolve(null)
      ]).then(([img1, img2]) => {
        if (!img1) return;
        if (img2) {
          div.style.backgroundImage = `url('${img2.src}'), url('${img1.src}')`;
        } else {
          div.style.backgroundImage = `url('${img1.src}')`;
        }
        // 首帧渲染定位一次
        this.updateSilhouetteParallax();
      });
    });

    this.updateSilhouetteParallax();
  },

  updateSilhouetteParallax() {
    const scroller = document.getElementById('sel-scroll');
    const container = document.getElementById('sel-silhouette');
    const track = document.getElementById('sel-track');
    if (!scroller || !container || !track) return;

    const scRect = scroller.getBoundingClientRect();
    const viewCenterY = scRect.top + scRect.height / 2;
    const viewH = scRect.height;

    // 中心区域速度系数（越小越慢）
    const CENTER_SPEED = 0.25;
    // 章节离开视口边缘的临界距离（占视口高度的比例）
    const EDGE_DIST = viewH * 0.45;
    // 边缘加速倍数（章节完全滑出后剪影跟随划出的速度倍数）
    const EDGE_BOOST = 1.8;

    const groups = Array.from(track.querySelectorAll('.ch-group'));
    const sils = Array.from(container.querySelectorAll('.sil-item'));
    const silByChapter = new Map();
    sils.forEach(s => {
      const ch = parseInt(s.dataset.chapter, 10);
      if (!isNaN(ch)) silByChapter.set(ch, s);
    });

    groups.forEach(group => {
      const chapter = parseInt(group.dataset.chapter, 10);
      if (isNaN(chapter)) return;
      const sil = silByChapter.get(chapter);
      if (!sil) return;

      const gRect = group.getBoundingClientRect();
      const gCenterY = gRect.top + gRect.height / 2;
      const y = gCenterY - viewCenterY;  // 章节组中心相对视口中心偏移

      const t = Math.abs(y) / EDGE_DIST;
      let h;
      if (t <= 1) {
        // 中心到边缘：h 从 0→1，位移速度由 CENTER_SPEED 逐渐增加到 1
        h = CENTER_SPEED * t + (1 - CENTER_SPEED) * t * t;
      } else {
        // 超出边缘：剪影继续跟随，并以 EDGE_BOOST 倍速滑出屏幕
        h = 1 + (t - 1) * EDGE_BOOST;
      }
      const silY = Math.sign(y) * EDGE_DIST * h;

      // ★ 保持视差位移的同时，整体缩小为原来的 0.75 倍
      sil.style.transform = `translateY(${silY.toFixed(2)}px) scale(0.6)`;
    });
  },

  bindSilhouetteScroll() {
    const scroller = document.getElementById('sel-scroll');
    if (!scroller || scroller.dataset.silBound) return;
    scroller.dataset.silBound = '1';

    let ticking = false;
    const update = () => {
      this.updateSilhouetteParallax();
      ticking = false;
    };
    scroller.addEventListener('scroll', () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    }, { passive: true });
  }
};

function initSettings() {
  const panel     = document.getElementById('settings');
  const musicIcon = document.getElementById('music-icon');
  const soundIcon = document.getElementById('sound-icon');
  const ICON = {
    musicOn : '../image/bg_title/music_button.png',
    musicOff: '../image/bg_title/offmusic_button.png',
    soundOn : '../image/bg_title/sound_button.png',
    soundOff: '../image/bg_title/offsound_button.png'
  };
  const syncIcons = () => {
    const musicSrc = Audio.isMusicMuted() ? ICON.musicOff : ICON.musicOn;
    const soundSrc = Audio.isSfxMuted()   ? ICON.soundOff : ICON.soundOn;
    if (musicIcon) loadImage(musicSrc).then(img => { musicIcon.src = img.src; }).catch(() => {});
    if (soundIcon) loadImage(soundSrc).then(img => { soundIcon.src = img.src; }).catch(() => {});
  };
  syncIcons();
  const popOnce = el => {
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    setTimeout(() => el.classList.remove('pop'), 400);
  };
  document.getElementById('btn-setup').addEventListener('click', () => { playSafely('click'); panel.classList.add('show'); });
  document.getElementById('btn-settings-close').addEventListener('click', () => { playSafely('click'); panel.classList.remove('show'); });
  panel.addEventListener('click', e => { if (e.target === panel) panel.classList.remove('show'); });
  document.getElementById('btn-music').addEventListener('click', () => {
    playSafely('click'); try { Audio.setMusicMuted(!Audio.isMusicMuted()); } catch (_) {} syncIcons(); popOnce(musicIcon);
  });
  document.getElementById('btn-sound').addEventListener('click', () => {
    playSafely('click'); try { Audio.setSfxMuted(!Audio.isSfxMuted()); } catch (_) {} syncIcons(); popOnce(soundIcon);
  });
  document.getElementById('btn-help').addEventListener('click', () => { playSafely('click'); toast('帮 助 内 容 即 将 上 线'); });
  document.getElementById('btn-about').addEventListener('click', () => { playSafely('click'); toast('同 一 个 世 界 · 2026'); });
}

export const MainPage = {
  el: document.getElementById('page-main'),
  _inited: false,
  _selectOpened: false,

  async enter() {
    _transitioning = false;
    if (!this._inited) {
      this._inited = true;
      carousel.init();
      initSettings();
      document.getElementById('btn-start').addEventListener('click', () => { playSafely('click'); this.openSelect(); });
      document.getElementById('sel-back').addEventListener('click', () => { playSafely('click'); this.closeSelect(); });
    }
    try { await Archive.load(); } catch (_) {}
    const u = Archive.parse();
    const ch = Math.min(11, Math.max(1, u.chapter));
    MainBg.go(ch); SelectBg.go(ch);
    this.closeSelect();
    playBgmLoop('bgm_home');
    const content = document.getElementById('main-content');
    content.classList.remove('fade-in-ready');
    requestAnimationFrame(() => { setTimeout(() => content.classList.add('fade-in-ready'), 400); });
    if (!Select.parsed) Select.load(1).catch(() => {});
  },

  async openSelect() {
    const mode = carousel.currentMode();

    if (this._selectOpened) {
      try { await Archive.load(); } catch (_) {}
      if (Select.parsed) {
        Select.render();
        const sc = document.getElementById('sel-scroll');
        if (sc) void sc.scrollHeight;
        Select.scrollToCurrent({ smooth: false });
        const u = Archive.parse();
        const ch = Math.min(11, Math.max(1, u.chapter));
        MainBg.go(ch); SelectBg.go(ch);
      }
      return;
    }
    this._selectOpened = true;
    _selectT0 = performance.now();

    try { await Select.load(mode); }
    catch (_) {
      toast('关卡数据加载失败'); this._selectOpened = false; _selectT0 = 0;
      return;
    }
    try { await Archive.load(); } catch (_) {}

    Select.render();
    const scroller0 = document.getElementById('sel-scroll');
    if (scroller0) void scroller0.scrollHeight;
    Select.scrollToStart();

    const pageMain = document.getElementById('page-main');
    const sceneSelect = document.getElementById('scene-select');
    pageMain.classList.add('sel-open');

    const ended = await new Promise(resolve => {
      let done = false;
      const finish = (src) => { if (done) return; done = true; sceneSelect.removeEventListener('transitionend', onEnd); clearTimeout(fallbackTimer); resolve(src); };
      const onEnd = (e) => { if (e.target !== sceneSelect) return; if (e.propertyName !== 'transform') return; finish('transitionend'); };
      sceneSelect.addEventListener('transitionend', onEnd);
      const fallbackTimer = setTimeout(() => finish('fallback'), SCENE_SLIDE_MS + SCENE_BUFFER_MS + 200);
    });

    const u = Archive.parse();
    const targetCh = Math.min(11, Math.max(1, u.chapter));
    Select.scrollToCurrent({ smooth: true });

    const estimate = 400 + Math.min(600, targetCh * 50);
    setTimeout(() => { _selectT0 = 0; }, estimate);

    const ch = Math.min(11, Math.max(1, u.chapter));
    MainBg.go(ch); SelectBg.go(ch);
    playBgmLoop('bgm_select');
    preloadMode(mode);
  },

  closeSelect() {
    if (!this._selectOpened) return;
    this._selectOpened = false;
    document.getElementById('page-main').classList.remove('sel-open');
    playBgmLoop('bgm_home');
  },

  async refreshSelect(targetBtnIndex, targetScrollTop) {
    try { await Archive.load(); } catch (_) {}
    if (!Select.parsed) {
      try { await Select.load(Select.currentMode || 1); } catch (_) { return; }
    }
    Select.render();

    const sc = document.getElementById('sel-scroll');
    if (!sc) return;
    void sc.scrollHeight;

    const track = document.getElementById('sel-track');
    if (track) {
      track.querySelectorAll('.ch-group, .lv-btn, .ch-key-btn').forEach(el => {
        try { el.getAnimations().forEach(a => a.finish()); } catch (_) {}
      });
      void track.offsetHeight;
    }

    const maxTop = Math.max(0, sc.scrollHeight - sc.clientHeight);
    if (Number.isFinite(targetScrollTop) && targetScrollTop >= 0) {
      const finalTop = Math.max(0, Math.min(maxTop, targetScrollTop));
      sc.scrollTop = finalTop;
    } else if (Number.isFinite(targetBtnIndex) && targetBtnIndex >= 0) {
      Select.scrollToIndex(targetBtnIndex, { smooth: false });
    } else {
      Select.scrollToCurrent({ smooth: false });
    }

    const u = Archive.parse();
    const ch = Math.min(11, Math.max(1, u.chapter));
    MainBg.go(ch); SelectBg.go(ch);
  }
};