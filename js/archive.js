/* =========================================================
 *  js/archive.js — 混合存档
 *
 *  · 启动时探测 archive.json 是否可写：
 *      - 可写   → mode = 'server'，读写走 HTTP（局域网 main.cpp）
 *      - 不可写 → mode = 'local'，读写走 localStorage（静态部署）
 *  · 对外 API 与旧版完全一致：load / save / parse / levelState / chapterState / hints
 * ========================================================= */

const ARCHIVE_URL  = 'archive.json';
const STORAGE_KEY  = 'tsw_archive_v1';
const DEFAULT_STATE = { unlocked: '1-1', hints: 3 };
const DEFAULT_HINTS = 3;

function clampInt(v, min, max, def) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}

export const Archive = {
  data: { ...DEFAULT_STATE },
  loaded: false,

  /** 'unknown' | 'server' | 'local' */
  mode: 'unknown',

  /* ---------- 载入 ---------- */
  async load() {
    // 只有第一次才探测；后续 load 直接按已有模式读数据
    if (this.mode === 'unknown') {
      this.mode = (await this._probeServerWritable()) ? 'server' : 'local';
      // 调试时可打开：
      // console.log('[Archive] mode =', this.mode);
    }

    if (this.mode === 'server') await this._loadFromServer();
    else                        await this._loadFromLocal();

    this.loaded = true;
    return this.data;
  },

  /* ---------- 保存 ---------- */
  async save(patch) {
    if (patch && typeof patch === 'object') Object.assign(this.data, patch);
    this.data.updatedAt = new Date().toISOString();

    if (this.mode === 'server') return this._saveToServer();
    return this._saveToLocal();
  },

  /* ---------- 模式查询（可选给 UI 用） ---------- */
  getMode()      { return this.mode; },
  isServerMode() { return this.mode === 'server'; },
  getModeLabel() {
    if (this.mode === 'server') return '服务器存档';
    if (this.mode === 'local')  return '本地存档';
    return '未初始化';
  },
  /** 调试：强制重新探测（例如切换部署环境后） */
  async resetMode() {
    this.mode = 'unknown';
    this.loaded = false;
    await this.load();
  },

  /* =========================================================
   *  内部：数据映射
   * ========================================================= */
  _applyState(j) {
    this.data.unlocked =
      typeof j.unlocked === 'string' && /^\d+-\d+$/.test(j.unlocked)
        ? j.unlocked : DEFAULT_STATE.unlocked;
    this.data.hints =
      Number.isFinite(+j.hints) ? clampInt(j.hints, 0, 999, DEFAULT_HINTS)
                                : DEFAULT_HINTS;
  },

  /* =========================================================
   *  内部：服务器模式
   * ========================================================= */
  async _loadFromServer() {
    try {
      const res = await fetch(ARCHIVE_URL + '?_t=' + Date.now(), { cache: 'no-store' });
      if (res.ok) {
        const j = await res.json();
        if (j && typeof j === 'object') { this._applyState(j); return; }
      }
    } catch (_) { /* 网络抖动 → 用默认值，不覆盖服务器 */ }
    this._applyState(DEFAULT_STATE);
  },

  async _saveToServer() {
    try {
      const res = await fetch(ARCHIVE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.data)
      });
      return res.ok;
    } catch (_) {
      return false;
    }
  },

  /* =========================================================
   *  内部：本地模式
   * ========================================================= */
  async _loadFromLocal() {
    // 1. 优先 localStorage
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const j = JSON.parse(raw);
        if (j && typeof j === 'object') { this._applyState(j); return; }
      }
    } catch (_) {}

    // 2. 首次迁移：只读 archive.json 作为初始档
    try {
      const res = await fetch(ARCHIVE_URL + '?_t=' + Date.now(), { cache: 'no-store' });
      if (res.ok) {
        const j = await res.json();
        if (j && typeof j === 'object') {
          this._applyState(j);
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data)); } catch (_) {}
          return;
        }
      }
    } catch (_) {}

    // 3. 默认
    this._applyState(DEFAULT_STATE);
  },

  async _saveToLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
      return true;
    } catch (_) {
      return false;   // 隐私模式 / 配额满
    }
  },

  /* =========================================================
   *  内部：可写性探测（写入→回读→恢复）
   * ========================================================= */
  async _probeServerWritable() {
    const token = 'probe_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);

    // ① 读取现有快照
    let original = null;
    let originalExists = false;
    try {
      const r = await fetch(ARCHIVE_URL + '?_t=' + Date.now(), { cache: 'no-store' });
      if (r.ok) {
        try { original = await r.json(); originalExists = true; } catch (_) {}
      }
    } catch (_) {}

    // ② 写入探测
    try {
      const probeBody = {
        ...(original || { unlocked: '1-1', hints: 3 }),
        _probe: token
      };
      const pr = await fetch(ARCHIVE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(probeBody)
      });
      if (!pr.ok) return false;

      // ③ 回读验证
      const vr = await fetch(ARCHIVE_URL + '?_t=' + Date.now(), { cache: 'no-store' });
      if (!vr.ok) return false;
      const back = await vr.json();
      if (!back || back._probe !== token) return false;
    } catch (_) {
      return false;
    }

    // ④ 恢复快照（无论成功与否都执行）
    try {
      const restoreBody = originalExists && original
        ? original
        : { unlocked: '1-1', hints: 3 };
      await fetch(ARCHIVE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(restoreBody)
      });
    } catch (_) {}

    return true;
  },

  /* =========================================================
   *  纯函数：解析与状态（与原版一致）
   * ========================================================= */
  parse() {
    const m = String(this.data.unlocked || '').match(/^(\d+)-(\d+)$/);
    if (!m) return { chapter: 1, level: 1 };
    return {
      chapter: Math.max(1, parseInt(m[1], 10)),
      level:   Math.max(1, parseInt(m[2], 10))
    };
  },

  levelState(chapter, level) {
    const u = this.parse();
    if (chapter < u.chapter) return 'passed';
    if (chapter > u.chapter) return 'locked';
    if (level < u.level)     return 'passed';
    if (level === u.level)   return 'current';
    return 'locked';
  },

  chapterState(chapter) {
    const u = this.parse();
    if (chapter === 1) return 'unlocked';
    if (chapter <= u.chapter) return 'unlocked';
    return 'locked';
  },

  hints() { return this.data.hints; }
};