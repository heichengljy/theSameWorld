/* =========================================================
 *  js/assets.js — 资源清单 + 检查器
 * ========================================================= */

const IMG_DIR  = '../image/';
const SND_DIR  = '../sound/';
const JSON_DIR = '../json/';

const _cache = {
  images: {},
  audios: {},
  blobs : {}
};
export function getPreloadedAssets() { return _cache; }

function bust(url) {
  return url + (url.includes('?') ? '&' : '?') + 't=' + Date.now();
}

function loadImage(url, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('image timeout ' + url));
    }, timeout);
    img.onload = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const done = (img.decode ? img.decode() : Promise.resolve()).catch(() => {});
      done.then(() => {
        _cache.images[url] = img;
        resolve(img);
      });
    };
    img.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error('image error ' + url));
    };
    img.src = url;
  });
}

function loadAudio(url, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const a = new window.Audio();
    let settled = false;
    const done = (ok, err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      a.removeEventListener('canplaythrough', onReady);
      a.removeEventListener('error', onErr);
      if (ok) { _cache.audios[url] = a; resolve(a); }
      else    { reject(err); }
    };
    const onReady = () => done(true);
    const onErr   = () => done(false, new Error('audio error ' + url));
    const timer   = setTimeout(() => done(false, new Error('audio timeout ' + url)), timeout);
    a.addEventListener('canplaythrough', onReady, { once: true });
    a.addEventListener('error',          onErr,   { once: true });
    a.preload = 'auto';
    a.src = url;
    try { a.load(); } catch (_) {}
  });
}

function loadJSON(url, timeout = 10000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  return fetch(url, { cache: 'no-store', signal: ctrl.signal })
    .then(res => {
      clearTimeout(timer);
      if (!res.ok) throw new Error('HTTP ' + res.status + ' @ ' + url);
      return res.json();
    })
    .then(j => { _cache.blobs[url] = j; return j; });
}

async function runPool(tasks, concurrency = 12) {
  const results = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (true) {
      const idx = next++;
      if (idx >= tasks.length) return;
      try { results[idx] = await tasks[idx](); }
      catch (e) { results[idx] = { error: e }; }
    }
  };
  const n = Math.min(concurrency, tasks.length);
  await Promise.all(Array.from({ length: n }, worker));
  return results;
}

const MAIN_IMAGES = [
  'bg_title/bg_1.jpg','bg_title/bg_2.jpg','bg_title/bg_3.jpg',
  'bg_title/bg_4.jpg','bg_title/bg_5.jpg','bg_title/bg_6.jpg',
  'bg_title/bg_7.jpg','bg_title/bg_8.jpg','bg_title/bg_9.jpg',
  'bg_title/bg_10.jpg','bg_title/bg_11.jpg',

  'bg_title/menu_title_cn.png',
  'bg_title/setupbutton_cn.png',
  'bg_title/start_button.png',
  'bg_title/start_sprite_cn.png',
  'bg_title/start_water.png',
  'bg_title/start_picture1.png',
  'bg_title/start_picture2.png',
  'bg_title/start_picture3.png',
  'bg_title/start_picture4.png',
  'bg_title/start_picture5.png',
  'bg_title/frame_sprite26.png',
  'bg_title/Headset.png',
  'bg_title/success_next_bt.png',

  'bg_title/music_button.png',
  'bg_title/offmusic_button.png',
  'bg_title/sound_button.png',
  'bg_title/offsound_button.png',
  'bg_title/help_button.png',
  'bg_title/about_button.png',
  'bg_title/back_button.png',
  'bg_title/tips_gift.png',

  'game/ING/Game_light.png',
  'game/ING/leftSprite.png',
  'game/ING/rightSprite.png',
  'game/ING/successHero.png',
  'game/ING/line1.png',

  // --- 两世之约 (1) ---
  'game/blocks/gameSprite1/game1_2.png',
  'game/blocks/gameSprite1/game1_7.png',
  'game/blocks/gameSprite1/game1_9.png',
  
  // --- 三生梦醒 (3) ---
  'game/blocks/gameSprite3/game3_302.png',
  'game/blocks/gameSprite3/game3_312.png',
  'game/blocks/gameSprite3/game3_352.png',
  'game/blocks/gameSprite3/game3_354.png',

  // --- 四维离殇 (2) ---
  'game/blocks/gameSprite2/game2_202.png',
  'game/blocks/gameSprite2/game2_252.png',
  'game/blocks/gameSprite2/game2_208.png',   // ★ 白实心伪装起点
  'game/blocks/gameSprite2/game2_258.png',   // ★ 白空心伪装起点
  // 真起点（每章一对）：实心 204 / 空心 254
  'game/blocks/gameSprite2/game2_1_204.png',
  'game/blocks/gameSprite2/game2_1_254.png',
  'game/blocks/gameSprite2/game2_2_204.png',
  'game/blocks/gameSprite2/game2_2_254.png',
  'game/blocks/gameSprite2/game2_3_204.png',
  'game/blocks/gameSprite2/game2_3_254.png',
  'game/blocks/gameSprite2/game2_4_204.png',
  'game/blocks/gameSprite2/game2_4_254.png',
  'game/blocks/gameSprite2/game2_5_204.png',
  'game/blocks/gameSprite2/game2_5_254.png',
  'game/blocks/gameSprite2/game2_6_204.png',
  'game/blocks/gameSprite2/game2_6_254.png',

  // ★ 各模式最终关卡按钮
  'select/icons/select_button1/select_button12_1.png',
  'select/icons/select_button1/select_button12_3.png',
  'select/icons/select_button2/3select_button8_1.png',
  'select/icons/select_button2/3select_button8_3.png',
  'select/icons/select_button3/2select_button7_1.png',
  'select/icons/select_button3/2select_button7_3.png',
];

for (let ch = 1; ch <= 11; ch++) MAIN_IMAGES.push('game/blocks/gameSprite1/game1_' + ch + '_4.png');
for (let ch = 1; ch <= 7; ch++)  MAIN_IMAGES.push('game/blocks/gameSprite3/game3_' + ch + '_304.png');

const SELECT_ICONS = [];
// 两世之约
for (let ch = 1; ch <= 11; ch++) {
  SELECT_ICONS.push('select/icons/select_button1/plot_key' + ch + '.png');
  SELECT_ICONS.push('select/icons/select_button1/select_button' + ch + '_1.png');
  SELECT_ICONS.push('select/icons/select_button1/select_button' + ch + '_2.png');
  SELECT_ICONS.push('select/icons/select_button1/select_button' + ch + '_3.png');
}
for (let ch = 2; ch <= 11; ch++) {
  SELECT_ICONS.push('select/icons/select_button1/lock_button' + ch + '1.png');
  SELECT_ICONS.push('select/icons/select_button1/lock_button' + ch + '2.png');
}
// 三生梦醒
for (let ch = 1; ch <= 7; ch++) {
  SELECT_ICONS.push('select/icons/select_button2/3plot_key' + ch + '.png');
  SELECT_ICONS.push('select/icons/select_button2/3select_button' + ch + '_1.png');
  SELECT_ICONS.push('select/icons/select_button2/3select_button' + ch + '_2.png');
  SELECT_ICONS.push('select/icons/select_button2/3select_button' + ch + '_3.png');
  SELECT_ICONS.push('select/icons/select_button2/3decoration_' + ch + '.png');
  if (ch > 1) {
    SELECT_ICONS.push('select/icons/select_button2/3lock_button' + ch + '1.png');
    SELECT_ICONS.push('select/icons/select_button2/3lock_button' + ch + '2.png');
  }
}

// ★ 各模式最终关卡按钮
SELECT_ICONS.push('select/icons/select_button1/select_button12_1.png');
SELECT_ICONS.push('select/icons/select_button1/select_button12_3.png');
SELECT_ICONS.push('select/icons/select_button2/3select_button8_1.png');
SELECT_ICONS.push('select/icons/select_button2/3select_button8_3.png');
SELECT_ICONS.push('select/icons/select_button3/2select_button7_1.png');
SELECT_ICONS.push('select/icons/select_button3/2select_button7_3.png');

// ★ 新增：选关剪影背景
for (let ch = 1; ch <= 11; ch++) SELECT_ICONS.push(`select/silhouette/silhouette_${ch}.png`);
SELECT_ICONS.push('select/silhouette/silhouette_9_2.png');
for (let ch = 1; ch <= 7; ch++) SELECT_ICONS.push(`select/silhouette/silhouette3_${ch}.png`);
for (let ch = 1; ch <= 6; ch++) SELECT_ICONS.push(`select/silhouette/silhouette2_${ch}.png`);

const TRANSITION_IMAGES = [];
for (let ch = 1; ch <= 11; ch++) TRANSITION_IMAGES.push('select/icons/selectToGame1/replace_out_' + ch + '.png');
for (let ch = 1; ch <= 6; ch++)  TRANSITION_IMAGES.push('select/icons/selectToGame2/replace_out2_' + ch + '.png');
for (let ch = 1; ch <= 7; ch++)  TRANSITION_IMAGES.push('select/icons/selectToGame3/replace_out3_' + ch + '.png');

const SOUNDS = [
  'blip1.mp3','blip2.mp3','blip3.mp3','blip4.mp3',
  'cable_press_1.mp3','cable_press_2.mp3','cable_press_3.mp3',
  'cable_press_4.mp3','cable_press_5.mp3',
  'cable_release_1.mp3','cable_release_2.mp3','cable_release_3.mp3',
  'cable_release_4.mp3','cable_release_5.mp3',
  'cable_line.mp3','cable_no_way.mp3',
  'click_01.mp3','click_02.mp3','click_03.mp3',
  'game_1.mp3','game_2.mp3','game_3.mp3','game_4.mp3',
  'selectMusic1.mp3','selectMusic2.mp3','selectMusic3.mp3',
  'newLevelOpen_1.mp3','newLevelOpen_2.mp3','newLevelOpen_3.mp3',
  'startDuang_01.mp3','startDuang_02.mp3',
  'startDuang_03.mp3','startDuang_04.mp3',
  'gameSuccess.mp3','gameFail.mp3','gameIntro.mp3',
  'gameloop_01.mp3','mofaSound.mp3','guaiwu.mp3',
  'doOverTSprite.mp3','chgMove.mp3','moveYellow.mp3',
  'line_light.mp3','hit_popup.mp3','intro_text.mp3','tips.mp3'
];

const JSONS = [
  'strings/CNstrings/successScene1.json',
  'strings/CNstrings/successScene2.json',
  'strings/CNstrings/successScene3.json',
  'strings/CNstrings/failScene.json',
  'strings/CNstrings/helpText.json',
  'strings/CNstrings/selectText.json',
  'strings/CNstrings/storyScene.json',
  'strings/CNstrings/levelColor.json',
  'strings/CNstrings/levelNumber.json',
  'strings/CNstrings/guide.json'
];

export const ASSETS = {
  images: MAIN_IMAGES.concat(SELECT_ICONS).concat(TRANSITION_IMAGES).map(f => IMG_DIR + f),
  sounds: SOUNDS.map(f => SND_DIR + f),
  json  : JSONS .map(f => JSON_DIR + f)
};

export function getAssetList() {
  const out = [];
  for (const url of ASSETS.images) out.push({ url, kind: 'image' });
  for (const url of ASSETS.sounds) out.push({ url, kind: 'audio' });
  for (const url of ASSETS.json  ) out.push({ url, kind: 'json'  });
  return out;
}

async function collectLevelFiles() {
  const out = [];
  try {
    const res = await fetch(JSON_DIR + 'chapters.json?_t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return out;
    const data = await res.json();
    if (!data || !Array.isArray(data.chapters)) return out;
    
    let ci = 0;
    for (const ch of data.chapters) {
      let mode = 1;
      let chIndexInMode = ci;
      if (ci >= 11 && ci < 18) { mode = 3; chIndexInMode = ci - 11; }
      else if (ci >= 18) { mode = 2; chIndexInMode = ci - 18; }
      
      let dir = 'levels_and_tips/';
      let prefix = '';
      if (mode === 2) { dir = 'levels_and_tips2/'; prefix = '2'; }
      if (mode === 3) { dir = 'levels_and_tips3/'; prefix = '3'; }

      const levels = (ch && Array.isArray(ch.levels)) ? ch.levels : [];
      for (let li = 0; li < levels.length; li++) {
        const safe = `${chIndexInMode + 1}_${li + 1}`;
        out.push({ url: JSON_DIR + dir + `level${prefix}_${safe}.json`, kind: 'json' });
        out.push({ url: JSON_DIR + dir + `tips${prefix}_${safe}.json`, kind: 'json' });
      }
      ci++;
    }
  } catch (_) {}
  return out;
}

export async function checkAssets(options = {}) {
  const { onProgress = null } = options;

  const list = [];
  list.push({ url: JSON_DIR + 'chapters.json', kind: 'json' });
  for (const url of ASSETS.images) list.push({ url, kind: 'image' });
  for (const url of ASSETS.sounds) list.push({ url, kind: 'audio' });
  for (const url of ASSETS.json  ) list.push({ url, kind: 'json'  });

  const levelFiles = await collectLevelFiles();
  for (const it of levelFiles) list.push(it);

  const total = list.length;
  let done = 0;
  const failed = [];

  const emit = (url, ok) => {
    done++;
    if (!ok) failed.push(url);
    if (typeof onProgress === 'function') {
      try { onProgress(done, total, url, ok); } catch (_) {}
    }
  };

  const tasks = list.map(it => async () => {
    const url = (it.kind === 'json') ? bust(it.url) : it.url;
    let ok = false;
    try {
      if (it.kind === 'image')      await loadImage(url);
      else if (it.kind === 'audio') await loadAudio(url);
      else                          await loadJSON(url);
      ok = true;
    } catch (_) {
      ok = false;
    }
    emit(it.url, ok);
  });

  await runPool(tasks, 12);

  return {
    ok    : failed.length === 0,
    total : total,
    failed: failed.slice()
  };
}