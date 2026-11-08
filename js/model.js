// Blockwright: world model, history, shape rasterizers, roof generator, save codec.
(function () {
  const BP = window.BP;

  // A cell is {b: blockId, s: shape, f: facing, p: props}
  // shape: full | slab | slabT | stair | stairT
  BP.cellKey = (c) => c ? `${c.b}|${c.s || 'full'}|${c.f || ''}|${c.p ? JSON.stringify(c.p) : ''}` : '';
  BP.cellFromKey = (k) => {
    if (!k) return null;
    const [b, s, f, p] = k.split('|');
    const c = { b, s: s || 'full' };
    if (f) c.f = f;
    if (p) try { c.p = JSON.parse(p); } catch (e) { /* ignore */ }
    return c;
  };
  BP.cloneCell = (c) => c ? { b: c.b, s: c.s || 'full', f: c.f, p: c.p ? Object.assign({}, c.p) : undefined } : null;

  // ---------- world ----------
  class World {
    constructor(w = 48, h = 32, d = 48) { this.resize(w, h, d, true); }
    resize(w, h, d, clear) {
      const old = clear ? null : this.cells;
      this.w = w; this.h = h; this.d = d;
      this.cells = new Map();
      if (old) for (const [k, c] of old) {
        const [x, y, z] = this.unkey(k, this._ow, this._od);
        if (this.inside(x, y, z)) this.cells.set(this.key(x, y, z), c);
      }
      this._ow = w; this._od = d;
      this.version++;
    }
    key(x, y, z) { return (y * this.d + z) * this.w + x; }
    unkey(k, w = this.w, d = this.d) { const x = k % w; const r = (k - x) / w; const z = r % d; return [x, (r - z) / d, z]; }
    inside(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < this.w && y < this.h && z < this.d; }
    get(x, y, z) { return this.inside(x, y, z) ? this.cells.get(this.key(x, y, z)) || null : null; }
    set(x, y, z, c) {
      if (!this.inside(x, y, z)) return false;
      const k = this.key(x, y, z);
      const old = this.cells.get(k) || null;
      if (BP.cellKey(old) === BP.cellKey(c)) return false;
      if (BP.history) BP.history.record(k, old, c);
      if (c) this.cells.set(k, c); else this.cells.delete(k);
      this.version++;
      return true;
    }
    *each() { for (const [k, c] of this.cells) { const [x, y, z] = this.unkey(k); yield [x, y, z, c]; } }
    layerBounds() {
      let maxY = -1;
      for (const [, y] of this.each()) if (y > maxY) maxY = y;
      return maxY;
    }
  }
  World.prototype.version = 0;
  BP.World = World;

  // ---------- history ----------
  class History {
    constructor() { this.undoStack = []; this.redoStack = []; this.tx = null; this.onChange = () => {}; }
    begin(label) { if (!this.tx) this.tx = { label, changes: new Map() }; }
    record(k, oldC, newC) {
      if (!this.tx) return;
      const ch = this.tx.changes.get(k);
      if (ch) ch[1] = newC; else this.tx.changes.set(k, [oldC, newC]);
    }
    commit() {
      const tx = this.tx; this.tx = null;
      if (!tx || !tx.changes.size) return 0;
      this.undoStack.push(tx); if (this.undoStack.length > 300) this.undoStack.shift();
      this.redoStack = [];
      this.onChange(tx.label);
      return tx.changes.size;
    }
    cancel() {
      const tx = this.tx; this.tx = null;
      if (tx) for (const [k, [o]] of tx.changes) this._apply(k, o);
    }
    _apply(k, c) { const w = BP.world; if (c) w.cells.set(k, c); else w.cells.delete(k); w.version++; }
    undo() {
      const tx = this.undoStack.pop(); if (!tx) return null;
      for (const [k, [o]] of tx.changes) this._apply(k, o);
      this.redoStack.push(tx); this.onChange(); return tx.label;
    }
    redo() {
      const tx = this.redoStack.pop(); if (!tx) return null;
      for (const [k, [, n]] of tx.changes) this._apply(k, n);
      this.undoStack.push(tx); this.onChange(); return tx.label;
    }
    clear() { this.undoStack = []; this.redoStack = []; this.tx = null; this.onChange(); }
  }
  BP.History = History;

  // ---------- shape rasterizers (on the X/Z plane) ----------
  const S = (BP.shapes = {});
  S.norm = (a, b, c, d) => [Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)];

  S.rect = function (x0, z0, x1, z1, filled, thick = 1) {
    [x0, z0, x1, z1] = S.norm(x0, z0, x1, z1);
    const out = [];
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const edge = Math.min(x - x0, x1 - x, z - z0, z1 - z);
      if (filled || edge < thick) out.push([x, z]);
    }
    return out;
  };

  // Ellipse inside the bounding box, sampled at cell centers (the usual pixel-circle look).
  S.ellipseMask = function (w, h) {
    const rx = w / 2, ry = h / 2, m = [];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const dx = (i + 0.5 - rx) / rx, dz = (j + 0.5 - ry) / ry;
      m.push(dx * dx + dz * dz <= 1.0 + (w <= 4 || h <= 4 ? 0.25 : 0.04));
    }
    return m;
  };
  S.ellipse = function (x0, z0, x1, z1, filled, thick = 1) {
    [x0, z0, x1, z1] = S.norm(x0, z0, x1, z1);
    const w = x1 - x0 + 1, h = z1 - z0 + 1;
    const m = S.ellipseMask(w, h);
    const inside = (i, j) => i >= 0 && j >= 0 && i < w && j < h && m[j * w + i];
    const out = [];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      if (!inside(i, j)) continue;
      if (filled) { out.push([x0 + i, z0 + j]); continue; }
      // distance (in cells, 4-neighbour steps) to the outside, capped by thickness
      let edge = false;
      for (let t = 1; t <= thick && !edge; t++)
        if (!inside(i + t, j) || !inside(i - t, j) || !inside(i, j + t) || !inside(i, j - t)) edge = true;
      if (edge) out.push([x0 + i, z0 + j]);
    }
    return out;
  };

  S.line = function (x0, z0, x1, z1, thick = 1) {
    const out = [], dx = Math.abs(x1 - x0), dz = -Math.abs(z1 - z0);
    const sx = x0 < x1 ? 1 : -1, sz = z0 < z1 ? 1 : -1;
    let err = dx + dz, x = x0, z = z0, guard = 0;
    while (guard++ < 2000) {
      out.push([x, z]);
      if (x === x1 && z === z1) break;
      const e2 = 2 * err;
      if (e2 >= dz) { err += dz; x += sx; }
      if (e2 <= dx) { err += dx; z += sz; }
    }
    if (thick > 1) {
      const set = new Map();
      const r = thick - 1;
      for (const [px, pz] of out) for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
        if (Math.abs(a) + Math.abs(b) > r) continue;
        set.set((px + a) + ',' + (pz + b), [px + a, pz + b]);
      }
      return [...set.values()];
    }
    return out;
  };

  // ---------- mirroring ----------
  BP.mirrorFacing = function (f, mx, mz) {
    if (!f) return f;
    if (mx && (f === 'e' || f === 'w')) f = BP.OPP[f];
    if (mz && (f === 'n' || f === 's')) f = BP.OPP[f];
    return f;
  };
  // returns list of [x, z, mirrorX, mirrorZ] variants for a point
  BP.mirrorPoints = function (x, z, sym, cx, cz) {
    const pts = [[x, z, false, false]];
    if (sym.x) pts.push([Math.round(2 * cx - x), z, true, false]);
    if (sym.z) pts.push([x, Math.round(2 * cz - z), false, true]);
    if (sym.x && sym.z) pts.push([Math.round(2 * cx - x), Math.round(2 * cz - z), true, true]);
    return pts;
  };

  BP.rotateFacingCW = (f, times = 1) => { for (let i = 0; i < times; i++) f = BP.CW[f] || f; return f; };

  // ---------- material counting ----------
  BP.countMaterials = function (cells) {
    const m = new Map();
    for (const c of cells) {
      if (!c) continue;
      const def = BP.BLOCK[c.b]; if (!def) continue;
      let name = def.name, key = c.b;
      if (c.s === 'slab' || c.s === 'slabT') { name += ' Slab'; key += ':slab'; }
      else if (c.s === 'stair' || c.s === 'stairT') { name += ' Stairs'; key += ':stair'; }
      const e = m.get(key) || { key, id: c.b, name, n: 0 };
      e.n++; m.set(key, e);
    }
    return [...m.values()].sort((a, b) => b.n - a.n);
  };
  BP.stacks = function (n) {
    const sh = Math.floor(n / 1728), st = Math.floor((n % 1728) / 64), r = n % 64;
    const parts = [];
    if (sh) parts.push(sh + ' shulker' + (sh > 1 ? 's' : ''));
    if (st) parts.push(st + ' stack' + (st > 1 ? 's' : ''));
    if (r || !parts.length) parts.push(r + '');
    return parts.join(' + ');
  };

  // ---------- roof generator ----------
  // opts: {x0,z0,x1,z1, y, type, axis:'x'|'z', pitch:'low'|'std'|'steep', overhang, mat, fill, trim, gableFill, solid}
  // returns array of [x,y,z,cell]
  BP.makeRoof = function (o) {
    const out = [];
    const put = (x, y, z, c) => out.push([x, y, z, c]);
    let [x0, z0, x1, z1] = BP.shapes.norm(o.x0, o.z0, o.x1, o.z1);
    const oh = o.overhang | 0;
    const fx0 = x0, fx1 = x1, fz0 = z0, fz1 = z1; // wall footprint
    x0 -= oh; z0 -= oh; x1 += oh; z1 += oh;
    const W = x1 - x0 + 1, D = z1 - z0 + 1;
    const mat = o.mat || 'oak_planks';
    const canShape = BP.BLOCK[mat] && BP.BLOCK[mat].shapes;
    const fillMat = o.fill || 'oak_planks';
    const trim = o.trim || null;
    const axis = o.axis === 'auto' || !o.axis ? (W >= D ? 'x' : 'z') : o.axis;
    const baseY = o.y - oh * (o.pitch === 'steep' ? 2 : o.pitch === 'low' ? 0.5 : 1);
    const full = (b) => ({ b, s: 'full' });

    if (o.type === 'dome' || o.type === 'cone') {
      const rx = W / 2, rz = D / 2, R = Math.max(rx, rz);
      const H = o.type === 'dome' ? Math.ceil(R) : Math.ceil(R * (o.pitch === 'steep' ? 2 : o.pitch === 'low' ? 0.6 : 1.2));
      const y0 = Math.round(o.y);
      for (let j = 0; j <= H; j++) {
        const t = j / H;
        const k = o.type === 'dome' ? Math.sqrt(Math.max(0, 1 - t * t)) : 1 - t;
        const ex = Math.max(0.5, rx * k), ez = Math.max(0.5, rz * k);
        const kn = o.type === 'dome' ? Math.sqrt(Math.max(0, 1 - ((j + 1) / H) ** 2)) : 1 - (j + 1) / H;
        const nx = rx * kn, nz = rz * kn;
        for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
          const dx = (x + 0.5 - x0 - rx), dz = (z + 0.5 - z0 - rz);
          const inNow = (dx / ex) ** 2 + (dz / ez) ** 2 <= 1.04;
          if (!inNow) continue;
          const inNext = j < H && nx > 0.4 && nz > 0.4 && (dx / nx) ** 2 + (dz / nz) ** 2 <= 1.04;
          if (!inNext || o.solid) put(x, y0 + j, z, full(inNext ? fillMat : mat));
        }
      }
      return out;
    }

    // distance field d(x,z): how many steps the roof has risen at that cell
    const dist = (x, z) => {
      const dx = Math.min(x - x0, x1 - x), dz = Math.min(z - z0, z1 - z);
      switch (o.type) {
        case 'gable': case 'gambrel': return axis === 'x' ? dz : dx;
        case 'shed': return axis === 'x' ? z - z0 : x - x0;
        case 'flat': return 0;
        default: return Math.min(dx, dz); // hip, pyramid
      }
    };
    const maxD = (() => { let m = 0; for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) m = Math.max(m, dist(x, z)); return m; })();
    const gambrelK = Math.max(1, Math.round(maxD / 3));
    // rise in half-blocks at step d
    const rise = (d) => {
      if (o.type === 'gambrel') return d < gambrelK ? d * 4 : gambrelK * 4 + (d - gambrelK) * 2;
      if (o.pitch === 'low') return d;
      if (o.pitch === 'steep') return d * 4;
      return d * 2;
    };
    const facingUp = (x, z) => {
      const d = dist(x, z);
      const cand = [['n', x, z - 1], ['s', x, z + 1], ['e', x + 1, z], ['w', x - 1, z]];
      const ok = (nx, nz) => nx >= x0 && nx <= x1 && nz >= z0 && nz <= z1 && dist(nx, nz) > d;
      for (const [f, nx, nz] of cand) if (ok(nx, nz)) return f;
      // hip corners: the higher neighbour is diagonal; Minecraft turns these into corner stairs
      for (const [ax, az] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) if (ok(x + ax, z + az)) return az > 0 ? 's' : 'n';
      return null;
    };

    if (o.type === 'flat') {
      const y = Math.round(o.y);
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        put(x, y, z, full(mat));
        const edge = x === x0 || x === x1 || z === z0 || z === z1;
        if (edge) put(x, y + 1, z, trim ? full(trim) : (canShape ? { b: mat, s: 'slab' } : full(mat)));
      }
      return out;
    }

    const yOf = (half) => baseY + half / 2; // float y in blocks
    const placed = new Map();
    const setP = (x, y, z, c) => { const k = x + ',' + y + ',' + z; placed.set(k, [x, y, z, c]); };

    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const d = dist(x, z), f = facingUp(x, z);
      const h0 = rise(d), h1 = f ? rise(d + 1) : h0 + 1;
      const step = h1 - h0; // 1 = slab, 2 = stair, 4 = steep
      const yb = yOf(h0);
      const isTop = !f;
      const edgeTrim = trim && (d === 0 || isTop);
      const m = edgeTrim ? trim : mat;
      const mShape = BP.BLOCK[m] && BP.BLOCK[m].shapes;
      if (!mShape) {
        // material without stairs/slabs: plain blocks stepping up
        setP(x, Math.floor(yb), z, full(m));
      } else if (isTop) {
        const yy = Math.floor(yb);
        setP(x, yy, z, (yb % 1) ? { b: m, s: 'slabT' } : (o.pitch === 'low' ? { b: m, s: 'slab' } : full(m)));
      } else if (step === 1) {
        const yy = Math.floor(yb);
        setP(x, yy, z, { b: m, s: (yb % 1) ? 'slabT' : 'slab' });
      } else if (step === 2) {
        setP(x, Math.floor(yb), z, { b: m, s: 'stair', f });
      } else {
        // steep: full block then stair on top
        setP(x, Math.floor(yb), z, full(m));
        setP(x, Math.floor(yb) + 1, z, { b: m, s: 'stair', f });
      }
      // gable end walls / solid fill under the roof surface (inside the wall footprint only)
      const inWalls = x >= fx0 && x <= fx1 && z >= fz0 && z <= fz1;
      const onEnd = (o.type === 'gable' || o.type === 'shed' || o.type === 'gambrel')
        ? (axis === 'x' ? (x === fx0 || x === fx1) : (z === fz0 || z === fz1)) : false;
      const shedSides = o.type === 'shed' && (axis === 'x' ? (x === fx0 || x === fx1) : (z === fz0 || z === fz1));
      if (inWalls && ((o.gableFill && (onEnd || shedSides)) || o.solid)) {
        for (let y = Math.round(o.y); y < Math.floor(yb); y++) setP(x, y, z, full(fillMat));
      }
    }
    for (const v of placed.values()) if (v[1] >= 0) out.push(v);
    return out;
  };

  // ---------- codec ----------
  BP.serialize = function (st) {
    const w = st.world, palette = [], pIdx = new Map(), blocks = [];
    for (const [x, y, z, c] of w.each()) {
      const k = BP.cellKey(c);
      let i = pIdx.get(k); if (i === undefined) { i = palette.length; palette.push(k); pIdx.set(k, i); }
      blocks.push(x, y, z, i);
    }
    return {
      app: 'blockwright', v: 1, name: st.name || 'Untitled build',
      size: [w.w, w.h, w.d], origin: st.origin || [0, 64, 0],
      palette, blocks, labels: st.labels || [], saved: Date.now(),
    };
  };
  BP.deserialize = function (data) {
    if (!data || data.app !== 'blockwright' || !Array.isArray(data.size)) throw new Error('This file is not a Blockwright design.');
    const [w, h, d] = data.size.map((n) => Math.max(4, Math.min(256, n | 0)));
    const world = new BP.World(w, h, d);
    const pal = (data.palette || []).map(BP.cellFromKey);
    const b = data.blocks || [];
    for (let i = 0; i + 3 < b.length + 0 && i < b.length; i += 4) {
      const c = pal[b[i + 3]];
      if (c && BP.BLOCK[c.b] && world.inside(b[i], b[i + 1], b[i + 2])) world.cells.set(world.key(b[i], b[i + 1], b[i + 2]), c);
    }
    return { world, name: data.name || 'Untitled build', origin: data.origin || [0, 64, 0], labels: data.labels || [] };
  };

  const b64u = {
    enc(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
    dec(str) { str = str.replace(/-/g, '+').replace(/_/g, '/'); while (str.length % 4) str += '='; const s = atob(str); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; },
  };
  async function pipe(bytes, stream) {
    const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
    return new Uint8Array(await res.arrayBuffer());
  }
  // Share codes: "BW1." + base64url(deflate(json)), or "BW0." + base64url(json) without CompressionStream
  BP.encodeShare = async function (obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    if (typeof CompressionStream !== 'undefined') {
      try { return 'BW1.' + b64u.enc(await pipe(bytes, new CompressionStream('deflate-raw'))); } catch (e) { /* fall through */ }
    }
    return 'BW0.' + b64u.enc(bytes);
  };
  BP.decodeShare = async function (code) {
    code = (code || '').trim().replace(/\s+/g, '');
    if (code.startsWith('{')) return JSON.parse(code);
    const m = code.match(/BW([01])\.([A-Za-z0-9_-]+)/);
    if (!m) throw new Error('That does not look like a share code. Codes start with BW1.');
    let bytes = b64u.dec(m[2]);
    if (m[1] === '1') {
      if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open compressed codes. Update the browser and try again.');
      bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  };
})();
