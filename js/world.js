/* =========================================================
 *  js/world.js — 聚合入口
 * ========================================================= */
export {
  CFG, DEFAULT_ENDINGS, PATHS, SOUND_BASE, STAGE_W, STAGE_H
} from './config.js';

export {
  escapeHtml, showFatal, nl2br, layoutViewport
} from './utils.js';

export { MapSource, MapParser } from './data.js';
export { Game }       from './game.js';
export { Renderer }   from './renderer.js';
export { Audio }      from './audio.js';
export { Archive }    from './archive.js';

/* ★ 背景控制 */
export {
  preloadAllBackgrounds, preloadBackground, prepareLoadBg,
  MainBg, SelectBg, GameBg
} from './background.js';