import { SOUND_BASE } from './config.js';

const SOUND_DEFS = {
  /* ---- 音效 ---- */
  blip:          { files: ['blip1.mp3','blip2.mp3','blip3.mp3','blip4.mp3'], volume: 0.5 },
  cable_press:   { files: ['cable_press_1.mp3','cable_press_2.mp3','cable_press_3.mp3','cable_press_4.mp3','cable_press_5.mp3'], volume: 0.55 },
  cable_release: { files: ['cable_release_1.mp3','cable_release_2.mp3','cable_release_3.mp3','cable_release_4.mp3','cable_release_5.mp3'], volume: 0.55 },
  cable_line:    { files: ['cable_line.mp3'], volume: 0.42 },
  cable_no_way:  { files: ['cable_no_way.mp3'], volume: 0.7 },
  click:         { files: ['click_01.mp3','click_02.mp3','click_03.mp3'], volume: 0.65 },
  newLevelOpen:  { files: ['newLevelOpen_1.mp3','newLevelOpen_2.mp3','newLevelOpen_3.mp3'], volume: 0.65 },
  startDuang:    { files: ['startDuang_01.mp3','startDuang_02.mp3','startDuang_03.mp3','startDuang_04.mp3'], volume: 0.6 },
  gameSuccess:   { files: ['gameSuccess.mp3'], volume: 0.8 },
  gameFail:      { files: ['gameFail.mp3'],    volume: 0.8 },
  gameIntro:     { files: ['gameIntro.mp3'],   volume: 0.6 },
  mofaSound:     { files: ['mofaSound.mp3'],   volume: 0.6 },
  guaiwu:        { files: ['guaiwu.mp3'],      volume: 0.7 },
  doOverTSprite: { files: ['doOverTSprite.mp3'], volume: 0.6 },
  chgMove:       { files: ['chgMove.mp3'],     volume: 0.6 },
  moveYellow:    { files: ['moveYellow.mp3'],  volume: 0.6 },
  line_light:    { files: ['line_light.mp3'],  volume: 0.6 },
  hit_popup:     { files: ['hit_popup.mp3'],   volume: 0.6 },
  intro_text:    { files: ['intro_text.mp3'],  volume: 0.6 },
  tips:          { files: ['tips.mp3'],        volume: 0.7 },

  /* ---- BGM ---- */
  bgm_home:   { files: ['gameloop_01.mp3'],  loop: true, volume: 0.35 },
  bgm_select: { files: ['selectMusic1.mp3'], loop: true, volume: 0.35 },
  bgm_game:   { files: ['game_1.mp3'],       loop: true, volume: 0.30 }
};

class AudioManager {
  constructor() {
    this.base  = SOUND_BASE;
    this.muted = false;         // 全局总静音
    this.musicMuted = false;    // 音乐独立开关
    this.sfxMuted   = false;    // 音效独立开关

    this._pool    = new Map();
    this._bgmEl   = null;
    this._bgmName = null;
  }

  /* ---------- 内部 ---------- */
  _url(file) { return this.base + file; }

  _getPool(name) {
    if (this._pool.has(name)) return this._pool.get(name);
    const def = SOUND_DEFS[name];
    if (!def) return [];

    const pool = [];
    for (const f of def.files) {
      try {
        // ★ 关键：用 window.Audio 明确指向浏览器构造器，
        //   否则会命中本模块末尾 `export const Audio = ...`，
        //   触发 “Audio is not a constructor”。
        const a = new window.Audio(this._url(f));
        a.preload = 'auto';
        pool.push(a);
      } catch (_) { /* 单个失败不影响其它 */ }
    }
    this._pool.set(name, pool);
    return pool;
  }

  /* ---------- 一次性音效 ---------- */
  play(name) {
    if (this.muted || this.sfxMuted) return;
    const def = SOUND_DEFS[name];
    if (!def || def.loop) return;

    try {
      const pool = this._getPool(name);
      if (!pool.length) return;

      const el = pool[Math.floor(Math.random() * pool.length)];
      el.currentTime = 0;
      el.volume = def.volume ?? 0.7;
      const p = el.play();
      if (p && p.catch) p.catch(() => {});
    } catch (_) {}
  }

  /* ---------- BGM ---------- */
  _startBgm(name) {
    const def = SOUND_DEFS[name];
    if (!def || !def.loop) return;
    try {
      const el = new window.Audio(this._url(def.files[0]));   // ★ 同上
      el.loop   = true;
      el.volume = def.volume ?? 0.4;
      this._bgmEl = el;
      const p = el.play();
      if (p && p.catch) p.catch(() => {});
    } catch (_) {}
  }

  playBgm(name) {
    if (this._bgmName === name && this._bgmEl && !this._bgmEl.paused) return;

    const def = SOUND_DEFS[name];
    if (!def || !def.loop) return;

    this.stopBgm();
    this._bgmName = name;

    /* 记住用户想播放哪首，但不实际启动（等首次交互解锁） */
    if (this.muted || this.musicMuted) return;

    this._startBgm(name);
  }

  stopBgm() {
    if (this._bgmEl) {
      try { this._bgmEl.pause(); } catch (_) {}
      this._bgmEl = null;
    }
  }

  resumeBgm() {
    if (this._bgmEl && this._bgmEl.paused && !this.muted && !this.musicMuted) {
      const p = this._bgmEl.play();
      if (p && p.catch) p.catch(() => {});
    }
  }

  /* ---------- 全局静音 ---------- */
  setMuted(b) {
    this.muted = !!b;
    if (this._bgmEl) {
      this._bgmEl.muted = this.muted;
      if (!this.muted && this._bgmEl.paused) this.resumeBgm();
    }
  }
  toggleMute() { this.setMuted(!this.muted); return this.muted; }
  isMuted()    { return this.muted; }

  /* ---------- 音乐独立开关 ---------- */
  setMusicMuted(b) {
    const was = this.musicMuted;
    this.musicMuted = !!b;

    if (this.musicMuted) {
      if (this._bgmEl) {
        try { this._bgmEl.pause(); } catch (_) {}
        this._bgmEl = null;
      }
    } else if (was && this._bgmName) {
      this._startBgm(this._bgmName);
    }
  }
  isMusicMuted() { return this.musicMuted; }

  /* ---------- 音效独立开关 ---------- */
  setSfxMuted(b)  { this.sfxMuted = !!b; }
  isSfxMuted()    { return this.sfxMuted; }

  /* ---------- 事件绑定 ---------- */
  bind(game) {
    game.on('press',   () => this.play('cable_press'));
    game.on('release', () => this.play('cable_release'));
    game.on('extend',  () => this.play('cable_line'));
    game.on('blocked', () => this.play('cable_no_way'));
    game.on('fixHit',  () => this.play('guaiwu'));
    game.on('reset',   () => this.play('doOverTSprite'));
    game.on('hint',    () => this.play('tips'));
    game.on('win',     () => this.play('gameSuccess'));
    game.on('fail',    () => this.play('gameFail'));
  }
}

export const Audio = new AudioManager();