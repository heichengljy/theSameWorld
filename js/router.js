/* =========================================================
 *  js/router.js — 页面路由 / 过渡控制器
 *
 *  ★ 顺序调整：新页面先 active，旧页面再 leave。
 *    这样旧页面渐出时，新页面已经在下面渲染好，
 *    "游戏 → 主菜单"可以看到游戏页渐渐淡出，主菜单逐渐露出。
 * ========================================================= */
export const Router = {
  _pages: {},
  _current: null,

  register(name, ctrl) { this._pages[name] = ctrl; },

  init(name) {
    this._current = name;
    const c = this._pages[name];
    if (c) c.el.classList.add('active');
  },

  setCurrent(name) { this._current = name; },

  async go(name, params) {
    if (this._current === name) return;

    const oldName = this._current;
    const oldCtrl = oldName ? this._pages[oldName] : null;
    const newCtrl = this._pages[name];
    if (!newCtrl) return;

    /* ① 新页面先 active（DOM 里排在旧页面后面的会盖住前面） */
    newCtrl.el.classList.add('active');
    this._current = name;
    if (newCtrl.enter) await newCtrl.enter(params || {});

    /* ② 旧页面渐出 */
    if (oldCtrl) {
      if (oldCtrl.leave) try { await oldCtrl.leave(); } catch (_) {}
      oldCtrl.el.classList.remove('active');
    }
  }
};