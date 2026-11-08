// Blockwright: 3D view built on three.js (r128) with instanced, textured block parts.
(function () {
  const BP = window.BP;
  const P = (a) => a / 16;

  class View3D {
    constructor(host, app) {
      this.host = host; this.app = app; this.ok = !!window.THREE;
      if (!this.ok) { host.innerHTML = '<p class="empty3d">3D view needs WebGL and the three.js library, which did not load. The 2D plan still works.</p>'; return; }
      const T = window.THREE;
      this.T = T;
      this.scene = new T.Scene();
      this.camera = new T.PerspectiveCamera(50, 1, 0.1, 2000);
      try {
        this.renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      } catch (e) { this.ok = false; host.innerHTML = '<p class="empty3d">This device could not start WebGL, so the 3D view is off. The 2D plan still works.</p>'; return; }
      this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      host.appendChild(this.renderer.domElement);
      this.renderer.domElement.className = 'gl';
      this.controls = new T.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true; this.controls.dampingFactor = 0.12;
      this.controls.screenSpacePanning = true;
      this.controls.maxPolarAngle = Math.PI * 0.495;
      this.controls.touches = { ONE: T.TOUCH.ROTATE, TWO: T.TOUCH.DOLLY_PAN };
      this.hemi = new T.HemisphereLight(0xffffff, 0x8a7f6a, 0.75); this.scene.add(this.hemi);
      this.sun = new T.DirectionalLight(0xffffff, 0.6); this.sun.position.set(0.6, 1, 0.35); this.scene.add(this.sun);
      this.root = new T.Group(); this.scene.add(this.root);
      this.helpers = new T.Group(); this.scene.add(this.helpers);
      this.texCache = new Map(); this.matCache = new Map(); this.geoCache = new Map();
      this.built = -1; this.dirty = true; this.cut = false;
      this.raycaster = new T.Raycaster();
      this.bindPick();
      this.applyTheme();
      const loop = () => {
        requestAnimationFrame(loop);
        if (!this.visible()) return;
        const st = this.app.state;
        const sig = BP.world.version + ':' + (this.cut ? st.layer : -1) + ':' + (st.power ? this.app.sim.tick : 0) + ':' + (st.preview ? st.preview.length + ':' + st.previewSig : 0) + ':' + st.layer;
        if (sig !== this.built) { this.built = sig; this.rebuild(); }
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
      };
      requestAnimationFrame(loop);
    }
    visible() { return this.host.offsetParent !== null && this.host.clientWidth > 0; }
    applyTheme() {
      if (!this.ok) return;
      const cs = getComputedStyle(document.documentElement);
      const bg = cs.getPropertyValue('--sky').trim() || '#9cc3e6';
      this.scene.background = new this.T.Color(bg);
      this.built = -1;
    }
    resize() {
      if (!this.ok) return;
      const w = this.host.clientWidth, h = this.host.clientHeight;
      if (!w || !h) return;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    }
    preset(kind) {
      if (!this.ok) return;
      const w = BP.world;
      let x0 = w.w, z0 = w.d, x1 = 0, z1 = 0, y1 = 1;
      for (const [x, y, z] of w.each()) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x + 1); z1 = Math.max(z1, z + 1); y1 = Math.max(y1, y + 1); }
      if (x1 <= x0) { x0 = 0; z0 = 0; x1 = w.w; z1 = w.d; }
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, cy = y1 / 3;
      const r = Math.max(x1 - x0, z1 - z0, y1) * 1.25 + 6;
      this.controls.target.set(cx, cy, cz);
      const p = { iso: [r * 0.75, r * 0.7, r * 0.85], top: [0.01, r * 1.4, 0.01], front: [0, r * 0.25, r * 1.2], side: [r * 1.2, r * 0.25, 0] }[kind] || [r, r, r];
      this.camera.position.set(cx + p[0], cy + p[1], cz + p[2]);
      this.camera.lookAt(cx, cy, cz);
    }

    // ---------- textures and materials ----------
    tex(key, rot = 0) {
      const ck = key + '@' + rot;
      if (this.texCache.has(ck)) return this.texCache.get(ck);
      const T = this.T, im = BP.IMG[key];
      const t = new T.Texture(im || undefined);
      t.magFilter = T.NearestFilter; t.minFilter = T.NearestFilter; t.generateMipmaps = false;
      t.center.set(0.5, 0.5); t.rotation = rot;
      if (im) t.needsUpdate = true;
      this.texCache.set(ck, t); return t;
    }
    canvasTex(key, draw) {
      if (this.texCache.has(key)) return this.texCache.get(key);
      const c = document.createElement('canvas'); c.width = c.height = 32; draw(c.getContext('2d'));
      const T = this.T, t = new T.CanvasTexture(c);
      t.magFilter = T.NearestFilter; t.minFilter = T.NearestFilter; t.generateMipmaps = false;
      this.texCache.set(key, t); return t;
    }
    mat(key, opts = {}) {
      const mk = key + JSON.stringify(opts);
      if (this.matCache.has(mk)) return this.matCache.get(mk);
      const T = this.T;
      const m = new T.MeshLambertMaterial({
        map: opts.map || this.tex(key, opts.rot || 0), transparent: !!opts.clear, alphaTest: opts.clear ? 0.1 : 0,
        opacity: opts.opacity == null ? 1 : opts.opacity, depthWrite: opts.opacity == null || opts.opacity >= 1,
        color: opts.tint || 0xffffff,
      });
      if (opts.glow) { m.emissive = new T.Color(opts.glow); }
      this.matCache.set(mk, m); return m;
    }
    // face order for BoxGeometry: +x, -x, +y, -y, +z, -z
    faceMats(def, c, look, extra = {}) {
      const f = c.f || 'n';
      let top = BP.faceTex(def, 'top'), bottom = BP.faceTex(def, 'bottom'), side = BP.faceTex(def, 'side');
      const faces = [side, side, top, bottom, side, side];
      const idx = { e: 0, w: 1, u: 2, d: 3, s: 4, n: 5 };
      if (def.dir === 'h4' && def.form === 'cube' && def.tex.front) faces[idx[f]] = def.tex.front;
      if (def.dir === 'all6') { faces[idx[f]] = BP.faceTex(def, 'front'); faces[idx[BP.OPP[f]]] = BP.faceTex(def, 'back'); if (f === 'u' || f === 'd') { faces[0] = faces[1] = faces[4] = faces[5] = BP.faceTex(def, 'side'); } }
      if (def.rs === 'lamp' && look && look.on) faces.fill('redstone_lamp_on');
      const rot = { n: 0, e: -Math.PI / 2, s: Math.PI, w: Math.PI / 2 }[f] || 0;
      const o = { clear: def.clear, opacity: extra.opacity };
      if (def.id === 'water') o.opacity = Math.min(o.opacity || 1, 0.7);
      if (def.id === 'glass' || def.id === 'ice') o.clear = true;
      return faces.map((k, i) => {
        const oo = Object.assign({}, o);
        if (i === 2 && (def.form === 'low' || (def.form === 'flat' && def.dir === 'h4'))) oo.rot = rot;
        if (look && look.on && (def.rs === 'lamp' || def.rs === 'block')) oo.glow = 0x552200;
        if (look && look.on && def.rs === 'repeater' && i === 2) oo.glow = 0x401010;
        return this.mat(k, oo);
      });
    }
    // geometry for an axis-aligned part [x0,y0,z0,x1,y1,z1] in cell units, UVs cropped to match
    geo(b) {
      const k = b.map((v) => v.toFixed(4)).join(',');
      if (this.geoCache.has(k)) return this.geoCache.get(k);
      const T = this.T;
      const [x0, y0, z0, x1, y1, z1] = b;
      const g = new T.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
      g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
      const fr = (v) => v - Math.floor(v + 1e-6) + (v % 1 === 0 && v > 0 ? 0 : 0);
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), nx = nor.getX(i), ny = nor.getY(i), nz = nor.getZ(i);
        const cx = Math.min(1, Math.max(0, x)), cy = Math.min(1, Math.max(0, y)), cz = Math.min(1, Math.max(0, z));
        let u, v;
        if (Math.abs(nx) > 0.5) { u = nx > 0 ? 1 - cz : cz; v = cy; }
        else if (Math.abs(ny) > 0.5) { u = cx; v = ny > 0 ? 1 - cz : cz; }
        else { u = nz > 0 ? cx : 1 - cx; v = cy; }
        uv.setXY(i, u, v);
      }
      void fr;
      this.geoCache.set(k, g); return g;
    }
    parts(def, c, x, y, z, look) {
      const f = c.f || 'n', s = c.s || 'full';
      const box = (a) => [a];
      const along = (d, a0, a1) => { // half/strip toward direction d
        switch (d) { case 'n': return [0, 0, a0, 1, 1, a1]; case 's': return [0, 0, 1 - a1, 1, 1, 1 - a0]; case 'w': return [a0, 0, 0, a1, 1, 1]; default: return [1 - a1, 0, 0, 1 - a0, 1, 1]; }
      };
      const withY = (b, y0, y1) => [b[0], y0, b[2], b[3], y1, b[5]];
      switch (def.form) {
        case 'cube': {
          if (s === 'slab') return box([0, 0, 0, 1, 0.5, 1]);
          if (s === 'slabT') return box([0, 0.5, 0, 1, 1, 1]);
          if (s === 'stair') return [[0, 0, 0, 1, 0.5, 1], withY(along(f, 0, 0.5), 0.5, 1)];
          if (s === 'stairT') return [[0, 0.5, 0, 1, 1, 1], withY(along(f, 0, 0.5), 0, 0.5)];
          if (def.rs === 'piston' && look && look.on && 'nesw'.includes(f)) {
            const base = along(BP.OPP[f], 0, 0.75); const head = along(f, -1, -0.75); const arm = along(f, -0.75, 0);
            const narrow = (b) => { const m = f === 'n' || f === 's' ? [0.375, 0.375, 0, 0.625, 0.625, 1] : [0, 0.375, 0.375, 1, 0.625, 0.625]; return f === 'n' || f === 's' ? [m[0], m[1], b[2], m[3], m[4], b[5]] : [b[0], m[1], m[2], b[3], m[4], m[5]]; };
            return [base, head, narrow(arm)];
          }
          if (def.id === 'hopper') return [[0, 0.625, 0, 1, 1, 1], [0.25, 0.25, 0.25, 0.75, 0.625, 0.75], [0.375, 0, 0.375, 0.625, 0.25, 0.625]];
          return box([0, 0, 0, 1, 1, 1]);
        }
        case 'flat': return box([0, 0, 0, 1, P(1), 1]);
        case 'low': return box([0, 0, 0, 1, def.rs === 'daylight' ? P(6) : P(2), 1]);
        case 'torch': {
          if (f === 'u') return box([P(7), 0, P(7), P(9), P(10), P(9)]);
          const v = BP.DIRS[BP.OPP[f]];
          const cx = 0.5 + v[0] * 0.34, cz = 0.5 + v[2] * 0.34;
          return box([cx - P(1), P(3), cz - P(1), cx + P(1), P(13), cz + P(1)]);
        }
        case 'small': {
          const isBtn = def.rs === 'button';
          if (f === 'u') return isBtn ? box([P(5), 0, P(6), P(11), P(2), P(10)]) : [[P(5), 0, P(4), P(11), P(3), P(12)], [P(7), P(3), P(7), P(9), P(10), P(9)]];
          const b = along(BP.OPP[f], 0, isBtn ? P(2) : P(3));
          const sh = f === 'n' || f === 's' ? [P(5), P(6), b[2], P(11), P(10), b[5]] : [b[0], P(6), P(5), b[3], P(10), P(11)];
          if (isBtn) return box(sh);
          const stick = along(BP.OPP[f], P(3), P(9));
          return [f === 'n' || f === 's' ? [P(5), P(4), b[2], P(11), P(12), b[5]] : [b[0], P(4), P(5), b[3], P(12), P(11)],
            f === 'n' || f === 's' ? [P(7), P(7), stick[2], P(9), P(9), stick[5]] : [stick[0], P(7), P(7), stick[3], P(9), P(9)]];
        }
        case 'post': case 'pane': {
          const isPost = def.form === 'post';
          const t = isPost ? P(2) : P(1);
          const out = [[0.5 - t, 0, 0.5 - t, 0.5 + t, 1, 0.5 + t]];
          const links = this.app.v2d.paneLinks(x, y, z, def.form);
          const any = links.n || links.s || links.e || links.w;
          const armY = isPost ? [[P(6), P(9)], [P(12), P(15)]] : [[0, 1]];
          const at = isPost ? P(1) : P(1);
          for (const [a0, a1] of armY) {
            if (links.n) out.push([0.5 - at, a0, 0, 0.5 + at, a1, 0.5 - t]);
            if (links.s) out.push([0.5 - at, a0, 0.5 + t, 0.5 + at, a1, 1]);
            if (links.w) out.push([0, a0, 0.5 - at, 0.5 - t, a1, 0.5 + at]);
            if (links.e) out.push([0.5 + t, a0, 0.5 - at, 1, a1, 0.5 + at]);
            if (!isPost && !any) out.push([0, a0, 0.5 - at, 1, a1, 0.5 + at]);
          }
          return out;
        }
        case 'panel': return box(along(BP.OPP[f], 0, P(1)));
        case 'door': {
          const open = look && look.on;
          return box(open ? along(BP.CW[f], 0, P(3)) : along(BP.OPP[f], 0, P(3)));
        }
        case 'trapdoor': {
          const open = look && look.on;
          return box(open ? along(BP.OPP[f], 0, P(3)) : [0, 0, 0, 1, P(3), 1]);
        }
      }
      return box([0, 0, 0, 1, 1, 1]);
    }
    dustMat(x, y, z, look) {
      const links = this.app.sim.dustLinks(x, y, z).map((l) => l[0]);
      const lv = look ? look.level : 9;
      const key = 'dust:' + links.sort().join('') + ':' + lv;
      const tex = this.canvasTex(key, (g) => {
        const t = lv / 15, col = `rgb(${90 + 165 * t | 0},${10 + 40 * t * t | 0},${8 + 20 * t * t | 0})`;
        g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 7;
        const d = links.length === 1 ? [links[0], BP.OPP[links[0]]] : links;
        g.beginPath();
        for (const k of d) { const v = BP.DIRS[k]; g.moveTo(16, 16); g.lineTo(16 + v[0] * 16, 16 + v[2] * 16); }
        g.stroke(); g.beginPath(); g.arc(16, 16, links.length ? 5 : 8, 0, 7); g.fill();
      });
      return this.mat(key, { map: tex, clear: true });
    }

    rebuild() {
      const T = this.T, st = this.app.state, w = BP.world;
      for (const ch of [...this.root.children]) { this.root.remove(ch); if (ch.isInstancedMesh) ch.dispose(); }
      for (const ch of [...this.helpers.children]) this.helpers.remove(ch);
      // ground plot
      const plotMat = new T.MeshLambertMaterial({ color: getComputedStyle(document.documentElement).getPropertyValue('--ground').trim() || '#6f8f4e' });
      const ground = new T.Mesh(new T.BoxGeometry(w.w, 0.2, w.d), plotMat);
      ground.position.set(w.w / 2, -0.1, w.d / 2); ground.userData.ground = true; this.helpers.add(ground);
      const grid = new T.GridHelper(Math.max(w.w, w.d), Math.max(w.w, w.d), 0x000000, 0x000000);
      grid.material.opacity = 0.14; grid.material.transparent = true;
      grid.position.set(Math.max(w.w, w.d) / 2, 0.01, Math.max(w.w, w.d) / 2);
      if (w.w === w.d) this.helpers.add(grid);
      // current layer plane
      const lp = new T.Mesh(new T.PlaneGeometry(w.w, w.d), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, depthWrite: false, side: T.DoubleSide }));
      lp.rotation.x = -Math.PI / 2; lp.position.set(w.w / 2, st.layer + 0.002, w.d / 2); this.helpers.add(lp);
      const edge = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(w.w, 0.001, w.d)), new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
      edge.position.set(w.w / 2, st.layer, w.d / 2); this.helpers.add(edge);

      const groups = new Map();
      const push = (geoB, mats, mk, x, y, z) => {
        const k = mk + '|' + geoB.join(',');
        let g = groups.get(k); if (!g) { g = { b: geoB, mats, list: [] }; groups.set(k, g); }
        g.list.push([x, y, z]);
      };
      const cutY = this.cut ? st.layer : Infinity;
      const add = (x, y, z, c, ghost) => {
        const def = BP.BLOCK[c.b]; if (!def) return;
        const look = st.power && def.rs ? this.app.sim.look(x, y, z, c) : null;
        let mats, mk;
        if (def.rs === 'dust') { const m = this.dustMat(x, y, z, look); mats = [m, m, m, m, m, m]; mk = m.uuid; }
        else {
          const extra = ghost ? { opacity: 0.45 } : {};
          mats = this.faceMats(def, c, look, extra);
          mk = mats.map((m) => m.uuid).join('');
        }
        for (const b of this.parts(def, c, x, y, z, look)) push(b, mats, mk, x, y, z);
      };
      for (const [x, y, z, c] of w.each()) if (y <= cutY) add(x, y, z, c, false);
      if (st.preview) for (const [x, y, z, c] of st.preview) if (c) add(x, y, z, c, true);

      const m4 = new T.Matrix4();
      this.pick = [];
      for (const g of groups.values()) {
        const mesh = new T.InstancedMesh(this.geo(g.b), g.mats, g.list.length);
        g.list.forEach(([x, y, z], i) => { m4.makeTranslation(x, y, z); mesh.setMatrixAt(i, m4); });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.userData.cells = g.list;
        mesh.renderOrder = g.mats[0].transparent ? 1 : 0;
        this.root.add(mesh);
      }
      if (this.firstBuild !== false) { this.firstBuild = false; this.preset('iso'); }
    }

    // ---------- picking ----------
    bindPick() {
      const el = this.renderer.domElement;
      let down = null;
      el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now(), n: (down && performance.now() - down.t < 50 ? 2 : 1) }; if (e.pointerType === 'pen') this.app.penSeen(); });
      el.addEventListener('pointerup', (e) => {
        if (!down) return;
        const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
        if (moved < 7 && performance.now() - down.t < 450 && e.button === 0 && e.isPrimary) this.tap(e);
        down = null;
      });
    }
    hit(e) {
      const T = this.T, r = this.renderer.domElement.getBoundingClientRect();
      const m = new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.raycaster.setFromCamera(m, this.camera);
      const hits = this.raycaster.intersectObjects([...this.root.children, ...this.helpers.children.filter((h) => h.userData.ground)], false);
      for (const h of hits) {
        if (h.object.userData.ground) { const p = h.point; return { cell: null, place: [Math.floor(p.x), 0, Math.floor(p.z)] }; }
        const cell = h.object.userData.cells && h.object.userData.cells[h.instanceId];
        if (!cell) continue;
        if (this.app.state.preview && !BP.world.get(...cell)) continue;
        const n = h.face.normal;
        return { cell, place: [cell[0] + Math.round(n.x), cell[1] + Math.round(n.y), cell[2] + Math.round(n.z)] };
      }
      return null;
    }
    tap(e) {
      const h = this.hit(e); if (!h) return;
      this.app.tap3d(h, e);
    }
  }
  BP.View3D = View3D;
})();
