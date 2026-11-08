// Blockwright: top-down 2D plan view (canvas) with mouse, touch, Apple Pencil and gestures.
(function () {
  const BP = window.BP;
  const ROT = { n: 0, e: Math.PI / 2, s: Math.PI, w: -Math.PI / 2, u: 0, d: Math.PI };

  class View2D {
    constructor(canvas, app) {
      this.c = canvas; this.g = canvas.getContext('2d'); this.app = app;
      this.s = 22; this.ox = 40; this.oy = 40; this.dpr = 1;
      this.ptrs = new Map(); this.mode = null; this.dirty = true;
      this.topCache = { v: -1, layer: -1, map: null };
      this.readColors();
      this.bind();
      const loop = () => { if (this.dirty && this.c.offsetParent !== null) { this.dirty = false; this.draw(); } requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    }
    readColors() {
      const cs = getComputedStyle(document.documentElement);
      const v = (n) => cs.getPropertyValue(n).trim();
      this.col = { bg: v('--canvas'), plot: v('--plot'), grid: v('--grid'), grid5: v('--grid-strong'), chunk: v('--chunk'), ink: v('--ink'), dim: v('--ink-dim'), accent: v('--accent'), sel: v('--sel'), ruler: v('--ruler'), mirror: v('--mirror'), ghost: v('--ghost') };
      this.dirty = true;
    }
    resize() {
      const r = this.c.getBoundingClientRect();
      this.dpr = Math.min(3, window.devicePixelRatio || 1);
      this.c.width = Math.max(1, Math.round(r.width * this.dpr));
      this.c.height = Math.max(1, Math.round(r.height * this.dpr));
      this.W = r.width; this.H = r.height; this.dirty = true;
    }
    fit() {
      const w = BP.world; if (!this.W) this.resize();
      // fit the used area if there is one, else the whole plot
      let x0 = w.w, z0 = w.d, x1 = -1, z1 = -1;
      for (const [x, , z] of w.each()) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
      if (x1 < 0) { x0 = 0; z0 = 0; x1 = w.w - 1; z1 = w.d - 1; } else { x0 -= 3; z0 -= 3; x1 += 3; z1 += 3; }
      const pad = 34;
      this.s = Math.max(4, Math.min(64, Math.min((this.W - pad * 2) / (x1 - x0 + 1), (this.H - pad * 2) / (z1 - z0 + 1))));
      this.ox = (this.W - (x1 - x0 + 1) * this.s) / 2 - x0 * this.s + 10;
      this.oy = (this.H - (z1 - z0 + 1) * this.s) / 2 - z0 * this.s + 8;
      this.dirty = true;
    }
    zoomAt(f, px, py) {
      const ns = Math.max(3, Math.min(96, this.s * f));
      f = ns / this.s; this.s = ns;
      this.ox = px - (px - this.ox) * f; this.oy = py - (py - this.oy) * f; this.dirty = true;
    }
    cellAt(px, py) { return [Math.floor((px - this.ox) / this.s), Math.floor((py - this.oy) / this.s)]; }
    local(e) { const r = this.c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }

    // ---------- input ----------
    bind() {
      const c = this.c, app = this.app;
      c.addEventListener('contextmenu', (e) => e.preventDefault());
      c.addEventListener('pointerdown', (e) => this.down(e));
      c.addEventListener('pointermove', (e) => this.move(e));
      c.addEventListener('pointerup', (e) => this.up(e));
      c.addEventListener('pointercancel', (e) => this.up(e, true));
      c.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') { app.hover(null); } });
      c.addEventListener('wheel', (e) => {
        e.preventDefault();
        const [px, py] = this.local(e);
        if (e.ctrlKey || (!e.shiftKey && e.deltaX === 0 && Math.abs(e.deltaY) >= 40)) this.zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), px, py);
        else { this.ox -= e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX; this.oy -= e.shiftKey ? 0 : e.deltaY; this.dirty = true; }
      }, { passive: false });
      ['gesturestart', 'gesturechange'].forEach((n) => c.addEventListener(n, (e) => e.preventDefault()));
    }
    down(e) {
      const app = this.app;
      const [px, py] = this.local(e);
      try { this.c.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      this.ptrs.set(e.pointerId, { x: px, y: py, sx: px, sy: py, type: e.pointerType, t: performance.now() });
      if (e.pointerType === 'pen') app.penSeen();
      const touches = [...this.ptrs.values()].filter((p) => p.type === 'touch');

      if (e.pointerType === 'touch') {
        if (touches.length === 1) {
          this.tapStart = performance.now(); this.tapMoved = false; this.maxTouches = 1;
          if (app.fingerPans() || app.state.tool === 'pan') { this.mode = 'pan'; this.panFrom = [px, py, this.ox, this.oy]; }
          else { this.mode = 'tool'; this.strokeT = performance.now(); app.toolDown(this.cellAt(px, py), e, [px, py]); }
        } else {
          this.maxTouches = Math.max(this.maxTouches || 0, touches.length);
          if (this.mode === 'tool') app.toolCancel();
          this.mode = 'gesture'; this.startGesture();
        }
        return;
      }
      // mouse / pen
      const panBtn = e.button === 1 || e.button === 2 || app.spaceHeld || app.state.tool === 'pan';
      if (panBtn) { this.mode = 'pan'; this.panFrom = [px, py, this.ox, this.oy]; this.c.style.cursor = 'grabbing'; return; }
      if (e.button === 5) app.tempTool('erase'); // pen eraser end
      this.mode = 'tool';
      app.toolDown(this.cellAt(px, py), e, [px, py]);
    }
    startGesture() {
      const t = [...this.ptrs.values()].filter((p) => p.type === 'touch');
      if (t.length < 2) return;
      const [a, b] = t;
      this.g0 = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, s: this.s, ox: this.ox, oy: this.oy };
    }
    move(e) {
      const p = this.ptrs.get(e.pointerId);
      const [px, py] = this.local(e);
      if (!p) {
        if (e.pointerType !== 'touch') this.app.hover(this.cellAt(px, py), [px, py]);
        return;
      }
      p.x = px; p.y = py;
      if (Math.hypot(px - p.sx, py - p.sy) > 10) this.tapMoved = true;
      if (this.mode === 'pan') {
        this.ox = this.panFrom[2] + px - this.panFrom[0]; this.oy = this.panFrom[3] + py - this.panFrom[1]; this.dirty = true;
      } else if (this.mode === 'gesture') {
        const t = [...this.ptrs.values()].filter((q) => q.type === 'touch');
        if (t.length < 2 || !this.g0) return;
        const [a, b] = t, g0 = this.g0;
        const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const ns = Math.max(3, Math.min(96, g0.s * d / Math.max(1, g0.d))), f = ns / g0.s;
        this.s = ns;
        this.ox = mx - (g0.mx - g0.ox) * f; this.oy = my - (g0.my - g0.oy) * f; this.dirty = true;
      } else if (this.mode === 'tool') {
        const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
        for (const ce of evs.length ? evs : [e]) { const [cx, cy] = this.local(ce); this.app.toolMove(this.cellAt(cx, cy), ce, [cx, cy]); }
        if (e.pointerType !== 'touch') this.app.hover(this.cellAt(px, py), [px, py]);
      }
    }
    up(e, cancelled) {
      const p = this.ptrs.get(e.pointerId); if (!p) return;
      this.ptrs.delete(e.pointerId);
      const [px, py] = this.local(e);
      const left = [...this.ptrs.values()].filter((q) => q.type === 'touch').length;
      if (this.mode === 'tool') {
        if (cancelled) this.app.toolCancel(); else this.app.toolUp(this.cellAt(px, py), e, [px, py]);
        this.mode = null;
      } else if (this.mode === 'pan') {
        if (!this.ptrs.size) { if (this.fromGesture) this.endGesture(); this.fromGesture = false; this.mode = null; this.c.style.cursor = ''; }
        // a quick finger tap while fingers pan (Pencil mode) still selects blocks with the hand tool
        if (p.type === 'touch' && !this.tapMoved && performance.now() - this.tapStart < 300 && this.app.state.tool === 'hand') this.app.toolDown(this.cellAt(px, py), e, [px, py]), this.app.toolUp(this.cellAt(px, py), e, [px, py]);
      } else if (this.mode === 'gesture') {
        if (left === 1) { // lifting one finger of a pinch: continue as pan with the remaining finger
          const r = [...this.ptrs.values()][0]; this.mode = 'pan-wait'; this.fromGesture = true; this.panFrom = [r.x, r.y, this.ox, this.oy];
        }
        if (left === 0) this.endGesture();
      } else if (this.mode === 'pan-wait' && left === 0) this.endGesture();
      if (left === 1 && this.mode === 'pan-wait') this.mode = 'pan';
      if (!this.ptrs.size && this.mode !== 'tool') this.mode = null;
    }
    endGesture() {
      const quick = performance.now() - this.tapStart < 320 && !this.tapMoved;
      if (quick && this.maxTouches === 2) this.app.undo(true);
      if (quick && this.maxTouches === 3) this.app.redo(true);
      this.mode = null;
    }

    // ---------- drawing ----------
    topMap() {
      const st = this.app.state, w = BP.world, tc = this.topCache;
      if (tc.v === w.version && tc.layer === st.layer && tc.w === w.w) return tc.map;
      const map = new Map();
      for (const [x, y, z, c] of w.each()) {
        if (y >= st.layer || y < st.layer - 12) continue;
        const k = z * w.w + x, cur = map.get(k);
        if (!cur || cur[0] < y) map.set(k, [y, c]);
      }
      Object.assign(tc, { v: w.version, layer: st.layer, map, w: w.w });
      return map;
    }
    draw() {
      const g = this.g, st = this.app.state, w = BP.world, s = this.s, col = this.col;
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      g.imageSmoothingEnabled = false;
      g.fillStyle = col.bg; g.fillRect(0, 0, this.W, this.H);
      // visible cell range
      const vx0 = Math.max(0, Math.floor(-this.ox / s)), vz0 = Math.max(0, Math.floor(-this.oy / s));
      const vx1 = Math.min(w.w - 1, Math.ceil((this.W - this.ox) / s)), vz1 = Math.min(w.d - 1, Math.ceil((this.H - this.oy) / s));
      const X = (x) => this.ox + x * s, Z = (z) => this.oy + z * s;
      // plot
      g.fillStyle = col.plot; g.fillRect(X(0), Z(0), w.w * s, w.d * s);

      // ghost of blocks below
      if (st.showBelow) {
        const tm = this.topMap();
        for (let z = vz0; z <= vz1; z++) for (let x = vx0; x <= vx1; x++) {
          if (w.get(x, st.layer, z)) continue;
          const t = tm.get(z * w.w + x); if (!t) continue;
          const depth = st.layer - t[0];
          g.globalAlpha = Math.max(0.12, 0.5 - depth * 0.07);
          this.drawCell(t[1], X(x), Z(z), s, x, t[0], z, true);
        }
        g.globalAlpha = 1;
      }
      // current layer
      for (let z = vz0; z <= vz1; z++) for (let x = vx0; x <= vx1; x++) {
        const c = w.get(x, st.layer, z); if (c) this.drawCell(c, X(x), Z(z), s, x, st.layer, z, false);
      }
      // layer above outlines
      if (st.showAbove && st.layer + 1 < w.h) {
        g.strokeStyle = col.accent; g.lineWidth = 1; g.setLineDash([3, 3]); g.globalAlpha = 0.7;
        for (let z = vz0; z <= vz1; z++) for (let x = vx0; x <= vx1; x++) if (w.get(x, st.layer + 1, z)) g.strokeRect(X(x) + 2.5, Z(z) + 2.5, s - 5, s - 5);
        g.setLineDash([]); g.globalAlpha = 1;
      }
      // grid
      if (st.showGrid) this.drawGrid(vx0, vz0, vx1, vz1);
      // previews
      const pv = st.preview2d || st.preview;
      if (pv && pv.length) {
        const all = !!st.preview2d, pc = col.accent;
        g.lineWidth = Math.max(1, s / 14);
        for (const [x, y, z, c] of pv) {
          if (x < vx0 - 1 || x > vx1 + 1 || z < vz0 - 1 || z > vz1 + 1) continue;
          if (all || y === st.layer) {
            g.globalAlpha = all ? 0.85 : 0.75;
            if (c) this.drawCell(c, X(x), Z(z), s, x, y, z, false); else { g.fillStyle = 'rgba(220,40,30,.55)'; g.fillRect(X(x), Z(z), s, s); }
            g.globalAlpha = 1;
          }
          if (y === st.layer || !all) { g.strokeStyle = pc; g.strokeRect(X(x) + 0.5, Z(z) + 0.5, s - 1, s - 1); }
        }
      }
      // mirror lines
      if (st.sym.x || st.sym.z) {
        g.strokeStyle = col.mirror; g.lineWidth = 2; g.setLineDash([8, 5]);
        if (st.sym.x) { const xx = X(st.mirror[0] + 0.5); g.beginPath(); g.moveTo(xx, Z(0)); g.lineTo(xx, Z(w.d)); g.stroke(); }
        if (st.sym.z) { const zz = Z(st.mirror[1] + 0.5); g.beginPath(); g.moveTo(X(0), zz); g.lineTo(X(w.w), zz); g.stroke(); }
        g.setLineDash([]);
      }
      // selection
      if (st.sel) {
        const [a, b, c2, d] = BP.shapes.norm(st.sel.x0, st.sel.z0, st.sel.x1, st.sel.z1);
        g.fillStyle = col.sel + '22'; g.fillRect(X(a), Z(b), (c2 - a + 1) * s, (d - b + 1) * s);
        g.strokeStyle = col.sel; g.lineWidth = 2; g.setLineDash([6, 4]); g.lineDashOffset = -(performance.now() / 60) % 10;
        g.strokeRect(X(a) + 1, Z(b) + 1, (c2 - a + 1) * s - 2, (d - b + 1) * s - 2); g.setLineDash([]);
        this.dimLabel(`${c2 - a + 1} × ${d - b + 1}`, X(a) + (c2 - a + 1) * s / 2, Z(b) - 6, col.sel);
        this.dirty = true; // marching ants
      }
      // labels
      for (const L of st.labels || []) {
        if (L.y !== st.layer && !st.allLabels) continue;
        const lx = X(L.x + 0.5), ly = Z(L.z + 0.5);
        g.fillStyle = col.accent; g.beginPath(); g.arc(lx, ly, Math.max(3, s * 0.18), 0, 7); g.fill();
        this.tag(L.text, lx + 6, ly - 6, col.accent, L.y !== st.layer);
      }
      // measure
      if (st.measure) {
        const m = st.measure, ax = X(m[0] + 0.5), az = Z(m[1] + 0.5), bx = X(m[2] + 0.5), bz = Z(m[3] + 0.5);
        g.strokeStyle = col.sel; g.lineWidth = 2; g.beginPath(); g.moveTo(ax, az); g.lineTo(bx, bz); g.stroke();
        const dx = Math.abs(m[2] - m[0]) + 1, dz = Math.abs(m[3] - m[1]) + 1, e = Math.hypot(m[2] - m[0], m[3] - m[1]);
        this.dimLabel(`${dx} × ${dz} blocks · ${e.toFixed(1)} straight`, (ax + bx) / 2, (az + bz) / 2 - 10, col.sel);
      }
      // live dimension label for shapes
      if (st.dims) this.dimLabel(st.dims.text, X(st.dims.x), Z(st.dims.z) - 8, col.accent);
      // hover
      if (st.hover) {
        const [hx, hz] = st.hover;
        if (hx >= 0 && hz >= 0 && hx < w.w && hz < w.d) {
          g.strokeStyle = col.ink; g.lineWidth = 1.5; g.strokeRect(X(hx) + 0.75, Z(hz) + 0.75, s - 1.5, s - 1.5);
        }
      }
      this.drawRulers(vx0, vz0, vx1, vz1);
    }
    drawGrid(vx0, vz0, vx1, vz1) {
      const g = this.g, s = this.s, w = BP.world, col = this.col, st = this.app.state;
      const X = (x) => Math.round(this.ox + x * s) + 0.5, Z = (z) => Math.round(this.oy + z * s) + 0.5;
      const ox = st.origin[0], oz = st.origin[2];
      const lines = (strokeStyle, lw, test) => {
        g.strokeStyle = strokeStyle; g.lineWidth = lw; g.beginPath();
        for (let x = vx0; x <= vx1 + 1; x++) if (test(x + ox)) { g.moveTo(X(x), Z(Math.max(0, vz0))); g.lineTo(X(x), Z(Math.min(w.d, vz1 + 1))); }
        for (let z = vz0; z <= vz1 + 1; z++) if (test(z + oz)) { g.moveTo(X(Math.max(0, vx0)), Z(z)); g.lineTo(X(Math.min(w.w, vx1 + 1)), Z(z)); }
        g.stroke();
      };
      const mod = (a, n) => ((a % n) + n) % n;
      if (s >= 7) lines(col.grid, 1, (v) => mod(v, 5) !== 0 && mod(v, 16) !== 0);
      if (s >= 4) lines(col.grid5, 1, (v) => mod(v, 5) === 0 && mod(v, 16) !== 0);
      if (st.showChunks) lines(col.chunk, 1.5, (v) => mod(v, 16) === 0);
      g.strokeStyle = col.grid5; g.lineWidth = 1.5; g.strokeRect(X(0), Z(0), w.w * s, w.d * s);
    }
    drawRulers(vx0, vz0, vx1, vz1) {
      const g = this.g, s = this.s, col = this.col, st = this.app.state, w = BP.world;
      const R = 18;
      g.fillStyle = col.ruler; g.fillRect(0, 0, this.W, R); g.fillRect(0, 0, R + 8, this.H);
      g.fillStyle = col.dim; g.font = '600 10px ui-monospace, "JetBrains Mono", monospace'; g.textBaseline = 'middle';
      const step = s >= 26 ? 1 : s >= 12 ? 5 : s >= 6 ? 10 : 16;
      const ox = st.origin[0], oz = st.origin[2];
      g.textAlign = 'center';
      for (let x = vx0; x <= vx1; x++) {
        const v = x + ox; if (((v % step) + step) % step) continue;
        const px = this.ox + (x + 0.5) * s; if (px < R + 14) continue;
        g.fillStyle = st.hover && st.hover[0] === x ? col.accent : col.dim; g.fillText(v, px, R / 2 + 1);
      }
      g.save(); g.textAlign = 'right';
      for (let z = vz0; z <= vz1; z++) {
        const v = z + oz; if (((v % step) + step) % step) continue;
        const py = this.oy + (z + 0.5) * s; if (py < R + 6) continue;
        g.fillStyle = st.hover && st.hover[1] === z ? col.accent : col.dim; g.fillText(v, R + 5, py);
      }
      g.restore();
      g.fillStyle = col.accent; g.textAlign = 'center'; g.font = '700 10px ui-monospace, monospace';
      g.fillText('N', (R + 8) / 2, R / 2 + 1);
      void w;
    }
    tag(text, x, y, color, faded) {
      const g = this.g;
      g.font = '600 12px "Atkinson Hyperlegible", system-ui, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'left';
      const tw = g.measureText(text).width;
      g.globalAlpha = faded ? 0.5 : 1;
      g.fillStyle = this.col.ruler; g.fillRect(x, y - 9, tw + 10, 18);
      g.strokeStyle = color; g.lineWidth = 1; g.strokeRect(x + 0.5, y - 8.5, tw + 9, 17);
      g.fillStyle = this.col.ink; g.fillText(text, x + 5, y);
      g.globalAlpha = 1;
    }
    dimLabel(text, x, y, color) {
      const g = this.g;
      g.font = '700 12px ui-monospace, "JetBrains Mono", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const tw = g.measureText(text).width + 12;
      x = Math.max(tw / 2 + 4, Math.min(this.W - tw / 2 - 4, x)); y = Math.max(30, y);
      g.fillStyle = color; g.fillRect(x - tw / 2, y - 10, tw, 20);
      g.fillStyle = '#fff'; g.fillText(text, x, y + 0.5);
    }

    // draw one block's top-down symbol
    drawCell(c, x, y, s, wx, wy, wz, ghost) {
      const g = this.g, def = BP.BLOCK[c.b]; if (!def) return;
      const sim = this.app.state.power ? this.app.sim : null;
      const look = sim && def.rs ? sim.look(wx, wy, wz, c) : null;
      if (s < 5) { g.fillStyle = def.color || '#888'; g.fillRect(x, y, s, s); return; }
      const img = (k) => BP.IMG[k];
      const tile = (k, rot) => {
        const im = img(k); if (!im) { g.fillStyle = def.color || '#888'; g.fillRect(x, y, s, s); return; }
        if (rot) { g.save(); g.translate(x + s / 2, y + s / 2); g.rotate(rot); g.drawImage(im, -s / 2, -s / 2, s, s); g.restore(); }
        else g.drawImage(im, x, y, s, s);
      };
      const icon = (k, scale = 0.8, rot = 0, dx = 0, dy = 0) => {
        const im = img(k); if (!im) return; const w = s * scale;
        g.save(); g.translate(x + s / 2 + dx, y + s / 2 + dy); g.rotate(rot); g.drawImage(im, -w / 2, -w / 2, w, w); g.restore();
      };
      const wallOff = (f, amt) => { const v = BP.DIRS[BP.OPP[f]] || [0, 0, 0]; return [v[0] * s * amt, v[2] * s * amt]; };

      switch (def.form) {
        case 'cube': {
          let top = BP.faceTex(def, 'top');
          if (def.dir === 'all6' || def.dir === 'hopper') {
            if (c.f === 'u') top = BP.faceTex(def, 'front'); else if (c.f === 'd') top = BP.faceTex(def, 'back'); else top = BP.faceTex(def, 'side');
          }
          if (def.rs === 'lamp' && look && look.on) top = 'redstone_lamp_on';
          tile(top, def.dir === 'all6' && 'nesw'.includes(c.f) ? ROT[c.f] : 0);
          if (c.s === 'slab' || c.s === 'slabT') this.slabMark(x, y, s, c.s === 'slabT');
          if (c.s === 'stair' || c.s === 'stairT') this.stairMark(x, y, s, c.f || 'n', c.s === 'stairT');
          if (def.dir === 'h4' || ((def.dir === 'all6' || def.dir === 'hopper') && 'nesw'.includes(c.f))) this.arrow(x, y, s, c.f || 'n', def.rs === 'piston' && look && look.on);
          if (def.dir === 'all6' && (c.f === 'u' || c.f === 'd') && s >= 14) this.badge(x, y, s, c.f === 'u' ? '↑' : '↓');
          if (def.rs === 'container' && c.f === 'd' && s >= 14) this.badge(x, y, s, '↓');
          if (look && look.on && (def.rs === 'observer' || def.rs === 'note' || def.rs === 'dispenser' || def.rs === 'target')) this.glow(x, y, s);
          break;
        }
        case 'flat': {
          if (def.rs === 'dust') { this.drawDust(x, y, s, wx, wy, wz, look); break; }
          if (def.dir === 'h4') tile(BP.faceTex(def, 'top'), ROT[c.f || 'n']);
          else { g.save(); g.globalAlpha *= 0.95; const i = s * 0.06; const im = img(BP.faceTex(def, 'top')); if (im) g.drawImage(im, x + i, y + i, s - 2 * i, s - 2 * i); g.restore(); }
          if (look && look.on) this.glow(x, y, s);
          break;
        }
        case 'low': {
          tile(BP.faceTex(def, 'top'), ROT[c.f || 'n']);
          if (def.rs === 'repeater' && s >= 14) this.badge(x, y, s, String((c.p && c.p.d) || 1));
          if (def.rs === 'comparator' && s >= 14) this.badge(x, y, s, c.p && c.p.m === 's' ? '−' : '≥');
          if (look && look.on) this.glow(x, y, s);
          break;
        }
        case 'torch': case 'small': {
          const f = c.f || 'u';
          const [dx, dy] = f === 'u' ? [0, 0] : wallOff(f, 0.3);
          if (f !== 'u') { g.fillStyle = this.col.dim; const v = BP.DIRS[BP.OPP[f]]; g.fillRect(x + s / 2 + v[0] * s * 0.45 - (v[0] ? 1 : s * 0.25), y + s / 2 + v[2] * s * 0.45 - (v[2] ? 1 : s * 0.25), v[0] ? 2 : s * 0.5, v[2] ? 2 : s * 0.5); }
          const off = look && !look.on && def.rs === 'torch';
          g.save(); if (off) g.globalAlpha *= 0.45;
          icon(BP.faceTex(def, 'top'), def.form === 'torch' ? 0.8 : 0.7, 0, dx, dy);
          g.restore();
          if (look && look.on && def.rs !== 'torch') this.glow(x, y, s);
          if (look && look.on && def.rs === 'torch') { g.fillStyle = 'rgba(255,60,30,0.35)'; g.beginPath(); g.arc(x + s / 2 + dx, y + s * 0.35 + dy, s * 0.22, 0, 7); g.fill(); }
          break;
        }
        case 'post': case 'pane': {
          const im = img(BP.faceTex(def, 'top'));
          const th = def.form === 'post' ? 0.28 : 0.14;
          const links = this.paneLinks(wx, wy, wz, def.form);
          g.fillStyle = def.color || '#888';
          const pat = im ? g.createPattern(im, 'repeat') : null;
          if (pat) { const m = new DOMMatrix().translate(x, y).scale(s / 16); pat.setTransform(m); g.fillStyle = pat; }
          const t = s * th, cx = x + s / 2, cy = y + s / 2;
          g.fillRect(cx - t / 2, cy - t / 2, t, t);
          const arm = def.form === 'post' ? t * 0.55 : t;
          if (links.n) g.fillRect(cx - arm / 2, y, arm, s / 2);
          if (links.s) g.fillRect(cx - arm / 2, cy, arm, s / 2);
          if (links.w) g.fillRect(x, cy - arm / 2, s / 2, arm);
          if (links.e) g.fillRect(cx, cy - arm / 2, s / 2, arm);
          if (def.form === 'pane' && !links.n && !links.s && !links.e && !links.w) { g.fillRect(x, cy - arm / 2, s, arm); }
          g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1; g.strokeRect(cx - t / 2 + 0.5, cy - t / 2 + 0.5, t - 1, t - 1);
          break;
        }
        case 'panel': case 'door': {
          const f = c.f || 'n'; const v = BP.DIRS[BP.OPP[f]];
          const th = def.form === 'door' ? 0.2 : 0.14;
          const open = look && look.on;
          const im = img(BP.faceTex(def, 'top'));
          g.fillStyle = def.color || '#8a6234';
          let rx = x, ry = y, rw = s, rh = s;
          if (!open) {
            if (v[2] < 0) rh = s * th; else if (v[2] > 0) { ry = y + s * (1 - th); rh = s * th; }
            else if (v[0] < 0) rw = s * th; else { rx = x + s * (1 - th); rw = s * th; }
          } else {
            if (v[2] !== 0) { rw = s * th; ry = y; } else { rh = s * th; rx = x; }
          }
          if (im) { g.save(); g.beginPath(); g.rect(rx, ry, rw, rh); g.clip(); g.drawImage(im, x, y, s, s); g.restore(); } else g.fillRect(rx, ry, rw, rh);
          g.strokeStyle = 'rgba(0,0,0,.4)'; g.strokeRect(rx + 0.5, ry + 0.5, rw - 1, rh - 1);
          if (s >= 14 && def.form === 'door') this.arrow(x, y, s, f, false);
          break;
        }
        case 'trapdoor': {
          const open = look && look.on;
          if (open) { const f = c.f || 'n'; const v = BP.DIRS[BP.OPP[f]]; g.fillStyle = def.color; const t = s * 0.18; if (v[2]) g.fillRect(x, v[2] < 0 ? y : y + s - t, s, t); else g.fillRect(v[0] < 0 ? x : x + s - t, y, t, s); }
          else { tile(BP.faceTex(def, 'top')); this.slabMark(x, y, s, false); }
          break;
        }
      }
      if (ghost) return;
    }
    paneLinks(x, y, z, form) {
      const out = {};
      for (const d of ['n', 'e', 's', 'w']) {
        const v = BP.DIRS[d], n = BP.world.get(x + v[0], y, z + v[2]);
        if (!n) continue; const nd = BP.BLOCK[n.b];
        out[d] = nd && (nd.form === form || (nd.form === 'cube' && !nd.clear) || (form === 'pane' && nd.form === 'pane'));
      }
      return out;
    }
    slabMark(x, y, s, top) {
      const g = this.g;
      g.fillStyle = 'rgba(0,0,0,0.28)';
      g.beginPath(); g.moveTo(x, y + s); g.lineTo(x + s, y + s); g.lineTo(x + s, y); g.closePath(); if (!top) g.fill();
      if (top) { g.fillStyle = 'rgba(255,255,255,0.22)'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + s, y); g.lineTo(x, y + s); g.closePath(); g.fill(); }
      if (s >= 16) { g.fillStyle = '#fff'; g.font = `700 ${Math.round(s * 0.32)}px ui-monospace, monospace`; g.textAlign = 'right'; g.textBaseline = 'bottom'; g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 2.5; const t = top ? '▔' : '½'; g.strokeText(t, x + s - 2, y + s - 1); g.fillText(t, x + s - 2, y + s - 1); }
    }
    stairMark(x, y, s, f, upside) {
      const g = this.g, v = BP.DIRS[f];
      // darken the low half (opposite the facing), draw a chevron pointing uphill
      g.fillStyle = upside ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.32)';
      if (v[2] < 0) g.fillRect(x, y + s / 2, s, s / 2); else if (v[2] > 0) g.fillRect(x, y, s, s / 2);
      else if (v[0] > 0) g.fillRect(x, y, s / 2, s); else g.fillRect(x + s / 2, y, s / 2, s);
      if (s >= 12) {
        g.save(); g.translate(x + s / 2, y + s / 2); g.rotate(ROT[f]);
        g.strokeStyle = '#fff'; g.lineWidth = Math.max(1.5, s / 12); g.lineCap = 'round'; g.lineJoin = 'round';
        g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 2;
        g.beginPath(); g.moveTo(-s * 0.2, s * 0.08); g.lineTo(0, -s * 0.14); g.lineTo(s * 0.2, s * 0.08); g.stroke();
        if (upside) { g.setLineDash([2, 2]); g.strokeRect(-s * 0.36, -s * 0.36, s * 0.72, s * 0.72); }
        g.restore();
      }
    }
    arrow(x, y, s, f, hot) {
      if (s < 12) return;
      const g = this.g;
      g.save(); g.translate(x + s / 2, y + s / 2); g.rotate(ROT[f] || 0);
      g.fillStyle = hot ? '#ff5a3c' : 'rgba(255,255,255,0.9)'; g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(0, -s * 0.46); g.lineTo(s * 0.16, -s * 0.28); g.lineTo(-s * 0.16, -s * 0.28); g.closePath(); g.fill(); g.stroke();
      if (hot) { g.fillRect(-s * 0.4, -s * 0.5, s * 0.8, s * 0.1); }
      g.restore();
    }
    badge(x, y, s, t) {
      const g = this.g, r = Math.max(6, s * 0.2);
      g.fillStyle = 'rgba(0,0,0,0.7)'; g.beginPath(); g.arc(x + s - r - 1, y + r + 1, r, 0, 7); g.fill();
      g.fillStyle = '#fff'; g.font = `700 ${Math.round(r * 1.3)}px ui-monospace, monospace`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(t, x + s - r - 1, y + r + 1.5);
    }
    glow(x, y, s) {
      const g = this.g;
      g.save(); g.strokeStyle = 'rgba(255,70,40,0.95)'; g.lineWidth = Math.max(2, s / 9); g.shadowColor = '#ff3b1f'; g.shadowBlur = 8;
      g.strokeRect(x + 2, y + 2, s - 4, s - 4); g.restore();
    }
    drawDust(x, y, s, wx, wy, wz, look) {
      const g = this.g, sim = this.app.sim;
      const links = sim.dustLinks(wx, wy, wz);
      const lv = look ? look.level : -1;
      const t = lv < 0 ? 0.65 : lv / 15;
      const col = `rgb(${Math.round(90 + 165 * t)},${Math.round(10 + 40 * t * t)},${Math.round(8 + 20 * t * t)})`;
      const w = Math.max(2, s * 0.2), cx = x + s / 2, cy = y + s / 2;
      g.strokeStyle = col; g.fillStyle = col; g.lineCap = 'butt'; g.lineWidth = w;
      g.beginPath();
      const dirs = links.map((l) => l[0]);
      const draw = dirs.length === 1 ? [dirs[0], BP.OPP[dirs[0]]] : dirs;
      for (const d of draw) { const v = BP.DIRS[d]; g.moveTo(cx, cy); g.lineTo(cx + v[0] * s / 2, cy + v[2] * s / 2); }
      g.stroke();
      g.beginPath(); g.arc(cx, cy, w * (dirs.length ? 0.8 : 1.3), 0, 7); g.fill();
      if (dirs.length === 0) { g.lineWidth = Math.max(1, w / 2); g.beginPath(); for (const d of ['n', 'e', 's', 'w']) { const v = BP.DIRS[d]; g.moveTo(cx + v[0] * w * 1.4, cy + v[2] * w * 1.4); g.lineTo(cx + v[0] * s * 0.36, cy + v[2] * s * 0.36); } g.stroke(); }
      for (const [d, how] of links) if (how !== true && s >= 14) {
        const v = BP.DIRS[d]; g.fillStyle = '#fff'; g.font = `700 ${Math.round(s * 0.28)}px ui-monospace, monospace`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(how === 'up' ? '↑' : '↓', cx + v[0] * s * 0.33, cy + v[2] * s * 0.33);
      }
      if (lv >= 0 && s >= 18) {
        g.font = `700 ${Math.round(s * 0.34)}px ui-monospace, monospace`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.75)'; g.strokeText(lv, cx + s * 0.22, cy - s * 0.22);
        g.fillStyle = lv ? '#fff' : '#ff9b8a'; g.fillText(lv, cx + s * 0.22, cy - s * 0.22);
      }
    }
  }
  BP.View2D = View2D;
})();
