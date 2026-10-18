export const CFG = {
  flipMs   : 260,
  fadeMs   : 340,
  padRatio : 0.24,
  minCell  : 22,
  maxCell  : 92,
  dprMax   : 3
};

export const DEFAULT_ENDINGS = {
  win : { texts: [] },
  fail: { texts: ['月亮已经用尽。'] }
};

export const PATHS = {
  chapters : 'json/chapters.json',
  levelDir : 'json/levels_and_tips/',
  strings  : 'json/strings/CNstrings/',
  success  : 'json/strings/CNstrings/successScene1.json',
  fail     : 'json/strings/CNstrings/failScene.json'
};

export const SOUND_BASE = '../sound/';

/* 16:9 竖屏逻辑画布 */
export const STAGE_W = 900;
export const STAGE_H = 1600;