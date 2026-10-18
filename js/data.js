/* =========================================================
 *  js/data.js — 数据层：关卡加载 + 解析
 * ========================================================= */
import { PATHS, DEFAULT_ENDINGS } from './config.js';

export const MapSource = {
  async _fetchJSON(url, optional = false) {
    const candidates = [url, './' + url, '/' + url];
    let lastErr = null;
    for (const u of candidates) {
      const full = u + (u.includes('?') ? '&' : '?') + 't=' + Date.now();
      try {
        const res = await fetch(full, { cache: 'no-store' });
        if (!res.ok) {
          lastErr = new Error(`HTTP ${res.status} @ ${u}`);
          continue;
        }
        return await res.json();
      } catch (e) { lastErr = e; }
    }
    if (optional) return null;
    throw lastErr || new Error('未能加载 ' + url);
  },

  async load() {
    const chaptersRaw = await this._fetchJSON(PATHS.chapters);
    const success1 = await this._fetchJSON('json/strings/CNstrings/successScene1.json', true) || {};
    const success2 = await this._fetchJSON('json/strings/CNstrings/successScene2.json', true) || {};
    const success3 = await this._fetchJSON('json/strings/CNstrings/successScene3.json', true) || {};
    const failRaw  = await this._fetchJSON(PATHS.fail, true) || {};

    if (!chaptersRaw || !Array.isArray(chaptersRaw.chapters)) {
      throw new Error('chapters.json 缺少 chapters 数组');
    }

    const levelFiles = {};
    const tipFiles   = {};
    const tasks      = [];

    let ci = 0;
    for (const ch of chaptersRaw.chapters) {
      let mode = 1;
      let chIndexInMode = ci;
      if (ci >= 11 && ci < 18) { mode = 3; chIndexInMode = ci - 11; }
      else if (ci >= 18) { mode = 2; chIndexInMode = ci - 18; }

      let dir = 'json/levels_and_tips/';
      let prefix = '';
      if (mode === 2) { dir = 'json/levels_and_tips2/'; prefix = '2'; }
      if (mode === 3) { dir = 'json/levels_and_tips3/'; prefix = '3'; }

      if (Array.isArray(ch.levels)) {
        for (let li = 0; li < ch.levels.length; li++) {
          const lvName = ch.levels[li];
          const levelIndex = li + 1;
          const safe = `${chIndexInMode + 1}_${levelIndex}`;
          const levelFile = `level${prefix}_${safe}.json`;
          const tipFile = `tips${prefix}_${safe}.json`;
          const lvKey = `${mode}-${lvName}`;

          tasks.push(this._fetchJSON(dir + levelFile, true).then(d => { levelFiles[lvKey] = d; }));
          tasks.push(this._fetchJSON(dir + tipFile, true).then(d => { tipFiles[lvKey] = d; }));
        }
      }
      ci++;
    }

    await Promise.all(tasks);
    return { chaptersRaw, success1, success2, success3, failRaw, levelFiles, tipFiles };
  }
};

export const MapParser = {
  parse(raw) {
    const { chaptersRaw, success1, success2, success3, failRaw, levelFiles, tipFiles } = raw;

    const SUCCESS_BY_MODE = { 1: success1, 2: success2, 3: success3 };

    let ci = 0;
    const chapters = chaptersRaw.chapters.map((ch) => {
      let mode = 1;
      let chIndexInMode = ci;
      if (ci >= 11 && ci < 18) { mode = 3; chIndexInMode = ci - 11; }
      else if (ci >= 18) { mode = 2; chIndexInMode = ci - 18; }

      const successRaw = SUCCESS_BY_MODE[mode] || success1;
      const chName = (ch && ch.name) || `第 ${chIndexInMode + 1} 章`;
      const lvList = (ch && Array.isArray(ch.levels)) ? ch.levels : [];

      const levels = lvList.map(lvName => {
        const lvKey = `${mode}-${lvName}`;
        const arr = levelFiles[lvKey];
        const level = arr ? this._fromLevelArray(lvName, arr) : this._placeholder(lvName);

        level.mode = mode;
        level.chapterIndexInMode = chIndexInMode;
        level.tips = (arr && tipFiles[lvKey])
          ? this._fromTipsArray(tipFiles[lvKey], level.rows, level.cols)
          : [];
        level.text = this._resolveSuccessText(successRaw, lvName);
        return level;
      });

      ci++;
      return { name: chName, levels, mode };
    });

    let failTexts = DEFAULT_ENDINGS.fail.texts.slice();
    if (failRaw && Array.isArray(failRaw.gameModle1) && failRaw.gameModle1.length) {
      failTexts = failRaw.gameModle1.map(String);
    }

    return {
      title   : chaptersRaw.title || '同一个世界',
      endings : { win : { texts: [] }, fail: { texts: failTexts } },
      chapters
    };
  },

  _fromLevelArray(name, arr) {
    if (!Array.isArray(arr) || !arr.length) return this._placeholder(name);

    let maxX = -1, maxY = -1;
    for (const o of arr) {
      if (!o || typeof o._x !== 'number' || typeof o._y !== 'number') continue;
      if (o._x > maxX) maxX = o._x;
      if (o._y > maxY) maxY = o._y;
    }
    const cols = maxX + 1;
    const rows = maxY + 1;

    const cells = [];
    for (let r = 0; r < rows; r++) {
      const line = [];
      for (let c = 0; c < cols; c++) {
        line.push({
          empty: true, color: 0, start: false, fix: false, trap: false,
          anim: 0, fromColor: 0, fade: 0, pulse: 0,
          r, c,
          wormhole: false, partner: null, wormholeColor: 0,
          singularity: false, singularityColor: 0,
          hollow: false,
          fakeStart: false                     // ★ 伪装起点
        });
      }
      cells.push(line);
    }

    for (const o of arr) {
      if (!o || typeof o._x !== 'number' || typeof o._y !== 'number') continue;
      const x = o._x, y = o._y;
      const r = (rows - 1) - y;
      const c = x;
      if (r < 0 || r >= rows || c < 0 || c >= cols) continue;

      const cv   = o._currentColor;
      const cell = cells[r][c];

      switch (cv) {
        /* ---- mode1 / mode3 ---- */
        case 1: case 301: cell.color = 0; break;
        case 3: case 303: cell.color = 0; cell.start = true; break;
        case 6: cell.color = 0; cell.fix   = true; break;
        case 8: case 311: cell.color = 0; cell.trap  = true; break;
        case 2: case 302: cell.color = 1; break;
        case 4: case 304: cell.color = 1; cell.start = true; break;
        case 7: cell.color = 1; cell.fix   = true; break;
        case 9: case 312: cell.color = 1; cell.trap  = true; break;
        case 5: case 305: cell.empty = true; continue;
        case 351: cell.color = 0; break;
        case 352: cell.color = 1; break;
        case 353: cell.color = 0; cell.singularity = true; break;
        case 354: cell.color = 1; cell.singularity = true; break;

        /* ---- mode2：四维离殇 ---- */
        // 普通块
        case 201: cell.color = 1; cell.hollow = false; break;                       // 黑实心
        case 202: cell.color = 0; cell.hollow = false; break;                       // 白实心
        // 真起点
        case 203: cell.color = 1; cell.hollow = false; cell.start = true; break;    // 黑实心起点
        case 204: cell.color = 0; cell.hollow = false; cell.start = true; break;    // 白实心起点
        case 253: cell.color = 1; cell.hollow = true;  cell.start = true; break;    // 黑空心起点
        case 254: cell.color = 0; cell.hollow = true;  cell.start = true; break;    // 白空心起点
        // 普通空心
        case 251: cell.color = 1; cell.hollow = true;  break;                       // 黑空心
        case 252: cell.color = 0; cell.hollow = true;  break;                       // 白空心
        // ✅ 新代码（已修正）
        // ★ 伪装起点（黑白及材质映射完全修正）
        case 207: cell.color = 1; cell.hollow = false; cell.fakeStart = true; break; // 黑实心伪装（208反色）
        case 208: cell.color = 0; cell.hollow = false; cell.fakeStart = true; break; // 白实心伪装（208原图）
        case 257: cell.color = 1; cell.hollow = true;  cell.fakeStart = true; break; // 黑空心伪装（258反色）
        case 258: cell.color = 0; cell.hollow = true;  cell.fakeStart = true; break; // 白空心伪装（258原图）

        default: continue;
      }

      cell.empty     = false;
      cell.fromColor = cell.color;
    }

    // 绑定虫洞
    const oMap = new Map();
    for (const o of arr) {
      if (o && typeof o._connectIndex === 'number') oMap.set(o._connectIndex, o);
    }

    let pairCounter = 0;
    const pairMap = new Map();

    for (const o of arr) {
      const cv = o._currentColor;
      if (cv === 351 || cv === 352) {
        const partnerO = oMap.get(o._haveExchg3);
        if (partnerO && o._haveExchg3 !== o._connectIndex) {
          const r1 = (rows - 1) - o._y, c1 = o._x;
          const r2 = (rows - 1) - partnerO._y, c2 = partnerO._x;

          if (r1 >= 0 && r1 < rows && c1 >= 0 && c1 < cols &&
              r2 >= 0 && r2 < rows && c2 >= 0 && c2 < cols) {
            const cell1 = cells[r1][c1];
            const cell2 = cells[r2][c2];

            cell1.wormhole = true;
            cell2.wormhole = true;
            cell1.partner = cell2;
            cell2.partner = cell1;

            const pairKey = Math.min(o._connectIndex, o._haveExchg3);
            if (!pairMap.has(pairKey)) pairMap.set(pairKey, pairCounter++);
            cell1.wormholeColor = pairMap.get(pairKey);
            cell2.wormholeColor = pairMap.get(pairKey);
          }
        }
      }
    }

    // 绑定奇点
    const processedSing = new Set();
    let singCounter = 0;
    const singPairMap = new Map();

    for (const o of arr) {
      const cv = o && o._currentColor;
      if (cv !== 353 && cv !== 354) continue;
      if (processedSing.has(o._connectIndex)) continue;

      const partnerO = oMap.get(o._haveExchg3);
      if (!partnerO) continue;
      const pcv = partnerO._currentColor;
      if (pcv !== 353 && pcv !== 354) continue;
      if (processedSing.has(partnerO._connectIndex)) continue;
      if (partnerO._haveExchg3 !== o._connectIndex) continue;

      processedSing.add(o._connectIndex);
      processedSing.add(partnerO._connectIndex);

      const r1 = (rows - 1) - o._y,         c1 = o._x;
      const r2 = (rows - 1) - partnerO._y,  c2 = partnerO._x;

      if (r1 >= 0 && r1 < rows && c1 >= 0 && c1 < cols &&
          r2 >= 0 && r2 < rows && c2 >= 0 && c2 < cols) {
        const cell1 = cells[r1][c1];
        const cell2 = cells[r2][c2];
        cell1.singularity = true;
        cell2.singularity = true;
        cell1.partner = cell2;
        cell2.partner = cell1;

        const pairKey = Math.min(o._connectIndex, partnerO._connectIndex);
        if (!singPairMap.has(pairKey)) singPairMap.set(pairKey, singCounter++);
        const colorIdx = singPairMap.get(pairKey);
        cell1.singularityColor = colorIdx;
        cell2.singularityColor = colorIdx;
      }
    }

    return { name, rows, cols, cells };
  },

  _fromTipsArray(tipsRaw, rows, cols) {
    if (!Array.isArray(tipsRaw) || !cols) return [];
    const out = [];
    for (const pathObj of tipsRaw) {
      if (!pathObj || typeof pathObj !== 'object') continue;
      const n = parseInt(pathObj.count, 10);
      if (!Number.isFinite(n) || n <= 0) continue;

      const path = [];
      for (let i = 0; i < n; i++) {
        const idx = pathObj[String(i)];
        if (typeof idx !== 'number') continue;

        let x = idx % cols;
        let y = Math.floor(idx / cols);

        if (y >= rows || x >= cols) {
          const idx0 = idx - 1;
          x = idx0 % cols;
          y = Math.floor(idx0 / cols);
        }

        const r = (rows - 1) - y;
        const c = x;
        if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
        path.push({ r, c });
      }
      if (path.length) out.push(path);
    }
    return out;
  },

  _placeholder(name) {
    return {
      name, rows: 1, cols: 1,
      cells: [[{
        empty: true, color: 0, start: false, fix: false, trap: false,
        anim: 0, fromColor: 0, fade: 0, pulse: 0, r: 0, c: 0,
        wormhole: false, partner: null, wormholeColor: 0,
        singularity: false, singularityColor: 0,
        hollow: false, fakeStart: false
      }]],
      tips: []
    };
  },

  _resolveSuccessText(successRaw, levelName) {
    if (!successRaw) return null;
    const key = 'story_' + String(levelName).replace(/-/g, '_');
    const txt = successRaw[key];
    return txt ? { text: String(txt) } : null;
  }
};