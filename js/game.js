import { CFG } from './config.js';

export class Game {
  constructor() {
    this.title    = '';
    this.endings  = { win: { texts: [] }, fail: { texts: [] } };
    this.chapters = [];
    this.flat     = [];
    this.index    = 0;
    this.level    = null;
    this.currentText = null;
    this.path     = [];
    this.dragging = false;
    this.moves    = 0;
    this.solved   = false;
    this.failed   = false;
    this.hintIndex = -1;
    this._activeTraps = new Map();
    this.onWin   = null;
    this.onFail  = null;
    this.onLevel = null;
    this.hooks = Object.create(null);

    // 虫洞时序状态机
    // 0 = 无状态
    // 1 = 等待虫洞飞行动画结束
    // 2 = 飞行动画已结束，正在等待 200ms 延时
    this._wormholeAnimState = 0;
    this._wormholeDelayTimer = 0;
    this._pendingAction = null;
  }

  on(name, fn) {
    (this.hooks[name] = this.hooks[name] || []).push(fn);
    return () => {
      this.hooks[name] = (this.hooks[name] || []).filter(f => f !== fn);
    };
  }

  emit(name, data) {
    const arr = this.hooks[name];
    if (!arr) return;
    for (const fn of arr) {
      try { fn(data); } catch (_) {}
    }
  }

  load(parsed, index = 0) {
    this.title    = parsed.title;
    this.endings  = parsed.endings;
    this.chapters = parsed.chapters;
    this.flat = [];
    this.chapters.forEach((ch, ci) => {
      ch.levels.forEach((lv, li) => {
        this.flat.push({
          chapterName : ch.name,
          chapterIndex: ci,
          chapterIndexInMode: lv.chapterIndexInMode,
          mode: lv.mode,
          levelIndex  : li,
          level       : lv,
          text        : lv.text || null
        });
      });
    });
    this.go(index);
  }

  go(index) {
    if (!this.flat.length) return;
    this.index = Math.max(0, Math.min(index, this.flat.length - 1));
    const entry = this.flat[this.index];
    const src   = entry.level;
    this.currentText = entry.text || null;

    this.level = {
      chapterIndex: entry.chapterIndex,
      chapterIndexInMode: entry.chapterIndexInMode,
      mode: entry.mode,
      chapterName : entry.chapterName,
      name        : src.name,
      rows        : src.rows,
      cols        : src.cols,
      tips        : src.tips || [],
      cells       : src.cells.map(row => row.map(cell => ({
        empty    : cell.empty,
        color    : cell.color,
        start    : cell.start,
        fix      : cell.fix,
        trap     : cell.trap,
        anim     : 0,
        fromColor: cell.color,
        fade     : 0,
        fadeType : null,
        pulse    : 0,
        r        : cell.r,
        c        : cell.c,
        wormhole : cell.wormhole,
        wormholeColor: cell.wormholeColor,
        wormholeSwap : null,
        singularity      : !!cell.singularity,
        singularityColor : cell.singularityColor || 0,
        hollow   : !!cell.hollow,
        fakeStart: !!cell.fakeStart,
        partner  : null
      })))
    };

    const oldCells = src.cells;
    for (let r = 0; r < this.level.rows; r++) {
      for (let c = 0; c < this.level.cols; c++) {
        const oldCell = oldCells[r][c];
        if (oldCell.partner && (oldCell.wormhole || oldCell.singularity)) {
          this.level.cells[r][c].partner =
            this.level.cells[oldCell.partner.r][oldCell.partner.c];
        }
      }
    }

    this.path     = [];
    this.dragging = false;
    this.moves    = 0;
    this.solved   = false;
    this.failed   = false;
    this.hintIndex = -1;
    this._activeTraps.clear();
    
    this._wormholeAnimState = 0;
    this._wormholeDelayTimer = 0;
    this._pendingAction = null;

    if (this.onLevel) this.onLevel();
  }

  restart() { this.emit('reset'); this.go(this.index); }
  next() { this.go(this.index + 1); }
  prev() { this.go(this.index - 1); }
  get isFirst() { return this.index === 0; }
  get isLast()  { return this.index >= this.flat.length - 1; }
  get total()   { return this.flat.length; }

  get tipsCount() { return (this.level && this.level.tips && this.level.tips.length) || 0; }
  get currentHint() {
    if (this.hintIndex < 0 || !this.level) return null;
    return (this.level.tips || [])[this.hintIndex] || null;
  }

  cycleHint() {
    if (this.hintIndex >= 0) {
      this.hintIndex = -1;
      if (this.onLevel) this.onLevel();
      return -1;
    }
    if (!this.tipsCount) return -1;
    this.emit('reset');
    this.go(this.index);
    this.hintIndex = 0;
    this.emit('hint');
    return 0;
  }

  begin(r, c) {
    if (this.solved || this.failed || this.dragging || this._wormholeAnimState !== 0 || !this.level) return false;
    const cell = this.level.cells[r]?.[c];
    if (!cell || cell.empty) return false;
    if (cell.fix)   { this.emit('fixHit');  return false; }
    if (!cell.start && !cell.fakeStart){ this.emit('blocked'); return false; }

    this.dragging = true;
    this.path = [{ r, c }];
    this._activeTraps.clear();
    cell.pulse = 1;
    this.emit('press');
    return true;
  }

  extend(r, c) {
    if (!this.dragging) return false;
    const path = this.path;
    const cell = this.level.cells[r]?.[c];
    if (!cell || cell.empty || cell.fix) { if(cell?.fix) this.emit('fixHit'); return false; }

    const last = path[path.length - 1];
    if (last.r === r && last.c === c) return false;

    const idx = path.findIndex(p => p.r === r && p.c === c);
    if (idx >= 0) {
      if (idx < path.length - 1) {
        path.length = idx + 1;
        this._syncTraps();
        this.emit('extend');
        return true;
      }
      return false;
    }

    if (Math.abs(last.r - r) + Math.abs(last.c - c) !== 1) return false;
    path.push({ r, c });
    cell.pulse = 1;
    this._syncTraps();
    this.emit('extend');
    return true;
  }

  _syncTraps() {
    if (!this.level) return;
    if (this.level.mode === 3) this._syncTrapsMode3();
    else                       this._syncTrapsDefault();
  }

  _syncTrapsDefault() {
    const path = this.path;
    const pathTraps = new Set();
    for (const p of path) {
      const cell = this.level.cells[p.r]?.[p.c];
      if (cell && cell.trap) pathTraps.add(p.r + ',' + p.c);
    }
    for (const key of Array.from(this._activeTraps.keys())) {
      if (!pathTraps.has(key)) {
        const [rr, cc] = key.split(',').map(Number);
        this._flipTrapNeighbours(rr, cc);
        this._activeTraps.delete(key);
      }
    }
    for (const key of pathTraps) {
      if (!this._activeTraps.has(key)) {
        const [rr, cc] = key.split(',').map(Number);
        this._flipTrapNeighbours(rr, cc);
        this._activeTraps.set(key, null);
      }
    }
  }

  _syncTrapsMode3() {
    const path = this.path;
    const pathSet = new Set(path.map(p => p.r + ',' + p.c));
    const newTraps = new Map();
    const newCount = new Map();

    for (let i = 0; i < path.length; i++) {
      const p = path[i];
      const cell = this.level.cells[p.r]?.[p.c];
      if (!cell || !cell.trap) continue;
      let axis = null;
      if (i > 0) {
        const prev = path[i - 1];
        if (prev.r === p.r)      axis = 'col';
        else if (prev.c === p.c) axis = 'row';
      }
      if (!axis) continue;
      const cells = this._computeAxisCells(p.r, p.c, axis, pathSet);
      newTraps.set(p.r + ',' + p.c, { axis, cells });
      for (const c of cells) {
        const k = c.r + ',' + c.c;
        newCount.set(k, (newCount.get(k) || 0) + 1);
      }
    }

    const oldCount = new Map();
    for (const [, data] of this._activeTraps) {
      if (!data || !data.cells) continue;
      for (const c of data.cells) {
        const k = c.r + ',' + c.c;
        oldCount.set(k, (oldCount.get(k) || 0) + 1);
      }
    }

    const allKeys = new Set([...oldCount.keys(), ...newCount.keys()]);
    const toFlip = [];
    for (const k of allKeys) {
      const delta = (newCount.get(k) || 0) - (oldCount.get(k) || 0);
      if (delta === 0) continue;
      if (Math.abs(delta) % 2 === 0) continue;
      const [r, c] = k.split(',').map(Number);
      const cell = this.level.cells[r]?.[c];
      if (!cell || cell.empty || cell.fix || cell.singularity) continue;
      toFlip.push({ r, c });
    }
    this._flipCells(toFlip);
    this._activeTraps = newTraps;
  }

  _computeAxisCells(r, c, axis, pathSet) {
    const rows = this.level.rows, cols = this.level.cols;
    const out = [];
    if (axis === 'row') {
      for (let cc = 0; cc < cols; cc++) {
        if (pathSet.has(r + ',' + cc)) continue;
        const cell = this.level.cells[r][cc];
        if (!cell || cell.empty || cell.fix || cell.singularity) continue;
        out.push({ r, c: cc });
      }
    } else {
      for (let rr = 0; rr < rows; rr++) {
        if (pathSet.has(rr + ',' + c)) continue;
        const cell = this.level.cells[rr][c];
        if (!cell || cell.empty || cell.fix || cell.singularity) continue;
        out.push({ r: rr, c });
      }
    }
    return out;
  }

  _flipCells(cells) {
    for (const p of cells) {
      const cell = this.level.cells[p.r]?.[p.c];
      if (!cell || cell.empty || cell.fix || cell.singularity) continue;
      cell.fromColor = cell.color;
      cell.color ^= 1;
      cell.anim = 1;
      cell.pulse = 1;
    }
  }

  _flipTrapNeighbours(r, c) {
    const rows = this.level.rows, cols = this.level.cols;
    const neighbours = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
    for (const [nr, nc] of neighbours) {
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      const ncell = this.level.cells[nr][nc];
      if (ncell.empty || ncell.fix || ncell.singularity) continue;
      ncell.fromColor = ncell.color;
      ncell.color ^= 1;
      ncell.anim = 1;
      ncell.pulse = 1;
    }
  }

  _undoActiveTraps() {
    if (this.level && this.level.mode === 3) {
      const count = new Map();
      for (const [, data] of this._activeTraps) {
        if (!data || !data.cells) continue;
        for (const c of data.cells) {
          const k = c.r + ',' + c.c;
          count.set(k, (count.get(k) || 0) + 1);
        }
      }
      const toFlip = [];
      for (const [k, n] of count) {
        if (n % 2 === 0) continue;
        const [r, c] = k.split(',').map(Number);
        const cell = this.level.cells[r]?.[c];
        if (!cell || cell.empty || cell.fix || cell.singularity) continue;
        toFlip.push({ r, c });
      }
      this._flipCells(toFlip);
    } else {
      for (const key of Array.from(this._activeTraps.keys())) {
        const [rr, cc] = key.split(',').map(Number);
        this._flipTrapNeighbours(rr, cc);
      }
    }
    this._activeTraps.clear();
  }

  end() {
    if (!this.dragging) return false;
    this.dragging = false;
    const path = this.path;
    
    // ★ 路径过短，立刻清空并结束
    if (path.length < 2) {
      this.path = [];
      this._activeTraps.clear();
      return false;
    }

    this._activeTraps.clear();
    const wasHinting = this.hintIndex >= 0;
    this.emit('release');
    
    // ★ 暂不清空 this.path，交由 _apply 决定（有无虫洞）
    this._apply(path);

    if (wasHinting) {
      if (this.solved || this.failed) this.hintIndex = -1;
      else {
        this.hintIndex++;
        if (this.hintIndex >= this.tipsCount) this.hintIndex = -1;
      }
      if (this.onLevel) this.onLevel();
    }
    return true;
  }

  cancel() {
    this.dragging = false;
    this.path = [];
    this._undoActiveTraps();
    this._wormholeAnimState = 0;
    this._wormholeDelayTimer = 0;
    this._pendingAction = null;
  }

  _apply(path) {
    const pathSet = new Set(path.map(p => `${p.r},${p.c}`));
    const processedWorms = new Set();
    let hasWormholeSwap = false;

    // 1. 优先处理虫洞交换（仅替换物理网格，并配置飞行动画标记）
    for (let r = 0; r < this.level.rows; r++) {
      for (let c = 0; c < this.level.cols; c++) {
        const cell = this.level.cells[r][c];
        if (!cell || !cell.wormhole || processedWorms.has(cell)) continue;
        const partner = cell.partner;
        if (!partner || processedWorms.has(partner)) continue;
        processedWorms.add(cell);
        processedWorms.add(partner);
        
        const inP1 = pathSet.has(`${cell.r},${cell.c}`);
        const inP2 = pathSet.has(`${partner.r},${partner.c}`);
        
        // ★ 经过 1 个或 2 个都触发交换
        if (inP1 || inP2) {
          const r1 = cell.r, c1 = cell.c;
          const r2 = partner.r, c2 = partner.c;
          
          this.level.cells[r1][c1] = partner;
          this.level.cells[r2][c2] = cell;
          
          cell.r = r2; cell.c = c2;
          partner.r = r1; partner.c = c1;
          
          cell.wormholeSwap = { progress: 0, fromR: r1, fromC: c1, toR: r2, toC: c2 };
          partner.wormholeSwap = { progress: 0, fromR: r2, fromC: c2, toR: r1, toC: c1 };
          cell.pulse = 1;
          partner.pulse = 1;
          hasWormholeSwap = true;
        }
      }
    }

    // 2. 时序分叉
    if (hasWormholeSwap) {
      this._wormholeAnimState = 1; 
      // ★ 连线保留，直到动画结束和延迟完成
      this._pendingAction = () => this._doFlipAndSettle(path);
    } else {
      this.path = []; // ★ 无虫洞，立即清空连线渲染
      this._doFlipAndSettle(path);
    }
  }

  _doFlipAndSettle(path) {
    this.path = []; // ★ 有虫洞时，在这里清空连线
    const pathSet = new Set(path.map(p => `${p.r},${p.c}`));
    const processedSing = new Set();

    // 奇点翻转
    for (let r = 0; r < this.level.rows; r++) {
      for (let c = 0; c < this.level.cols; c++) {
        const cell = this.level.cells[r][c];
        if (!cell || !cell.singularity || !cell.partner) continue;
        if (processedSing.has(cell)) continue;
        const partner = cell.partner;
        processedSing.add(cell);
        processedSing.add(partner);
        const inP1 = pathSet.has(`${cell.r},${cell.c}`);
        const inP2 = pathSet.has(`${partner.r},${partner.c}`);
        if (inP1 && inP2) {
          cell.fromColor = cell.color; cell.color ^= 1; cell.anim = 1; cell.pulse = 1;
          partner.fromColor = partner.color; partner.color ^= 1; partner.anim = 1; partner.pulse = 1;
        }
      }
    }

    // 路径翻色
    for (const { r, c } of path) {
      const cell = this.level.cells[r][c];
      if (!cell) continue;
      if (cell.singularity) continue;
      cell.fromColor = cell.color;
      cell.color ^= 1;
      cell.anim = 1;
      cell.pulse = 1;
      if (cell.trap && this.level.mode !== 3) cell.trap = false;
    }

    // 起点消失
    const head = path[0];
    const headCell = this.level.cells[head.r][head.c];
    if (headCell.start || headCell.fakeStart) {
      headCell.fadeType = headCell.start ? 'real' : 'fake';
      headCell.start = false;
      headCell.fakeStart = false;
      headCell.fade  = 1;
    }

    this.moves++;
    this._settle();
  }

  _settle() {
    this._checkStarts();
    if (this._anyStartLeft()) return;

    const isWin = this.level.mode === 2 ? this._allMode2Same() : this._allSame();
    if (isWin) {
      this.solved = true;
      this.emit('win');
      if (this.onWin) this.onWin();
    } else {
      this.failed = true;
      this.emit('fail');
      if (this.onFail) this.onFail();
    }
  }

  _checkStarts() {
    let remainingStarts = [];
    for (const row of this.level.cells) {
      for (const cell of row) {
        if (!cell.empty && (cell.start || cell.fakeStart)) {
          remainingStarts.push(cell);
        }
      }
    }

    if (remainingStarts.length === 2) {
      for (const cell of remainingStarts) {
        cell.fadeType = cell.start ? 'real' : 'fake';
        cell.start = false;
        cell.fakeStart = false;
        cell.fade = 1;
        cell.pulse = 1;
      }
    }
  }

  _allSame() {
    let first = -1;
    for (const row of this.level.cells) {
      for (const cell of row) {
        if (cell.empty) continue;
        if (first === -1) first = cell.color;
        else if (cell.color !== first) return false;
      }
    }
    return true;
  }

  _allMode2Same() {
    let hollowColor = -1;
    let solidColor  = -1;
    for (const row of this.level.cells) {
      for (const cell of row) {
        if (cell.empty) continue;
        if (cell.hollow) {
          if (hollowColor === -1) hollowColor = cell.color;
          else if (hollowColor !== cell.color) return false;
        } else {
          if (solidColor === -1) solidColor = cell.color;
          else if (solidColor !== cell.color) return false;
        }
      }
    }
    if (hollowColor === -1 || solidColor === -1) return false;
    return hollowColor !== solidColor;
  }

  _anyStartLeft() {
    for (const row of this.level.cells) {
      for (const cell of row) {
        if (!cell.empty && (cell.start || cell.fakeStart)) return true;
      }
    }
    return false;
  }

  tick(dt) {
    if (!this.level) return false;
    let active = false;
    let hasSwapAnim = false;
    
    for (const row of this.level.cells) {
      for (const cell of row) {
        if (cell.empty) continue;
        
        // 1. 推进虫洞飞行动画（时长 450ms）
        if (cell.wormholeSwap) {
          cell.wormholeSwap.progress += dt / 450; 
          if (cell.wormholeSwap.progress >= 1) {
            cell.wormholeSwap = null;
          } else {
            hasSwapAnim = true;
          }
          active = true;
        }

        if (cell.anim > 0) { cell.anim = Math.max(0, cell.anim - dt / CFG.flipMs); active = true; }
        if (cell.fade > 0) { cell.fade = Math.max(0, cell.fade - dt / CFG.fadeMs); active = true; }
        if (cell.pulse > 0) { cell.pulse = Math.max(0, cell.pulse - dt / 320); active = true; }
      }
    }

    // 2. 时序状态机推进
    if (this._wormholeAnimState === 1) {
      if (!hasSwapAnim) {
        this._wormholeAnimState = 2;
        this._wormholeDelayTimer = 200; 
      }
      active = true;
    } else if (this._wormholeAnimState === 2) {
      this._wormholeDelayTimer -= dt;
      if (this._wormholeDelayTimer <= 0) {
        this._wormholeAnimState = 0;
        if (this._pendingAction) {
          const fn = this._pendingAction;
          this._pendingAction = null;
          fn(); // 此时开始翻转并清空 this.path
        }
      }
      active = true;
    }

    return active;
  }
}