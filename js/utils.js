/* =========================================================
 *  js/utils.js — 通用工具 + 视口布局
 * ========================================================= */
import { STAGE_W, STAGE_H } from './config.js';

/* ---------- HTML 转义 ---------- */
export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ---------- 致命错误面板 ---------- */
export function showFatal(el, msg, onRetry) {
  if (!el) return;
  el.innerHTML = '';

  const text = document.createElement('div');
  text.textContent = msg;
  el.appendChild(text);

  if (typeof onRetry === 'function') {
    const btn = document.createElement('button');
    btn.className = 'retry';
    btn.textContent = '重 试';
    btn.addEventListener('click', () => {
      el.classList.remove('show');
      onRetry();
    });
    el.appendChild(btn);
  }

  el.classList.add('show');
  console.error(msg);
}

/* ---------- 换行转换 ---------- */
/* 
 * 规则：
 *   - 将 \n、\\n、\\N、\r\n、\r 全部当作换行符
 *   - 连续的两个换行符压缩为一个（例如 \n\n 或 \\N\\N 只留一个）
 *   - 最后把换行符转为 <br>
 */
export function nl2br(s) {
  if (s == null) return '';
  let str = String(s);
  
  // 1. 统一所有换行形式为真实换行符 \n
  str = str.replace(/\\[Nn]|\r\n|\r/g, '\n');
  
  // 2. 两个换行压缩为一个
  str = str.replace(/\n{2}/g, '\n');
  
  // 3. 转成 HTML
  return str.replace(/\n/g, '<br>');
}

/* ---------- 视口缩放 ---------- */
/* 把 #stage / #stage-root 缩放到屏幕内，保持 9:16，多余部分留黑 */
export function layoutViewport() {
  const root =
    document.getElementById('stage') ||
    document.getElementById('stage-root');
  if (!root) return;

  const apply = () => {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const scale = Math.min(W / STAGE_W, H / STAGE_H);
    root.style.transform = `scale(${scale})`;
  };

  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', apply);
  }
}