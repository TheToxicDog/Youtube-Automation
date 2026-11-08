// Blockwright: app state, tools, input routing, layers, selection, storage.
(function () {
  const BP = window.BP;
  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, props = {}, kids = []) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'style') e.style.cssText = v;
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of [].concat(kids)) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
    return e;
  };
  const icon = (id) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('class', 'i'); s.innerHTML = `<use href="#i-${id}"/>`; return s; };
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };
  BP.ui = { $, el, icon, store };

  const TOOLS = [
    { id: 'pencil', name: 'Place', icon: 'pencil', key: 'b', tip: 'Place blocks (B)' },
    { id: 'erase', name: 'Erase', icon: 'erase', key: 'e', tip: 'Erase blocks (E)' },
    { id: 'rect', name: 'Rect', icon: 'rect', key: 'u', tip: 'Rectangle and square (U). Hold Shift for a square' },
    { id: 'circle', name: 'Circle', icon: 'circle', key: 'o', tip: 'Circle and oval (O). Hold Shift for a circle' },
    { id: 'line', name: 'Line', icon: 'line', key: 'l', tip: 'Straight line (L)' },
    { id: 'fill', name: 'Fill', icon: 'fill', key: 'g', tip: 'Fill an enclosed area on this layer (G)' },
    { id: 'select', name: 'Select', icon: 'select', key: 's', tip: 'Select an area to copy, move, rotate or roof (S)' },
    { id: 'pick', name: 'Pick', icon: 'pick', key: 'i', tip: 'Pick a block from the plan (I or Alt-click)' },
    { id: 'hand', name: 'Use', icon: 'hand', key: 'h', tip: 'Flip levers, press buttons, set repeater delay (H)' },
    { id: 'measure', name: 'Measure', icon: 'measure', key: 'm', tip: 'Measure a distance (M)' },
    { id: 'label', name: 'Note', icon: 'label', key: 't', tip: 'Pin a note to a block (T)' },
    { id: 'pan', name: 'Move', icon: 'pan', key: null, tip: 'Move the view' },
  ];

  const app = (BP.app = {});
  const st = (app.state = {
    tool: 'pencil', layer: 0, block: 'oak_planks', shape: 'full', facing: 'n',
    filled: false, thick: 1, height: 1, fromCenter: false, lock: false, brush: 1,
    sym: { x: false, z: false }, mirror: [23.5, 23.5],
    showGrid: true, showChunks: true, showBelow: true, showAbove: false, allLabels: false,
    origin: [0, 64, 0], name: 'Untitled build', labels: [], id: null,
    sel: null, selAll: false, clip: null, pasting: false, clipRot: 0,
    preview: null, preview2d: null, previewSig: 0, dims: null, hover: null, measure: null,
    power: false, playing: true, speed: 10, view: 'plan', pencilMode: 'auto', penActive: false,
    recent: ['oak_planks', 'stone_bricks', 'oak_log', 'glass_pane', 'spruce_planks', 'cobblestone', 'redstone_dust', 'repeater', 'redstone_lamp'],
    panel: null,
  });

  BP.history = new BP.History();
  BP.world = new BP.World(48, 32, 48);
  app.sim = new BP.Sim();

  // ---------- helpers ----------
  app.def = () => BP.BLOCK[st.block];
  app.currentCell = (f = st.facing) => {
    const def = app.def();
    const c = { b: st.block, s: def.shapes ? st.shape : 'full' };
    const choices = BP.dirChoices(def, c.s);
    if (choices) c.f = choices.includes(f) ? f : choices[0];
    if (def.rs === 'repeater') c.p = { d: 1 };
    if (def.rs === 'comparator') c.p = { m: 'c' };
    if (def.rs === 'lever' || def.rs === 'button' || def.rs === 'plate') c.p = { on: false };
    return c;
  };
  app.redraw = () => { if (app.v2d) app.v2d.dirty = true; };
  let toastT;
  app.toast = (msg, action) => {
    const t = $('#toast'); t.textContent = msg;
    if (action) { const b = el('button', { text: action.label, onclick: () => { action.fn(); t.classList.remove('show'); } }); t.append(b); }
    t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), action ? 5000 : 2400);
  };
  const worldY = (y) => st.origin[1] + y;
  app.worldY = worldY;

  // mirrored placements of a list of [x,z] at layer range
  function expand(cells2d, makeCell, y0 = st.layer, h = 1) {
    const out = [];
    const seen = new Set();
    for (const [x, z] of cells2d) {
      for (const [mx, mz, fx, fz] of BP.mirrorPoints(x, z, st.sym, st.mirror[0], st.mirror[1])) {
        for (let y = y0; y < y0 + h; y++) {
          const k = mx + ',' + y + ',' + mz; if (seen.has(k)) continue; seen.add(k);
          if (!BP.world.inside(mx, y, mz)) continue;
          let c = makeCell ? makeCell() : null;
          if (c && c.f) c = Object.assign({}, c, { f: BP.mirrorFacing(c.f, fx, fz) });
          out.push([mx, y, mz, c]);
        }
      }
    }
    return out;
  }
  const brushCells = (x, z) => { const r = st.brush, a = []; const o = Math.floor((r - 1) / 2); for (let i = 0; i < r; i++) for (let j = 0; j < r; j++) a.push([x - o + i, z - o + j]); return a; };
  function setPreview(list, opts = {}) {
    st.preview = list && list.length ? list : null;
    st.preview2d = null;
    if (st.preview && opts.project) {
      const top = new Map();
      for (const v of st.preview) { const k = v[0] + ',' + v[2]; const cur = top.get(k); if (!cur || cur[1] < v[1]) top.set(k, v); }
      st.preview2d = [...top.values()];
    }
    st.previewSig++;
    app.redraw();
  }
  app.setPreview = setPreview;
  function apply(list, label) {
    BP.history.begin(label);
    let n = 0;
    for (const [x, y, z, c] of list) if (BP.world.set(x, y, z, c ? BP.cloneCell(c) : null)) n++;
    BP.history.commit();
    return n;
  }
  app.apply = apply;

  // ---------- tools ----------
  let drag = null;
  app.toolDown = (cell, e, px) => {
    const [x, z] = cell;
    if (e && e.altKey && st.tool !== 'pick') return pickAt(x, z);
    if (st.pasting) { drag = { kind: 'paste' }; app.hover(cell); return; }
    switch (st.tool) {
      case 'pencil': case 'erase': {
        BP.history.begin(st.tool === 'erase' ? 'Erase' : 'Place');
        drag = { kind: 'paint', last: [x, z] };
        paint(x, z); break;
      }
      case 'rect': case 'circle': case 'line':
        drag = { kind: 'shape', a: [x, z], b: [x, z], shift: e && e.shiftKey }; shapePreview(); break;
      case 'fill': floodFill(x, z); break;
      case 'select': drag = { kind: 'select' }; st.sel = { x0: x, z0: z, x1: x, z1: z }; app.renderOpts(); app.redraw(); break;
      case 'pick': pickAt(x, z); break;
      case 'hand': handAt(x, st.layer, z); break;
      case 'measure': drag = { kind: 'measure' }; st.measure = [x, z, x, z]; app.redraw(); break;
      case 'label': app.editLabel(x, st.layer, z); break;
    }
    void px;
  };
  app.toolMove = (cell, e) => {
    if (!drag) return;
    const [x, z] = cell;
    if (drag.kind === 'paint') {
      if (drag.last[0] === x && drag.last[1] === z) return;
      for (const [lx, lz] of BP.shapes.line(drag.last[0], drag.last[1], x, z)) paint(lx, lz);
      drag.last = [x, z];
    } else if (drag.kind === 'shape') {
      if (drag.b[0] === x && drag.b[1] === z && drag.shift === !!(e && e.shiftKey)) return;
      drag.b = [x, z]; drag.shift = !!(e && e.shiftKey); shapePreview();
    } else if (drag.kind === 'select') {
      st.sel.x1 = Math.max(0, Math.min(BP.world.w - 1, x)); st.sel.z1 = Math.max(0, Math.min(BP.world.d - 1, z)); app.redraw();
    } else if (drag.kind === 'measure') {
      st.measure[2] = x; st.measure[3] = z; app.redraw();
    } else if (drag.kind === 'paste') { app.hover(cell); }
  };
  app.toolUp = (cell) => {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.kind === 'paint') {
      const n = BP.history.commit();
      if (n && st.tool === 'pencil') pushRecent(st.block);
    } else if (d.kind === 'shape') {
      const list = st.preview || [];
      const n = apply(list, st.tool === 'circle' ? 'Circle' : st.tool === 'rect' ? 'Rectangle' : 'Line');
      setPreview(null); st.dims = null;
      if (n) pushRecent(st.block);
      app.redraw();
    } else if (d.kind === 'select') {
      const s = st.sel; const [a, b, c, e] = BP.shapes.norm(s.x0, s.z0, s.x1, s.z1);
      st.sel = { x0: Math.max(0, a), z0: Math.max(0, b), x1: Math.min(BP.world.w - 1, c), z1: Math.min(BP.world.d - 1, e) };
      app.renderOpts(); app.refreshPanel();
    } else if (d.kind === 'paste') {
      pasteAt(cell[0], cell[1]);
    }
    void cell;
  };
  app.toolCancel = () => {
    if (!drag) return;
    if (drag.kind === 'paint') BP.history.cancel();
    if (drag.kind === 'shape') { setPreview(null); st.dims = null; }
    if (drag.kind === 'select') st.sel = null;
    drag = null; app.redraw();
  };
  let tempPrev = null;
  app.tempTool = (t) => { tempPrev = st.tool; st.tool = t; setTimeout(() => { if (tempPrev) { st.tool = tempPrev; tempPrev = null; } }, 0); };

  function paint(x, z) {
    const erase = st.tool === 'erase';
    const list = expand(brushCells(x, z), erase ? null : () => app.currentCell(), st.layer, erase ? st.height : 1);
    for (const [px, py, pz, c] of list) BP.world.set(px, py, pz, c);
    app.redraw();
  }
  function shapePreview() {
    let [ax, az] = drag.a, [bx, bz] = drag.b;
    const lock = st.lock || drag.shift;
    if (lock && st.tool !== 'line') {
      const dx = bx - ax, dz = bz - az, m = Math.max(Math.abs(dx), Math.abs(dz));
      bx = ax + Math.sign(dx || 1) * m; bz = az + Math.sign(dz || 1) * m;
    }
    if (lock && st.tool === 'line') { // snap to 0/45/90 degrees
      const dx = bx - ax, dz = bz - az;
      if (Math.abs(dx) > 2 * Math.abs(dz)) bz = az; else if (Math.abs(dz) > 2 * Math.abs(dx)) bx = ax;
      else { const m = Math.max(Math.abs(dx), Math.abs(dz)); bx = ax + Math.sign(dx) * m; bz = az + Math.sign(dz) * m; }
    }
    if (st.fromCenter && st.tool !== 'line') { const cx = ax, cz = az; ax = 2 * cx - bx; az = 2 * cz - bz; }
    let cells;
    if (st.tool === 'rect') cells = BP.shapes.rect(ax, az, bx, bz, st.filled, st.thick);
    else if (st.tool === 'circle') cells = BP.shapes.ellipse(ax, az, bx, bz, st.filled, st.thick);
    else cells = BP.shapes.line(ax, az, bx, bz, st.thick);
    const list = expand(cells, () => app.currentCell(), st.layer, st.height);
    setPreview(list);
    const w = Math.abs(bx - ax) + 1, d = Math.abs(bz - az) + 1;
    let text;
    if (st.tool === 'line') text = `${Math.max(w, d)} long`;
    else if (st.tool === 'circle' && w === d) text = `⌀ ${w}${w % 2 ? ' (odd: has a center block)' : ''}`;
    else text = `${w} × ${d}`;
    if (st.height > 1) text += ` × ${st.height} high`;
    text += ` · ${list.length} blocks`;
    st.dims = { text, x: (Math.min(ax, bx) + Math.max(ax, bx) + 1) / 2, z: Math.min(az, bz) };
  }
  function floodFill(x, z) {
    const w = BP.world, y = st.layer;
    if (!w.inside(x, y, z)) return;
    const target = BP.cellKey(w.get(x, y, z));
    const nc = app.currentCell();
    if (target === BP.cellKey(nc)) return;
    const seen = new Set([x + ',' + z]), q = [[x, z]], out = [];
    while (q.length && out.length < 40000) {
      const [cx, cz] = q.pop(); out.push([cx, cz]);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, nz = cz + dz, k = nx + ',' + nz;
        if (seen.has(k) || !w.inside(nx, y, nz)) continue;
        if (BP.cellKey(w.get(nx, y, nz)) !== target) continue;
        seen.add(k); q.push([nx, nz]);
      }
    }
    // an empty area that touches the plot edge is "outside": warn instead of flooding the whole plot
    if (!target) {
      const edge = out.some(([a, b]) => a === 0 || b === 0 || a === w.w - 1 || b === w.d - 1);
      if (edge && out.length > 64) { app.toast('That area is not closed in. Draw a wall around it first, or use Rect with Filled on.'); return; }
    }
    const n = apply(expand(out, () => nc), 'Fill');
    app.toast(`Filled ${n} block${n === 1 ? '' : 's'}`); pushRecent(st.block); app.redraw();
  }
  function pickAt(x, z) {
    const w = BP.world;
    let c = w.get(x, st.layer, z), y = st.layer;
    if (!c) for (y = st.layer - 1; y >= 0; y--) { c = w.get(x, y, z); if (c) break; }
    if (!c) { app.toast('Nothing here to pick'); return; }
    app.setBlock(c.b, { shape: c.s || 'full', facing: c.f });
    if (st.tool === 'pick') app.setTool('pencil');
    app.toast(`Picked ${BP.BLOCK[c.b].name}${y !== st.layer ? ' from layer ' + y : ''}`);
  }
  function handAt(x, y, z) {
    const c = BP.world.get(x, y, z);
    if (!c || !BP.BLOCK[c.b].rs) { app.toast('Tap a lever, button, repeater, comparator or dust'); return; }
    if (!st.power) app.setPower(true, true);
    const msg = app.sim.interact(x, y, z);
    if (!st.playing) app.sim.settle(60);
    if (msg) app.toast(msg);
    app.redraw(); app.refreshPanel();
  }
  app.tap3d = (h, e) => {
    const w = BP.world;
    if (st.tool === 'pencil') {
      const [x, y, z] = h.place;
      if (!w.inside(x, y, z)) return;
      apply(expand([[x, z]], () => app.currentCell(), y, 1), 'Place'); pushRecent(st.block);
    } else if (st.tool === 'erase') {
      if (h.cell) apply([[...h.cell, null]], 'Erase');
    } else if (st.tool === 'pick') {
      if (h.cell) { const c = w.get(...h.cell); app.setBlock(c.b, { shape: c.s, facing: c.f }); app.setTool('pencil'); }
    } else if (st.tool === 'hand') {
      if (h.cell) handAt(...h.cell);
    } else if (h.cell) {
      app.setLayer(h.cell[1]); app.toast(`Layer ${h.cell[1]} (Y ${worldY(h.cell[1])}). Shapes are drawn in the plan.`);
    }
    void e;
  };

  // hover: HUD + pencil ghost (mouse and Apple Pencil hover)
  app.hover = (cell) => {
    st.hover = cell;
    if (cell && st.pasting && st.clip) {
      const list = clipCells().map(([dx, dy, dz, c]) => [cell[0] + dx, st.layer + dy, cell[1] + dz, c]).filter(([x, y, z]) => BP.world.inside(x, y, z));
      setPreview(list, { project: true });
    } else if (cell && !drag && st.tool === 'pencil' && BP.world.inside(cell[0], st.layer, cell[1])) {
      setPreview(expand(brushCells(cell[0], cell[1]), () => app.currentCell()));
    } else if (!drag && st.preview && (st.tool === 'pencil') && !cell) setPreview(null);
    updateHud(); app.redraw();
  };
  function updateHud() {
    const hud = $('#hud'); hud.textContent = '';
    if (st.hover) {
      const [x, z] = st.hover;
      if (BP.world.inside(x, st.layer, z)) {
        hud.append(el('span', { class: 'chip-ro', text: `X ${x + st.origin[0]}  Y ${worldY(st.layer)}  Z ${z + st.origin[2]}` }));
        const c = BP.world.get(x, st.layer, z);
        if (c) {
          const d = BP.BLOCK[c.b];
          let t = d.name + (c.s === 'slab' ? ' slab' : c.s === 'slabT' ? ' top slab' : c.s === 'stair' ? ' stairs' : c.s === 'stairT' ? ' upside-down stairs' : '');
          if (c.f) t += ' · ' + BP.DIR_NAME[c.f];
          if (st.power && d.rs === 'dust') t += ' · signal ' + (app.sim.dust.get(BP.world.key(x, st.layer, z)) || 0);
          hud.append(el('span', { class: 'chip-ro', text: t }));
        }
      }
    }
    if (st.sel) { const [a, b, c, d] = BP.shapes.norm(st.sel.x0, st.sel.z0, st.sel.x1, st.sel.z1); hud.append(el('span', { class: 'chip-ro', text: `Selection ${c - a + 1} × ${d - b + 1}` })); }
  }
  app.updateHud = updateHud;

  // ---------- selection, clipboard ----------
  app.selCells = () => {
    if (!st.sel) return [];
    const [a, b, c, d] = BP.shapes.norm(st.sel.x0, st.sel.z0, st.sel.x1, st.sel.z1);
    const out = [];
    for (const [x, y, z, cell] of BP.world.each()) if (x >= a && x <= c && z >= b && z <= d && (st.selAll || y === st.layer)) out.push([x, y, z, cell]);
    return out;
  };
  app.copySel = (cut) => {
    if (!st.sel) return;
    const [a, b, c, d] = BP.shapes.norm(st.sel.x0, st.sel.z0, st.sel.x1, st.sel.z1);
    const cells = app.selCells();
    const y0 = st.selAll ? Math.min(...cells.map((v) => v[1]), st.layer) : st.layer;
    st.clip = { w: c - a + 1, d: d - b + 1, cells: cells.map(([x, y, z, cell]) => [x - a, y - y0, z - b, BP.cloneCell(cell)]) };
    st.clipRot = 0;
    if (cut) { apply(cells.map(([x, y, z]) => [x, y, z, null]), 'Cut'); }
    app.toast(`${cut ? 'Cut' : 'Copied'} ${cells.length} block${cells.length === 1 ? '' : 's'}. Tap Paste to place.`);
    app.renderOpts();
  };
  function clipCells() {
    const c = st.clip; if (!c) return [];
    let w = c.w, d = c.d;
    let cells = c.cells.map((v) => [v[0], v[1], v[2], v[3]]);
    for (let r = 0; r < st.clipRot; r++) {
      cells = cells.map(([x, y, z, cell]) => [d - 1 - z, y, x, cell && cell.f ? Object.assign({}, cell, { f: BP.rotateFacingCW(cell.f) }) : cell]);
      [w, d] = [d, w];
    }
    // anchor the paste on its center so it sits under the finger or pencil
    const ox = Math.floor(w / 2), oz = Math.floor(d / 2);
    return cells.map(([x, y, z, cell]) => [x - ox, y, z - oz, cell]);
  }
  app.startPaste = (clip) => {
    if (clip) { st.clip = clip; st.clipRot = 0; }
    if (!st.clip) return;
    st.pasting = true; app.renderOpts();
    app.toast('Tap where the copy should go. Rotate with R.');
    if (st.hover) app.hover(st.hover);
  };
  function pasteAt(x, z) {
    if (!st.clip) return;
    const list = clipCells().map(([dx, dy, dz, c]) => [x + dx, st.layer + dy, z + dz, c]).filter(([a, b, c]) => BP.world.inside(a, b, c));
    const n = apply(list, 'Paste');
    app.toast(`Placed ${n} block${n === 1 ? '' : 's'}. Tap again for another copy.`);
    setPreview(null); app.hover([x, z]);
  }
  app.endPaste = () => { st.pasting = false; setPreview(null); app.renderOpts(); };
  app.transformSel = (kind) => {
    if (!st.sel) return;
    const [a, b, c, d] = BP.shapes.norm(st.sel.x0, st.sel.z0, st.sel.x1, st.sel.z1);
    const cells = app.selCells(); const W = c - a + 1, D = d - b + 1;
    const out = new Map();
    for (const [x, y, z] of cells) out.set(x + ',' + y + ',' + z, [x, y, z, null]);
    for (const [x, y, z, cell] of cells) {
      let lx = x - a, lz = z - b, f = cell.f, nx, nz;
      if (kind === 'flipx') { nx = W - 1 - lx; nz = lz; f = BP.mirrorFacing(f, true, false); }
      else if (kind === 'flipz') { nx = lx; nz = D - 1 - lz; f = BP.mirrorFacing(f, false, true); }
      else { nx = D - 1 - lz; nz = lx; f = f && BP.rotateFacingCW(f); }
      const X = a + nx, Z = b + nz;
      out.set(X + ',' + y + ',' + Z, [X, y, Z, Object.assign(BP.cloneCell(cell), f ? { f } : {})]);
    }
    apply([...out.values()].filter(([x, y, z]) => BP.world.inside(x, y, z)), kind === 'rot' ? 'Rotate' : 'Flip');
    if (kind === 'rot') { st.sel = { x0: a, z0: b, x1: Math.min(BP.world.w - 1, a + D - 1), z1: Math.min(BP.world.d - 1, b + W - 1) }; }
    app.redraw();
  };
  app.fillSel = (mode) => {
    if (!st.sel) return;
    const [a, b, c, d] = BP.shapes.norm(st.sel.x0, st.sel.z0, st.sel.x1, st.sel.z1);
    const nc = app.currentCell(), list = [];
    if (mode === 'replace') {
      for (const [x, y, z, cell] of app.selCells()) list.push([x, y, z, Object.assign(BP.cloneCell(cell), { b: st.block, s: app.def().shapes ? cell.s : 'full' })]);
    } else if (mode === 'walls') {
      for (const [x, z] of BP.shapes.rect(a, b, c, d, false, 1)) for (let y = st.layer; y < st.layer + Math.max(1, st.height); y++) list.push([x, y, z, nc]);
    } else {
      for (let z = b; z <= d; z++) for (let x = a; x <= c; x++) list.push([x, st.layer, z, nc]);
    }
    const n = apply(list.filter(([x, y, z]) => BP.world.inside(x, y, z)), mode === 'replace' ? 'Replace' : mode === 'walls' ? 'Walls' : 'Fill');
    app.toast(`${n} block${n === 1 ? '' : 's'} changed`); pushRecent(st.block);
  };
  app.deleteSel = () => {
    const cells = app.selCells();
    apply(cells.map(([x, y, z]) => [x, y, z, null]), 'Delete');
    app.toast(`Deleted ${cells.length} block${cells.length === 1 ? '' : 's'}`, { label: 'Undo', fn: () => app.undo() });
  };

  // ---------- state setters ----------
  app.setTool = (t) => {
    if (st.pasting && t !== 'select') app.endPaste();
    st.tool = t; drag = null; st.dims = null;
    if (t !== 'measure') st.measure = null;
    if (!st.preview || !st.preview2d) setPreview(null);
    document.querySelectorAll('#tools .tool').forEach((b) => b.setAttribute('aria-pressed', b.dataset.tool === t));
    $('#c2d').style.cursor = t === 'pan' ? 'grab' : t === 'hand' ? 'pointer' : 'crosshair';
    app.renderOpts(); app.redraw();
  };
  app.setBlock = (id, o = {}) => {
    const def = BP.BLOCK[id]; if (!def) return;
    st.block = id;
    if (o.shape) st.shape = def.shapes ? o.shape : 'full';
    else if (!def.shapes) st.shape = 'full';
    if (o.facing) st.facing = o.facing;
    const ch = BP.dirChoices(def, st.shape);
    if (ch && !ch.includes(st.facing)) st.facing = ch[0];
    pushRecent(id, true);
    app.renderChip(); app.renderOpts(); app.refreshPanel();
    if (st.hover) app.hover(st.hover);
  };
  function pushRecent(id, quiet) {
    st.recent = [id, ...st.recent.filter((r) => r !== id)].slice(0, 9);
    store.set('bw:recent', st.recent);
    if (!quiet) app.refreshPanel();
  }
  app.rotateFacing = () => {
    if (st.pasting) { st.clipRot = (st.clipRot + 1) % 4; if (st.hover) app.hover(st.hover); return; }
    const ch = BP.dirChoices(app.def(), st.shape);
    if (!ch) { app.toast(`${app.def().name} has no direction`); return; }
    st.facing = ch[(ch.indexOf(st.facing) + 1) % ch.length];
    app.renderChip(); app.renderOpts(); if (st.hover) app.hover(st.hover);
  };
  app.setLayer = (y) => {
    y = Math.max(0, Math.min(BP.world.h - 1, y));
    if (y === st.layer) return;
    st.layer = y;
    $('#lvNum').textContent = y; $('#lvY').textContent = 'Y ' + worldY(y);
    if (st.pasting && st.hover) app.hover(st.hover);
    else if (st.preview && !st.preview2d) setPreview(null);
    app.refreshPanel(); app.redraw(); updateHud();
  };
  app.setView = (v) => {
    st.view = v;
    $('#stage').dataset.view = v;
    $('#vPlan').setAttribute('aria-pressed', v === 'plan'); $('#v3d').setAttribute('aria-pressed', v === '3d'); $('#vSplit').setAttribute('aria-pressed', v === 'split');
    requestAnimationFrame(() => { app.v2d.resize(); app.v3d.resize(); });
    store.set('bw:view', v);
  };
  app.penSeen = () => {
    if (st.pencilMode === 'auto' && !st.penActive) {
      st.penActive = true;
      app.toast('Apple Pencil found: the Pencil draws, fingers move and zoom.');
    }
  };
  app.fingerPans = () => st.pencilMode === 'on' || (st.pencilMode === 'auto' && st.penActive);
  app.undo = (gesture) => { const l = BP.history.undo(); if (l) app.toast('Undid ' + l.toLowerCase()); else if (gesture) app.toast('Nothing to undo'); app.redraw(); };
  app.redo = (gesture) => { const l = BP.history.redo(); if (l) app.toast('Redid ' + l.toLowerCase()); else if (gesture) app.toast('Nothing to redo'); app.redraw(); };

  // ---------- power simulation ----------
  let simTimer = null;
  app.setPower = (on, quiet) => {
    st.power = on;
    clearInterval(simTimer); simTimer = null;
    if (on) { app.sim.reset(); app.sim.settle(80); app.sim.tick = 0; startSim(); if (!quiet) app.toast('Power preview on'); }
    app.redraw(); app.refreshPanel(); app.renderOpts();
  };
  function startSim() {
    clearInterval(simTimer);
    if (!st.power || !st.playing) return;
    simTimer = setInterval(() => { app.sim.step(); app.redraw(); document.querySelectorAll('.tickc').forEach((t) => { t.textContent = tickText(); }); }, 1000 / st.speed);
  }
  app.startSim = startSim;
  const tickText = () => `Tick ${app.sim.tick} · ${(app.sim.tick / 10).toFixed(1)} s`;
  app.tickText = tickText;

  // ---------- storage ----------
  let saveT = null, dirty = false;
  app.markDirty = () => {
    dirty = true; $('#saveState').textContent = '· editing';
    clearTimeout(saveT); saveT = setTimeout(app.saveLocal, 700);
  };
  app.snapshot = () => BP.serialize({ world: BP.world, name: st.name, origin: st.origin, labels: st.labels });
  app.saveLocal = () => {
    if (!st.id) st.id = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const data = app.snapshot();
    const ok = store.set('bw:d:' + st.id, data);
    const list = store.get('bw:list', []).filter((d) => d.id !== st.id);
    list.unshift({ id: st.id, name: st.name, saved: data.saved, n: data.blocks.length / 4, size: data.size });
    store.set('bw:list', list.slice(0, 60));
    store.set('bw:current', st.id);
    dirty = false;
    $('#saveState').textContent = ok ? '· saved' : '· not saved';
    if (BP.cloud) BP.cloud.queueSave(st.id, data);
  };
  app.load = (data, opts = {}) => {
    const r = BP.deserialize(data);
    BP.world = r.world; st.name = r.name; st.origin = r.origin; st.labels = r.labels;
    st.id = opts.id || null; st.sel = null; st.measure = null; st.mirror = [(r.world.w - 1) / 2, (r.world.d - 1) / 2];
    BP.history.clear(); app.sim.reset(); setPreview(null);
    if (st.power) app.setPower(true, true);
    $('#docnameText').textContent = st.name;
    // start on the layer above the highest block of the ground floor area, but never above the build
    let top = -1; for (const [, y] of BP.world.each()) top = Math.max(top, y);
    st.layer = -1; app.setLayer(Math.max(0, Math.min(opts.layer != null ? opts.layer : 1, top)));
    app.v2d.topCache.v = -1; app.v2d.fit(); if (app.v3d.ok) { app.v3d.firstBuild = true; app.v3d.built = -1; }
    if (!st.id) app.saveLocal(); else $('#saveState').textContent = '· saved';
    app.refreshPanel(); app.redraw();
  };
  app.newDesign = (w = 48, h = 32, d = 48) => {
    app.load({ app: 'blockwright', v: 1, name: 'Untitled build', size: [w, h, d], origin: [0, 64, 0], palette: [], blocks: [] });
    app.setLayer(0);
  };

  // ---------- rendering of chrome ----------
  app.renderChip = () => {
    const def = app.def();
    $('#chipImg').src = BP.TEX[BP.faceTex(def, 'top')] || '';
    $('#chipName').textContent = def.name;
    const sh = { full: 'Full block', slab: 'Slab', slabT: 'Top slab', stair: 'Stairs', stairT: 'Upside-down stairs' }[def.shapes ? st.shape : 'full'];
    const ch = BP.dirChoices(def, st.shape);
    $('#chipSub').textContent = sh + (ch ? ' · ' + BP.DIR_NAME[ch.includes(st.facing) ? st.facing : ch[0]] : '');
  };
  const tog = (label, pressed, onclick, cls = '', title) => el('button', { class: 'tog ' + cls, 'aria-pressed': String(!!pressed), onclick, title }, label);
  const stepper = (val, onchange, min, max, fmt = (v) => v, title) => {
    const out = el('output', { text: fmt(val) });
    const set = (v) => { v = Math.max(min, Math.min(max, v)); onchange(v); out.textContent = fmt(v); };
    return el('span', { class: 'stepper', title }, [el('button', { 'aria-label': 'Less', onclick: () => set(val = Math.max(min, val - 1)) }, '−'), out, el('button', { 'aria-label': 'More', onclick: () => set(val = Math.min(max, val + 1)) }, '+')]);
  };
  const sep = () => el('span', { class: 'sep' });
  const lbl = (t) => el('span', { class: 'lbl', text: t });
  app.ctl = { tog, stepper, sep, lbl };
  function shapeSeg() {
    const def = app.def(); if (!def.shapes) return null;
    const s = st.shape;
    return el('span', { class: 'row', style: 'flex-wrap:nowrap;gap:4px' }, [
      tog('Full', s === 'full', () => { st.shape = 'full'; app.setBlock(st.block); }),
      tog('Slab', s === 'slab' || s === 'slabT', () => { st.shape = s === 'slab' ? 'slabT' : 'slab'; app.setBlock(st.block); }, '', 'Tap again for a top slab'),
      tog('Stairs', s === 'stair' || s === 'stairT', () => { st.shape = s === 'stair' ? 'stairT' : 'stair'; app.setBlock(st.block); }, '', 'Tap again for upside-down stairs'),
    ]);
  }
  function facingBtn() {
    const ch = BP.dirChoices(app.def(), st.shape); if (!ch) return null;
    const f = ch.includes(st.facing) ? st.facing : ch[0];
    const arrows = { n: '↑', e: '→', s: '↓', w: '←', u: '⊙', d: '⊗' };
    return el('button', { class: 'tog', onclick: app.rotateFacing, title: 'Turn (R)' }, [icon('rotate'), `${arrows[f]} ${BP.DIR_NAME[f]}`]);
  }
  function mirrorBtns() {
    return [tog('Mirror ↔', st.sym.x, () => { st.sym.x = !st.sym.x; app.renderOpts(); app.redraw(); }, 'sel', 'Mirror left and right across the purple line'),
      tog('Mirror ↕', st.sym.z, () => { st.sym.z = !st.sym.z; app.renderOpts(); app.redraw(); }, 'sel', 'Mirror top and bottom across the purple line'),
      (st.sym.x || st.sym.z) && st.sel ? el('button', { class: 'tog', onclick: () => { const [a, b, c, d] = BP.shapes.norm(st.sel.x0, st.sel.z0, st.sel.x1, st.sel.z1); st.mirror = [(a + c) / 2, (b + d) / 2]; app.redraw(); app.toast('Mirror line moved to the selection center'); } }, 'Center on selection') : null];
  }
  app.renderOpts = () => {
    const o = $('#opts'); o.textContent = '';
    const add = (...k) => k.flat().forEach((x) => x && o.append(x));
    if (st.pasting) {
      add(lbl('Paste'), el('span', { class: 'hint', text: 'Tap the plan to place' }), el('button', { class: 'tog', onclick: app.rotateFacing }, [icon('rotate'), 'Rotate']), tog('Done', false, app.endPaste));
      return;
    }
    switch (st.tool) {
      case 'pencil':
        add(shapeSeg(), facingBtn(), sep(), lbl('Brush'), stepper(st.brush, (v) => { st.brush = v; }, 1, 5, (v) => v + '×' + v), sep(), mirrorBtns());
        break;
      case 'erase':
        add(lbl('Brush'), stepper(st.brush, (v) => { st.brush = v; }, 1, 5, (v) => v + '×' + v), lbl('Depth'), stepper(st.height, (v) => { st.height = v; }, 1, 32, (v) => v + (v > 1 ? ' layers' : ' layer'), 'Erase through this many layers going up'), sep(), mirrorBtns());
        break;
      case 'rect': case 'circle': case 'line':
        add(st.tool !== 'line' ? [tog('Outline', !st.filled, () => { st.filled = false; app.renderOpts(); }), tog('Filled', st.filled, () => { st.filled = true; app.renderOpts(); })] : null,
          lbl(st.tool === 'line' ? 'Width' : 'Wall'), stepper(st.thick, (v) => { st.thick = v; }, 1, 6),
          lbl('Height'), stepper(st.height, (v) => { st.height = v; }, 1, 64, (v) => v + (v > 1 ? ' layers' : ' layer'), 'Build this many layers up at once. Great for walls and towers.'),
          tog(st.tool === 'circle' ? 'Perfect circle' : st.tool === 'line' ? 'Snap 45°' : 'Square', st.lock, () => { st.lock = !st.lock; app.renderOpts(); }, '', 'Same as holding Shift'),
          st.tool !== 'line' ? tog('From center', st.fromCenter, () => { st.fromCenter = !st.fromCenter; app.renderOpts(); }) : null,
          sep(), shapeSeg(), facingBtn(), sep(), mirrorBtns());
        break;
      case 'fill': add(el('span', { class: 'hint', text: 'Tap inside a closed shape to fill it on this layer.' }), shapeSeg(), facingBtn()); break;
      case 'select': {
        add(tog('This layer', !st.selAll, () => { st.selAll = false; app.renderOpts(); }), tog('All layers', st.selAll, () => { st.selAll = true; app.renderOpts(); }), sep());
        if (st.sel) {
          const b = (t, ic, fn, title) => el('button', { class: 'tog', onclick: fn, title }, [ic ? icon(ic) : null, t]);
          add(b('Copy', 'copy', () => app.copySel(false)), b('Cut', null, () => app.copySel(true)), st.clip ? b('Paste', null, () => app.startPaste()) : null,
            b('Delete', 'trash', app.deleteSel), sep(),
            b('Rotate', 'rotate', () => app.transformSel('rot')), b('Flip', 'flipx', () => app.transformSel('flipx')), b('Flip', 'flipz', () => app.transformSel('flipz')), sep(),
            b('Fill', 'fill', () => app.fillSel('fill'), 'Fill the selection on this layer with the current block'),
            b('Walls', 'rect', () => app.fillSel('walls'), 'Build walls around the selection using the Height setting'),
            lbl('Height'), stepper(st.height, (v) => { st.height = v; }, 1, 64),
            b('Swap block', null, () => app.fillSel('replace'), 'Change every block in the selection to the current block, keeping shapes and directions'),
            b('Roof', 'roof', () => app.openPanel('roof')), b('Clear', 'close', () => { st.sel = null; app.renderOpts(); app.redraw(); updateHud(); }));
        } else {
          add(el('span', { class: 'hint', text: 'Drag over an area to select it.' }), st.clip ? el('button', { class: 'tog', onclick: () => app.startPaste() }, 'Paste copy') : null);
        }
        break;
      }
      case 'pick': add(el('span', { class: 'hint', text: 'Tap a block to use it. Alt-click works with any tool.' })); break;
      case 'hand':
        add(tog(st.power ? 'Power preview on' : 'Power preview off', st.power, () => app.setPower(!st.power), 'sel'),
          st.power ? el('button', { class: 'tog', onclick: () => { st.playing = !st.playing; startSim(); app.renderOpts(); app.refreshPanel(); } }, [icon(st.playing ? 'pause' : 'play'), st.playing ? 'Pause' : 'Play']) : null,
          st.power ? el('button', { class: 'tog', onclick: () => { app.sim.step(); app.redraw(); app.renderOpts(); } }, [icon('step'), 'Step']) : null,
          st.power ? el('span', { class: 'hint tickc', text: tickText() }) : null,
          el('span', { class: 'hint', text: 'Tap levers, buttons, repeaters and comparators.' }));
        break;
      case 'measure': add(el('span', { class: 'hint', text: 'Drag between two blocks. Counts include both ends.' })); break;
      case 'label': add(el('span', { class: 'hint', text: 'Tap a block to add or edit a note on this layer.' }), tog('Show notes from all layers', st.allLabels, () => { st.allLabels = !st.allLabels; app.renderOpts(); app.redraw(); })); break;
      case 'pan': add(el('span', { class: 'hint', text: 'Drag to move. Pinch or scroll to zoom.' })); break;
    }
  };
  function renderTools() {
    const t = $('#tools'); t.textContent = '';
    for (const tool of TOOLS) {
      t.append(el('button', { class: 'tool', 'data-tool': tool.id, 'aria-pressed': String(st.tool === tool.id), title: tool.tip, onclick: () => app.setTool(tool.id) }, [icon(tool.icon), tool.name]));
    }
  }

  // ---------- keyboard ----------
  function bindKeys() {
    window.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
      if (k === ' ') { app.spaceHeld = true; e.preventDefault(); return; }
      if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? app.redo() : app.undo(); return; }
      if (mod && k === 'y') { e.preventDefault(); app.redo(); return; }
      if (mod && k === 'c') { if (st.sel) { e.preventDefault(); app.copySel(false); } return; }
      if (mod && k === 'x') { if (st.sel) { e.preventDefault(); app.copySel(true); } return; }
      if (mod && k === 'v') { if (st.clip) { e.preventDefault(); app.startPaste(); } return; }
      if (mod && k === 's') { e.preventDefault(); app.saveLocal(); app.toast('Saved'); return; }
      if (mod) return;
      if (k === 'escape') { if (st.pasting) app.endPaste(); else if (st.sel) { st.sel = null; app.renderOpts(); } else if (st.panel) app.closePanel(); app.toolCancel(); app.redraw(); return; }
      if (k === 'delete' || k === 'backspace') { if (st.sel) app.deleteSel(); return; }
      if (k === 'r') return app.rotateFacing();
      if (k === ']' || k === 'pageup') return app.setLayer(st.layer + 1);
      if (k === '[' || k === 'pagedown') return app.setLayer(st.layer - 1);
      if (k === 'tab') { e.preventDefault(); return app.setView(st.view === 'plan' ? '3d' : 'plan'); }
      if (k === 'f') { app.v2d.fit(); return; }
      if (k === 'x' && !mod) { st.sym.x = !st.sym.x; app.renderOpts(); app.redraw(); return; }
      if (/^[1-9]$/.test(k)) { const id = st.recent[+k - 1]; if (id) app.setBlock(id); return; }
      if (k === 'p') return app.setPower(!st.power);
      const tool = TOOLS.find((t) => t.key === k);
      if (tool) app.setTool(tool.id);
    });
    window.addEventListener('keyup', (e) => { if (e.key === ' ') app.spaceHeld = false; });
  }

  // ---------- sample build ----------
  function sample() {
    const w = new BP.World(40, 24, 40);
    const set = (x, y, z, b, s = 'full', f, p) => w.cells.set(w.key(x, y, z), Object.assign({ b, s }, f ? { f } : {}, p ? { p } : {}));
    const x0 = 13, z0 = 14, x1 = 25, z1 = 23;
    for (let z = z0 - 3; z <= z1 + 5; z++) for (let x = x0 - 4; x <= x1 + 4; x++) set(x, 0, z, 'grass_block');
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) set(x, 0, z, x === x0 || x === x1 || z === z0 || z === z1 ? 'cobblestone' : 'spruce_planks');
    for (let y = 1; y <= 4; y++) for (const [x, z] of BP.shapes.rect(x0, z0, x1, z1, false)) {
      const corner = (x === x0 || x === x1) && (z === z0 || z === z1);
      const midX = Math.round((x0 + x1) / 2);
      if (z === z1 && (x === midX) && y <= 2) { continue; }
      const win = (y === 2 || y === 3) && !corner && ((z === z0 || z === z1) ? (x - x0) % 4 === 2 : (z - z0) % 3 === 2);
      set(x, y, z, corner ? 'oak_log' : win ? 'glass_pane' : y === 1 ? 'stone_bricks' : 'oak_planks');
    }
    const mid = Math.round((x0 + x1) / 2);
    set(mid, 1, z1, 'oak_door', 'full', 's'); set(mid, 2, z1, 'oak_door', 'full', 's');
    set(mid, 0, z1 + 1, 'cobblestone', 'stair', 'n'); set(mid, 0, z1 + 2, 'gravel'); set(mid, 0, z1 + 3, 'gravel'); set(mid, 0, z1 + 4, 'gravel');
    // porch light: lever by the door powers a lamp line
    set(mid + 2, 1, z1 + 1, 'lever', 'full', 'u', { on: true });
    for (let x = mid + 3; x <= mid + 6; x++) set(x, 1, z1 + 1, 'redstone_dust');
    set(mid + 7, 1, z1 + 1, 'redstone_lamp');
    set(mid - 2, 1, z1 + 1, 'oak_fence'); set(mid - 3, 1, z1 + 1, 'oak_fence'); set(mid - 4, 1, z1 + 1, 'oak_fence');
    set(x0 + 1, 1, z0 + 1, 'chest', 'full', 's'); set(x0 + 2, 1, z0 + 1, 'furnace', 'full', 's'); set(x1 - 1, 1, z0 + 1, 'bookshelf');
    set(x0 + 1, 3, z0 + 1, 'torch', 'full', 's');
    const roof = BP.makeRoof({ x0, z0, x1, z1, y: 5, type: 'gable', axis: 'x', pitch: 'std', overhang: 1, mat: 'spruce_planks', fill: 'oak_planks', gableFill: true, trim: 'stone_bricks' });
    for (const [x, y, z, c] of roof) if (w.inside(x, y, z)) w.cells.set(w.key(x, y, z), c);
    const data = BP.serialize({ world: w, name: 'Sample: hillside cottage', origin: [100, 64, -40], labels: [{ x: mid, y: 1, z: z1 + 1, text: 'Front door' }, { x: mid + 7, y: 1, z: z1 + 1, text: 'Porch lamp' }] });
    return data;
  }

  // ---------- boot ----------
  function drawMark() {
    const c = $('#mark'), g = c.getContext('2d');
    const im = BP.IMG.grass_side; if (im) g.drawImage(im, 0, 0);
    g.fillStyle = '#e0301e'; g.fillRect(11, 11, 3, 3);
  }
  async function boot() {
    await BP.texReady;
    st.recent = store.get('bw:recent', st.recent).filter((id) => BP.BLOCK[id]);
    st.pencilMode = store.get('bw:pencil', 'auto');
    const theme = store.get('bw:theme', 'system'); if (theme !== 'system') document.documentElement.setAttribute('data-theme', theme);
    Object.assign(st, store.get('bw:prefs', {}));
    app.v2d = new BP.View2D($('#c2d'), app);
    app.v3d = new BP.View3D($('#pane3d'), app);
    BP.history.onChange = () => { app.markDirty(); $('#undo').disabled = !BP.history.undoStack.length; $('#redo').disabled = !BP.history.redoStack.length; app.refreshPanel(true); };
    renderTools(); app.renderChip(); drawMark(); bindKeys();
    BP.panels.init();
    // chrome events
    $('#undo').onclick = () => app.undo(); $('#redo').onclick = () => app.redo();
    $('#vPlan').onclick = () => app.setView('plan'); $('#v3d').onclick = () => app.setView('3d'); $('#vSplit').onclick = () => app.setView('split');
    $('#lvUp').onclick = () => app.setLayer(st.layer + 1); $('#lvDown').onclick = () => app.setLayer(st.layer - 1);
    $('#lvBtn').onclick = () => app.openPanel('layer');
    $('#ghostBtn').onclick = () => { st.showBelow = !st.showBelow; $('#ghostBtn').setAttribute('aria-pressed', st.showBelow); app.redraw(); };
    $('#fitBtn').onclick = () => { if (st.view === '3d') app.v3d.preset('iso'); else app.v2d.fit(); };
    $('#blockChip').onclick = () => app.openPanel('blocks');
    $('#docname').onclick = () => app.openPanel('designs');
    $('#shareBtn').onclick = () => app.openPanel('share');
    $('#moreBtn').onclick = () => app.openPanel('settings');
    document.querySelectorAll('[data-panel]').forEach((b) => { b.onclick = () => (st.panel === b.dataset.panel ? app.closePanel() : app.openPanel(b.dataset.panel)); });
    document.querySelectorAll('[data-cam]').forEach((b) => { b.onclick = () => app.v3d.preset(b.dataset.cam); });
    $('#cutBtn').onclick = () => { app.v3d.cut = !app.v3d.cut; $('#cutBtn').setAttribute('aria-pressed', app.v3d.cut); };
    let fitted = false;
    const ro = new ResizeObserver(() => { app.v2d.resize(); app.v3d.resize(); if (!fitted && app.v2d.W > 50) { fitted = true; app.v2d.fit(); } });
    ro.observe($('#pane2d')); ro.observe($('#pane3d'));
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { app.v2d.readColors(); app.v3d.applyTheme(); });
    // drag and drop a design file anywhere
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => { e.preventDefault(); const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) BP.panels.openFile(f); });
    // open last design, or the sample
    const cur = store.get('bw:current', null);
    const data = cur && store.get('bw:d:' + cur, null);
    app.v2d.resize();
    try { if (data) app.load(data, { id: cur }); else app.load(sample()); } catch (e) { app.load(sample()); }
    app.setView(store.get('bw:view', window.innerWidth >= 1100 ? 'split' : 'plan'));
    requestAnimationFrame(() => { app.v2d.resize(); app.v2d.fit(); });
    app.setTool('pencil');
    $('#undo').disabled = true; $('#redo').disabled = true;
    BP.panels.afterBoot();
  }
  app.savePrefs = () => store.set('bw:prefs', { showGrid: st.showGrid, showChunks: st.showChunks, showBelow: st.showBelow, showAbove: st.showAbove });
  let booted = false;
  const go = () => { if (!booted) { booted = true; boot(); } };
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', go); else go();
})();
