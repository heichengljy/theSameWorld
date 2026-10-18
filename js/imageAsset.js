/* =========================================================
 *  js/imageAsset.js — 统一图片加载层 / Bundle 支持
 * ========================================================= */

// ★ 本地开发设为 false；发布打包时设为 true
export const USE_IMAGE_BUNDLE = false;

let _bundleMap = null;
let _isReady = false;

export function isBundleReady() {
  return _isReady;
}

export async function initImageBundle() {
  if (!USE_IMAGE_BUNDLE) {
    _isReady = true;
    return;
  }
  try {
    // 发布时需要生成此文件
    const mod = await import('./bundle/images.js');
    
    // ★ BUG1 修复：将数组转换为字典 Map
    _bundleMap = {};
    for (const item of mod.IMAGE_BUNDLE) {
      const dataUrl = `data:${item.mime};base64,${item.b64}`;
      _bundleMap[item.relPath] = dataUrl;
    }
    
    _isReady = true;
  } catch (e) {
    console.error('Failed to load image bundle', e);
    throw e;
  }
}

export function loadImage(fullSrc) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    
    if (USE_IMAGE_BUNDLE) {
      if (!_bundleMap) {
        reject(new Error('Image bundle not initialized'));
        return;
      }
      // 剥离 ../image/ 前缀得到相对路径，如 game/blocks/xxx.png
      const relPath = fullSrc.replace(/^.*\/image\//, '');
      const dataUrl = _bundleMap[relPath] || _bundleMap[fullSrc];
      if (!dataUrl) {
        reject(new Error('Image not found in bundle: ' + relPath));
        return;
      }
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Bundle image error: ' + relPath));
      img.src = dataUrl;
    } else {
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Image error: ' + fullSrc));
      img.src = fullSrc;
    }
  });
}

// 在 HTML 加载后，批量将 data-src 转为真实 src
export async function hydrateDomImages() {
  const imgs = document.querySelectorAll('img[data-src]');
  const tasks = Array.from(imgs).map(async (el) => {
    const src = el.getAttribute('data-src');
    try {
      const img = await loadImage(src);
      el.src = img.src;
      el.removeAttribute('data-src');
    } catch (e) {
      console.warn('Failed to load dom image', src, e);
    }
  });
  await Promise.all(tasks);
}