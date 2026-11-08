// Blockwright: simplified Java-Edition-style redstone simulator, plus redstone templates.
// Covers dust strength falloff, strong/weak powering, torches, repeaters (1-4 tick delay),
// comparators (compare/subtract), observers, levers, buttons, plates, lamps, pistons, doors.
// Not simulated: quasi-connectivity, block movement by pistons, update order quirks, containers.
(function () {
  const BP = window.BP;
  const D = BP.DIRS, OPP = BP.OPP;
  const H4 = ['n', 'e', 's', 'w'], ALL = ['n', 'e', 's', 'w', 'u', 'd'];

  class Sim {
    constructor() { this.reset(); }
    reset() {
      this.tick = 0;
      this.state = new Map();   // key -> component state {lit|out|level}
      this.pending = [];        // {t, k, apply()}
      this.dust = new Map();    // key -> level
      this.powered = new Map(); // key -> bool for lamps, pistons, doors, note blocks
      this.prevSig = new Map(); // observers: key of observed cell -> signature
      this.day = true;
      this.events = 0;
    }
    get w() { return BP.world; }
    at(x, y, z) { return this.w.get(x, y, z); }
    def(c) { return c && BP.BLOCK[c.b]; }
    rs(c) { const d = this.def(c); return d && d.rs; }
    key(x, y, z) { return this.w.key(x, y, z); }
    conductor(c) {
      const d = this.def(c);
      if (!d || d.form !== 'cube' || d.clear || !d.solid) return false;
      if (c.s && c.s !== 'full') return false;
      return !['piston', 'observer', 'block', 'container'].includes(d.rs);
    }
    attachedDir(c) { // direction from the component to the block it hangs on
      const f = c.f || 'u';
      return f === 'u' ? 'd' : OPP[f];
    }
    st(k, init) { let s = this.state.get(k); if (!s) { s = Object.assign({}, init); this.state.set(k, s); } return s; }

    // ---- power a component at p emits toward direction dir (0..15) ----
    emit(x, y, z, c, dir) {
      const rs = this.rs(c); if (!rs) return 0;
      const k = this.key(x, y, z);
      switch (rs) {
        case 'block': return 15;
        case 'lever': case 'button': case 'plate': return c.p && c.p.on ? 15 : 0;
        case 'daylight': return this.day ? 15 : 0;
        case 'torch': {
          if (!this.st(k, { lit: true }).lit) return 0;
          return dir === this.attachedDir(c) ? 0 : 15;
        }
        case 'repeater': return dir === c.f && this.st(k, { out: false }).out ? 15 : 0;
        case 'comparator': return dir === c.f ? this.st(k, { level: 0 }).level : 0;
        case 'observer': return dir === OPP[c.f || 'n'] && this.st(k, { out: false }).out ? 15 : 0;
        default: return 0;
      }
    }
    // strong power of a conductor block at p
    strong(x, y, z) {
      let best = 0;
      for (const d of ALL) {
        const v = D[d], nx = x + v[0], ny = y + v[1], nz = z + v[2];
        const c = this.at(nx, ny, nz); const rs = this.rs(c); if (!rs) continue;
        const toUs = OPP[d]; // direction from neighbour to us
        if (rs === 'repeater' || rs === 'comparator' || rs === 'observer') best = Math.max(best, this.emit(nx, ny, nz, c, toUs));
        else if (rs === 'torch' && d === 'd') best = Math.max(best, this.emit(nx, ny, nz, c, 'u'));
        else if ((rs === 'lever' || rs === 'button') && this.attachedDir(c) === toUs) best = Math.max(best, this.emit(nx, ny, nz, c, toUs));
        else if (rs === 'plate' && d === 'u') best = Math.max(best, this.emit(nx, ny, nz, c, 'd'));
      }
      return best;
    }
    // can dust at p visually/logically connect toward dir?
    dustLinks(x, y, z) {
      const links = [];
      const above = this.at(x, y + 1, z);
      const cutAbove = this.conductor(above);
      for (const d of H4) {
        const v = D[d], nx = x + v[0], nz = z + v[2];
        const n = this.at(nx, y, nz), nrs = this.rs(n);
        let ok = false;
        if (nrs === 'dust') ok = true;
        else if (nrs === 'repeater' && (n.f === d || n.f === OPP[d])) ok = true;
        else if (nrs === 'comparator' || nrs === 'torch' || nrs === 'lever' || nrs === 'button' || nrs === 'block' || nrs === 'target' || nrs === 'daylight' || nrs === 'plate') ok = true;
        else if (nrs === 'observer' && OPP[n.f] === OPP[d]) ok = true;
        if (!ok && !cutAbove && this.rs(this.at(nx, y + 1, nz)) === 'dust') ok = 'up';
        if (!ok && !this.conductor(n) && this.rs(this.at(nx, y - 1, nz)) === 'dust') ok = 'down';
        if (ok) links.push([d, ok]);
      }
      return links;
    }
    dustPoints(x, y, z) { // directions dust powers blocks horizontally
      const l = this.dustLinks(x, y, z).map((a) => a[0]);
      if (l.length === 0) return H4;
      if (l.length === 1) return [l[0], OPP[l[0]]];
      return l;
    }
    // compute dust network levels for the current component states
    solveDust() {
      const dust = new Map(), q = [];
      for (const [x, y, z, c] of this.w.each()) {
        if (this.rs(c) !== 'dust') continue;
        let lv = 0;
        for (const d of ALL) {
          const v = D[d], nx = x + v[0], ny = y + v[1], nz = z + v[2];
          const n = this.at(nx, ny, nz); if (!n) continue;
          if (this.conductor(n)) { if (d !== 'u') lv = Math.max(lv, this.strong(nx, ny, nz)); }
          else lv = Math.max(lv, this.emit(nx, ny, nz, n, OPP[d]));
        }
        const k = this.key(x, y, z);
        dust.set(k, lv);
        if (lv > 0) q.push([x, y, z, lv]);
      }
      q.sort((a, b) => b[3] - a[3]);
      while (q.length) {
        const [x, y, z, lv] = q.shift();
        if (lv <= 1) continue;
        if (dust.get(this.key(x, y, z)) > lv) continue;
        for (const [d, how] of this.dustLinks(x, y, z)) {
          const v = D[d], ny = y + (how === 'up' ? 1 : how === 'down' ? -1 : 0);
          const nx = x + v[0], nz = z + v[2];
          if (this.rs(this.at(nx, ny, nz)) !== 'dust') continue;
          const nk = this.key(nx, ny, nz);
          if ((dust.get(nk) || 0) < lv - 1) { dust.set(nk, lv - 1); q.push([nx, ny, nz, lv - 1]); }
        }
      }
      this.dust = dust;
    }
    // weak (any) power level of a conductor block
    weak(x, y, z) {
      let best = this.strong(x, y, z);
      const up = this.at(x, y + 1, z);
      if (this.rs(up) === 'dust') best = Math.max(best, this.dust.get(this.key(x, y + 1, z)) || 0);
      for (const d of H4) {
        const v = D[d], nx = x + v[0], nz = z + v[2];
        const n = this.at(nx, y, nz);
        if (this.rs(n) === 'dust' && this.dustPoints(nx, y, nz).includes(OPP[d])) best = Math.max(best, this.dust.get(this.key(nx, y, nz)) || 0);
      }
      return best;
    }
    // power arriving at position p from direction-neighbour d (used for component inputs)
    inputFrom(x, y, z, d) {
      const v = D[d], nx = x + v[0], ny = y + v[1], nz = z + v[2];
      const n = this.at(nx, ny, nz); if (!n) return 0;
      const toUs = OPP[d];
      if (this.conductor(n)) return this.weak(nx, ny, nz);
      if (this.rs(n) === 'dust') {
        if (d === 'd') return 0; // dust below does not power upward
        if (d === 'u' || this.dustPoints(nx, ny, nz).includes(toUs)) return this.dust.get(this.key(nx, ny, nz)) || 0;
        return 0;
      }
      return this.emit(nx, ny, nz, n, toUs);
    }
    anyInput(x, y, z, except) {
      let best = 0;
      for (const d of ALL) if (d !== except) best = Math.max(best, this.inputFrom(x, y, z, d));
      return best;
    }
    signature(c, k) {
      if (!c) return '';
      const s = this.state.get(k);
      return BP.cellKey(c) + (s ? JSON.stringify(s) : '') + (this.powered.get(k) ? '*' : '') + (this.dust.get(k) || '');
    }
    schedule(t, k, fn) {
      if (this.pending.some((p) => p.k === k && p.t > this.tick)) return;
      this.pending.push({ t, k, fn });
    }

    step() {
      const t = ++this.tick;
      // 1. apply due changes
      const due = this.pending.filter((p) => p.t <= t);
      this.pending = this.pending.filter((p) => p.t > t);
      for (const p of due) p.fn();
      // 2. dust
      this.solveDust();
      // 3. evaluate components
      const powered = new Map();
      for (const [x, y, z, c] of this.w.each()) {
        const rs = this.rs(c); if (!rs) continue;
        const k = this.key(x, y, z);
        switch (rs) {
          case 'torch': {
            const ad = this.attachedDir(c), v = D[ad];
            const ax = x + v[0], ay = y + v[1], az = z + v[2];
            const att = this.at(ax, ay, az);
            const on = this.conductor(att) ? this.weak(ax, ay, az) > 0 : this.rs(att) === 'block';
            const s = this.st(k, { lit: true });
            if (s.lit === on) this.schedule(t + 1, k, () => { s.lit = !on; });
            break;
          }
          case 'repeater': {
            const back = OPP[c.f || 'n'];
            const inp = this.inputFrom(x, y, z, back) > 0;
            const s = this.st(k, { out: false });
            const delay = (c.p && c.p.d) || 1;
            if (s.out !== inp) this.schedule(t + delay, k, () => { s.out = inp; });
            break;
          }
          case 'comparator': {
            const f = c.f || 'n', back = OPP[f];
            const side = Math.max(this.sideInput(x, y, z, BP.CW[f]), this.sideInput(x, y, z, OPP[BP.CW[f]]));
            const b = this.inputFrom(x, y, z, back);
            const sub = c.p && c.p.m === 's';
            const out = sub ? Math.max(0, b - side) : (b >= side ? b : 0);
            const s = this.st(k, { level: 0 });
            if (s.level !== out) this.schedule(t + 1, k, () => { s.level = out; });
            break;
          }
          case 'observer': {
            const v = D[c.f || 'n'], fx = x + v[0], fy = y + v[1], fz = z + v[2];
            const fk = this.w.inside(fx, fy, fz) ? this.key(fx, fy, fz) : -1;
            const sig = this.signature(this.at(fx, fy, fz), fk);
            const prev = this.prevSig.get(k);
            this.prevSig.set(k, sig);
            if (prev !== undefined && prev !== sig) this.pulseObserver(k);
            break;
          }
          case 'lamp': case 'note': case 'dispenser': case 'target':
            powered.set(k, this.weak(x, y, z) > 0 || this.anyInput(x, y, z) > 0); break;
          case 'piston': powered.set(k, this.anyInput(x, y, z, c.f || 'u') > 0); break;
          case 'door': case 'prail': powered.set(k, this.anyInput(x, y, z) > 0); break;
        }
      }
      this.powered = powered;
    }
    sideInput(x, y, z, d) {
      const v = D[d], n = this.at(x + v[0], y, z + v[2]); const rs = this.rs(n);
      if (rs === 'dust' || rs === 'repeater' || rs === 'comparator' || rs === 'block') return this.inputFrom(x, y, z, d);
      return 0;
    }
    pulseObserver(k) {
      const s = this.st(k, { out: false });
      if (s.out || this.pending.some((p) => p.k === k)) return;
      this.pending.push({ t: this.tick + 1, k, fn: () => { s.out = true; this.pending.push({ t: this.tick + 1, k, fn: () => { s.out = false; } }); } });
    }
    // run until nothing is scheduled (or a clock is detected)
    settle(max = 400) {
      let n = 0;
      do { this.step(); n++; } while (this.pending.length && n < max);
      return n >= max ? 'clock' : n;
    }

    // ---- interaction ----
    interact(x, y, z) {
      const c = this.at(x, y, z); const rs = this.rs(c); if (!rs) return null;
      const k = this.key(x, y, z);
      BP.history.begin('Toggle');
      let msg = null;
      if (rs === 'lever' || rs === 'plate') {
        const n = BP.cloneCell(c); n.p = Object.assign({}, n.p, { on: !(c.p && c.p.on) }); this.w.set(x, y, z, n);
        msg = (rs === 'lever' ? 'Lever ' : 'Plate ') + (n.p.on ? 'on' : 'off');
      } else if (rs === 'button') {
        const n = BP.cloneCell(c); n.p = Object.assign({}, n.p, { on: true }); this.w.set(x, y, z, n);
        this.pending.push({ t: this.tick + 10, k: -k - 1, fn: () => { const cur = this.at(x, y, z); if (cur && cur.p && cur.p.on) { const m = BP.cloneCell(cur); m.p.on = false; this.w.cells.set(k, m); this.w.version++; } } });
        msg = 'Button pressed (1 second)';
      } else if (rs === 'repeater') {
        const n = BP.cloneCell(c); const d = ((c.p && c.p.d) || 1) % 4 + 1; n.p = Object.assign({}, n.p, { d }); this.w.set(x, y, z, n);
        msg = `Repeater delay ${d} tick${d > 1 ? 's' : ''} (${(d / 10).toFixed(1)} s)`;
      } else if (rs === 'comparator') {
        const n = BP.cloneCell(c); const m = c.p && c.p.m === 's' ? 'c' : 's'; n.p = Object.assign({}, n.p, { m }); this.w.set(x, y, z, n);
        msg = m === 's' ? 'Comparator: subtract mode' : 'Comparator: compare mode';
      } else if (rs === 'observer') {
        this.pulseObserver(k); msg = 'Observer pulsed';
      } else if (rs === 'daylight') {
        this.day = !this.day; msg = this.day ? 'Daytime: sensors on' : 'Night: sensors off';
      } else if (rs === 'dust') {
        const lv = this.dust.get(k) || 0;
        msg = lv ? `Signal strength ${lv} of 15. It can travel ${lv - 1} more block${lv === 2 ? '' : 's'}.` : 'No signal here.';
      } else if (rs === 'torch') {
        msg = this.st(k, { lit: true }).lit ? 'Torch is on. Power the block it hangs on to turn it off.' : 'Torch is off because its block is powered.';
      }
      BP.history.commit();
      return msg;
    }

    // lit/active state for rendering
    look(x, y, z, c) {
      const k = this.key(x, y, z), rs = this.rs(c), s = this.state.get(k);
      switch (rs) {
        case 'dust': return { level: this.dust.get(k) || 0 };
        case 'torch': return { on: s ? s.lit : true };
        case 'repeater': case 'observer': return { on: !!(s && s.out) };
        case 'comparator': return { on: !!(s && s.level), level: s ? s.level : 0 };
        case 'lever': case 'button': case 'plate': return { on: !!(c.p && c.p.on) };
        case 'daylight': return { on: this.day };
        default: return { on: !!this.powered.get(k) };
      }
    }
  }
  BP.Sim = Sim;

  // ---------- templates (dx, dy, dz, block, shape, facing, props) ----------
  const T = (b, f, p) => ({ b, s: 'full', f, p });
  BP.TEMPLATES = [
    {
      id: 'not', name: 'NOT gate', note: 'Lever on turns the lamp off. The torch inverts the signal.',
      cells: [[0, 0, 0, T('lever', 'u', { on: false })], [1, 0, 0, T('redstone_dust')], [2, 0, 0, T('stone')], [3, 0, 0, T('redstone_torch', 'e')], [4, 0, 0, T('redstone_dust')], [5, 0, 0, T('redstone_dust')], [6, 0, 0, T('redstone_lamp')]],
    },
    {
      id: 'or', name: 'OR gate', note: 'Either lever lights the lamp.',
      cells: [[0, 0, 0, T('lever', 'u', { on: false })], [0, 0, 2, T('lever', 'u', { on: false })], [1, 0, 0, T('redstone_dust')], [1, 0, 1, T('redstone_dust')], [1, 0, 2, T('redstone_dust')], [2, 0, 1, T('redstone_dust')], [3, 0, 1, T('redstone_dust')], [4, 0, 1, T('redstone_lamp')]],
    },
    {
      id: 'and', name: 'AND gate', note: 'Both levers must be on to light the lamp. Uses two layers.',
      cells: [[0, 0, -1, T('lever', 'n', { on: false })], [2, 0, -1, T('lever', 'n', { on: false })],
        [0, 0, 0, T('stone')], [1, 0, 0, T('stone')], [2, 0, 0, T('stone')],
        [0, 1, 0, T('redstone_torch', 'u')], [1, 1, 0, T('redstone_dust')], [2, 1, 0, T('redstone_torch', 'u')],
        [1, 0, 1, T('redstone_torch', 's')], [1, 0, 2, T('redstone_dust')], [1, 0, 3, T('redstone_dust')], [1, 0, 4, T('redstone_lamp')]],
    },
    {
      id: 'clock', name: 'Repeater clock', note: 'Press the button to start it. Four repeaters at 4 ticks give a 1.6 s cycle.',
      cells: [[0, 0, 0, T('redstone_dust')], [1, 0, 0, T('repeater', 'e', { d: 4 })], [2, 0, 0, T('redstone_dust')],
        [2, 0, 1, T('repeater', 's', { d: 4 })], [2, 0, 2, T('redstone_dust')], [1, 0, 2, T('repeater', 'w', { d: 4 })],
        [0, 0, 2, T('redstone_dust')], [0, 0, 1, T('repeater', 'n', { d: 4 })], [3, 0, 0, T('stone_button', 'u')],
        [0, 0, 3, T('redstone_dust')], [0, 0, 4, T('redstone_lamp')]],
    },
    {
      id: 'observer', name: 'Observer clock', note: 'Tap an observer with the Hand tool to start the fastest clock in the game.',
      cells: [[0, 0, 0, T('observer', 'e')], [1, 0, 0, T('observer', 'w')], [-1, 0, 0, T('redstone_dust')], [-2, 0, 0, T('redstone_dust')], [-3, 0, 0, T('redstone_lamp')]],
    },
    {
      id: 'piston', name: 'Piston pair', note: 'Dust powers a stone block, and the block powers both pistons next to it.',
      cells: [[0, 0, 0, T('lever', 'u', { on: false })], [1, 0, 0, T('redstone_dust')], [2, 0, 0, T('redstone_dust')], [3, 0, 0, T('redstone_dust')],
        [4, 0, 0, T('stone')], [4, 0, 1, T('sticky_piston', 's')], [4, 0, -1, T('sticky_piston', 'n')]],
    },
    {
      id: 'line', name: 'Long signal line', note: 'Dust loses 1 strength per block, so it dies after 15. The repeater resets it to 15.',
      cells: (() => { const a = [[0, 0, 0, T('lever', 'u', { on: true })]]; for (let i = 1; i <= 15; i++) a.push([i, 0, 0, T('redstone_dust')]); a.push([16, 0, 0, T('repeater', 'e', { d: 1 })]); for (let i = 17; i <= 20; i++) a.push([i, 0, 0, T('redstone_dust')]); a.push([21, 0, 0, T('redstone_lamp')]); return a; })(),
    },
  ];
})();
