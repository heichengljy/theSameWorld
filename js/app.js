/* =========================================================
 *  js/app.js — 应用入口 / 路由注册 / 加载检查
 * ========================================================= */
import { checkAssets } from './assets.js';
import { Audio }       from './audio.js';
import { layoutViewport, showFatal } from './utils.js';
import { Router }      from './router.js';
import { MainPage }    from './ui-main.js';
import { GamePage }    from './ui-game.js';
import { Archive }     from './archive.js';
import { prepareLoadBg } from './background.js';
import { initImageBundle, hydrateDomImages, USE_IMAGE_BUNDLE } from './imageAsset.js';

/* ---------- 视口缩放（全局一次） ---------- */
layoutViewport();

/* ---------- DOM ---------- */
const fillEl       = document.getElementById('fill');
const textEl       = document.getElementById('load-text');
const statusEl     = document.getElementById('load-status');
const fatalEl      = document.getElementById('fatal');
const progressWrap = document.getElementById('progress-wrap');
const loadNext     = document.getElementById('load-next');
const pageLoadEl   = document.getElementById('page-load');

/* ---------- 注册页面 ---------- */
Router.register('load', { el: pageLoadEl });
Router.register('main', MainPage);
Router.register('game', GamePage);

/* ---------- 首次交互解锁 BGM ---------- */
document.addEventListener('pointerdown', function unlock() {
  document.removeEventListener('pointerdown', unlock);
  try { Audio.resumeBgm(); } catch (_) {}
}, { once: true });

/* ---------- 进度 ---------- */
function setProgress(done, total) {
  const pct = total ? Math.round(done / total * 100) : 100;
  fillEl.style.width = pct + '%';
  textEl.textContent = '资 源 加 载 中 · ' + pct + '%';
}

/* =========================================================
 *  ① 读存档 → 决定加载页背景（交给 background.js）
 * ========================================================= */
async function prepareBackground() {
  try { await Archive.load(); } catch (_) {}

  const u  = Archive.parse();
  const ch = Math.min(11, Math.max(1, u.chapter));
  if (ch <= 1) return;

  await prepareLoadBg(ch);
  await new Promise(r => setTimeout(r, 900));
}

/* =========================================================
 *  ② 检查资源
 * ========================================================= */
function startCheck() {
  checkAssets({ onProgress: setProgress }).then(finishLoading);
}

/* =========================================================
 *  ③ 完成：进度条渐隐 → 按钮 + 波纹渐显 → 点击进主菜单
 * ========================================================= */
function finishLoading(res) {
  if (!res.ok) {
    showFatal(fatalEl,
      '以下资源加载失败（共 ' + res.failed.length + ' 项）：\n\n' +
      res.failed.join('\n'));
    if (statusEl) statusEl.textContent = '加 载 失 败';
    return;
  }

  setProgress(res.total, res.total);
  if (statusEl) statusEl.textContent = '点 击 开 始';
  if (progressWrap) progressWrap.classList.add('fade-out');

  setTimeout(() => {
    if (loadNext) loadNext.classList.add('show');

    document.querySelectorAll('#page-load .load-wave').forEach(el => {
      el.classList.add('show');
    });

    if (loadNext) {
      loadNext.addEventListener('click', () => {
        try { Audio.play('click'); } catch (_) {}

        loadNext.classList.add('popping');

        setTimeout(() => {
          if (pageLoadEl) pageLoadEl.classList.add('fading-out');
        }, 200);

        setTimeout(() => {
          Router.go('main');
        }, 900);
      }, { once: true });
    }
  }, 350);
}

/* =========================================================
 *  启动
 * ========================================================= */
Router.init('load');

(async () => {
  // 1. 初始化图片层（Bundle/本地）并解析静态 DOM
  try {
    await initImageBundle(); 
    // ★ BUG 2 修复：补上 await，确保 DOM 静态图片加载完毕再往下走
    await hydrateDomImages().catch(e => console.warn(e)); 
  } catch (e) {
    console.error(e);
  }

  // 2. 时序分叉
  if (USE_IMAGE_BUNDLE) {
    finishLoading({ ok: true, total: 1, failed: [] });
  } else {
    await prepareBackground();
    startCheck();
  }
})();