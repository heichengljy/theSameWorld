/* =========================================================
 *  js/archive.js — 局域网共享存档
 *
 *  存储位置：根目录 archive.json（由 main.cpp 提供 GET/POST）
 *  字段：
 *    unlocked  : "6-9"  最新可玩关卡
 *    hints     : 3      剩余提示数量
 *    updatedAt : ISO 时间戳（可选）
 * ========================================================= */

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

  /* ---------- 载入 ---------- */
  async load() {
    try {
      const res = await fetch('archive.json?_t=' + Date.now(), {
        cache: 'no-store'
      });
      if (res.ok) {
        const j = await res.json();
        if (j && typeof j === 'object') {
          this.data.unlocked =
            typeof j.unlocked === 'string' && /^\d+-\d+$/.test(j.unlocked)
              ? j.unlocked : DEFAULT_STATE.unlocked;
          this.data.hints =
            Number.isFinite(+j.hints) ? clampInt(j.hints, 0, 999, DEFAULT_HINTS)
                                      : DEFAULT_HINTS;
        }
      }
    } catch (_) { /* 网络失败 → 用默认 */ }
    this.loaded = true;
    return this.data;
  },

  /* ---------- 保存 ---------- */
  async save(patch) {
    if (patch && typeof patch === 'object') {
      Object.assign(this.data, patch);
    }
    this.data.updatedAt = new Date().toISOString();
    try {
      const res = await fetch('archive.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.data)
      });
      return res.ok;
    } catch (_) {
      return false;
    }
  },

  /* ---------- 解析为 {chapter, level} ---------- */
  parse() {
    const m = String(this.data.unlocked || '').match(/^(\d+)-(\d+)$/);
    if (!m) return { chapter: 1, level: 1 };
    return {
      chapter: Math.max(1, parseInt(m[1], 10)),
      level:   Math.max(1, parseInt(m[2], 10))
    };
  },

  /* ---------- 状态查询 ----------
   * 返回 'passed' | 'current' | 'locked'
   */
  levelState(chapter, level) {
    const u = this.parse();
    if (chapter < u.chapter) return 'passed';
    if (chapter > u.chapter) return 'locked';
    if (level < u.level) return 'passed';
    if (level === u.level) return 'current';
    return 'locked';
  },

  chapterState(chapter) {
    const u = this.parse();
    if (chapter === 1) return 'unlocked';   // 第1章永远解锁
    if (chapter <= u.chapter) return 'unlocked';
    return 'locked';
  },

  hints() { return this.data.hints; }
};