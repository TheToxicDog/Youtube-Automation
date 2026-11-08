// Blockwright: side panels / bottom sheets, sharing, export, cloud sync.
(function () {
  const BP = window.BP;
  const { $, el, icon, store } = BP.ui;
  const app = BP.app, st = app.state;
  const P = (BP.panels = {});
  const { tog, stepper } = app.ctl;
  const TITLES = { blocks: 'Blocks', layer: 'Layers', roof: 'Roof creator', redstone: 'Redstone', materials: 'Material list', designs: 'Designs', share: 'Share and export', settings: 'Settings', label: 'Note' };
  const narrow = () => window.innerWidth <= 860;
  const add = (b, ...k) => k.flat().forEach((x) => { if (x != null && x !== false) b.append(x); });
  const sec = (title, kids) => el('section', { class: 'sec' }, [title ? el('h3', { text: title }) : null, ...[].concat(kids)]);
  const p = (t) => el('p', { text: t });
  const btn = (t, fn, cls = '', ic) => el('button', { class: 'btn ' + cls, onclick: fn }, [ic ? icon(ic) : null, t]);
  const tex = (id) => BP.TEX[BP.faceTex(BP.BLOCK[id], 'top')];
  const ago = (t) => { const s = (Date.now() - t) / 1000; return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : new Date(t).toLocaleDateString(); };

  // ---------- open / close ----------
  app.openPanel = (name, arg) => {
    const was = st.panel;
    st.panel = name; P.arg = arg;
    $('#sheet').hidden = false;
    $('#sheetTitle').textContent = TITLES[name] || name;
    document.querySelectorAll('[data-panel]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.panel === name)));
    if (was === 'roof' && name !== 'roof') app.setPreview(null);
    render();
    $('#sheetBody').scrollTop = 0;
    requestAnimationFrame(() => { app.v2d.resize(); app.v3d.resize(); });
  };
  app.closePanel = () => {
    if (st.panel === 'roof') app.setPreview(null);
    st.panel = null; $('#sheet').hidden = true;
    document.querySelectorAll('[data-panel]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    requestAnimationFrame(() => { app.v2d.resize(); app.v3d.resize(); });
  };
  let rq = 0;
  app.refreshPanel = (fromHistory) => {
    if (!st.panel) return;
    if (fromHistory && !['materials', 'roof', 'layer', 'designs'].includes(st.panel)) return;
    if (st.panel === 'share' || st.panel === 'label' || (st.panel === 'designs' && document.activeElement && document.activeElement.id === 'dname')) return;
    cancelAnimationFrame(rq); rq = requestAnimationFrame(render);
  };
  function render() {
    const body = $('#sheetBody'); const top = body.scrollTop;
    body.textContent = '';
    const fn = PANELS[st.panel]; if (fn) fn(body);
    body.scrollTop = top;
  }

  // ---------- blocks ----------
  const PANELS = {};
  PANELS.blocks = (b) => {
    const search = el('input', { type: 'search', id: 'bsearch', placeholder: 'Search blocks', autocomplete: 'off', value: P.q || '' });
    const grid = el('div', { class: 'grid-tiles' });
    const cats = el('div', { class: 'cats' });
    const fill = () => {
      grid.textContent = '';
      const q = (P.q || '').toLowerCase().trim();
      const cat = P.cat || 'All';
      for (const d of BP.BLOCKS) {
        if (q ? !d.name.toLowerCase().includes(q) : cat !== 'All' && d.cat !== cat) continue;
        grid.append(el('button', { class: 'tile', 'aria-pressed': String(d.id === st.block), title: d.name, onclick: () => { app.setBlock(d.id); if (narrow()) app.closePanel(); } }, [el('img', { src: tex(d.id), alt: '' }), d.name]));
      }
      if (!grid.children.length) grid.append(p('No blocks match that name.'));
    };
    search.oninput = () => { P.q = search.value; fill(); };
    for (const c of ['All', ...BP.CATS]) cats.append(tog(c, (P.cat || 'All') === c && !P.q, () => { P.cat = c; P.q = ''; render(); }));
    const recent = el('div', { class: 'recent' }, st.recent.map((id, i) => el('button', { title: BP.BLOCK[id].name + ' (key ' + (i + 1) + ')', 'aria-pressed': String(id === st.block), onclick: () => app.setBlock(id) }, [el('img', { src: tex(id), alt: BP.BLOCK[id].name }), el('i', { text: i + 1 })])));
    const def = app.def();
    const shapeRow = def.shapes ? el('div', { class: 'row' }, [['full', 'Full'], ['slab', 'Slab'], ['slabT', 'Top slab'], ['stair', 'Stairs'], ['stairT', 'Upside-down']].map(([k, n]) => tog(n, st.shape === k, () => { st.shape = k; app.setBlock(st.block); }))) : null;
    const ch = BP.dirChoices(def, st.shape);
    const dirRow = ch ? el('div', { class: 'row' }, ch.map((f) => tog(BP.DIR_NAME[f], st.facing === f, () => { app.setBlock(st.block, { facing: f }); }))) : null;
    const dirHelp = ch ? p(st.shape.startsWith('stair') ? 'Stairs rise toward the direction you pick.' : def.dir === 'wall' ? 'Up means standing on the floor. A direction means it hangs on a wall and points that way.' : def.rs === 'repeater' || def.rs === 'comparator' ? 'The direction the signal travels out of it.' : 'The direction its front faces.') : null;
    add(b, 
      sec(null, [search]),
      sec('Recent · keys 1 to 9', [recent]),
      shapeRow ? sec('Shape', [shapeRow]) : null,
      dirRow ? sec('Direction · R turns it', [dirRow, dirHelp]) : null,
      sec(null, [cats, grid]),
    );
    fill();
  };

  // ---------- layers ----------
  PANELS.layer = (b) => {
    const w = BP.world; const n = [...w.each()].filter((v) => v[1] === st.layer).length;
    const range = el('input', { type: 'range', id: 'lrange', min: 0, max: w.h - 1, value: st.layer, style: 'width:100%;accent-color:var(--accent)' });
    range.oninput = () => app.setLayer(+range.value);
    const copy = (from, to, label) => {
      if (to < 0 || to >= w.h) return;
      const list = [];
      for (const [x, y, z, c] of w.each()) if (y === from) list.push([x, to, z, c]);
      const k = app.apply(list, label); app.toast(`${label}: ${k} block${k === 1 ? '' : 's'}`);
    };
    add(b, 
      sec(null, [el('div', { class: 'row' }, [el('span', { class: 'big-num', text: 'Layer ' + st.layer }), el('span', { class: 'pill', text: 'World Y ' + app.worldY(st.layer) }), el('span', { class: 'pill', text: n + ' blocks' })]), range,
        p('Layer 0 is your ground. The plan always shows one layer, with the layers below shown faded.')]),
      sec('Quick actions', [el('div', { class: 'row' }, [
        btn('Copy to layer above', () => { copy(st.layer, st.layer + 1, 'Copy layer up'); app.setLayer(st.layer + 1); }, '', 'up'),
        btn('Copy from layer below', () => copy(st.layer - 1, st.layer, 'Copy layer below'), '', 'down'),
      ]), p('Copy to layer above is the fastest way to raise walls one row at a time.'), clearLayer()]),
      sec('Show', [
        check('Faded layers below', st.showBelow, (v) => { st.showBelow = v; $('#ghostBtn').setAttribute('aria-pressed', v); }),
        check('Outline of the layer above', st.showAbove, (v) => { st.showAbove = v; }),
      ]),
    );
  };
  function clearLayer() {
    if (!P.confirmClear) return btn('Clear this layer', () => { P.confirmClear = true; render(); }, 'danger', 'trash');
    return el('div', { class: 'confirm' }, [el('b', { text: `Remove every block on layer ${st.layer}?` }), el('div', { class: 'row' }, [
      btn('Clear layer', () => { const list = []; for (const [x, y, z] of BP.world.each()) if (y === st.layer) list.push([x, y, z, null]); app.apply(list, 'Clear layer'); P.confirmClear = false; app.toast('Layer cleared', { label: 'Undo', fn: () => app.undo() }); render(); }, 'primary'),
      btn('Keep it', () => { P.confirmClear = false; render(); }),
    ])]);
  }
  function check(label, val, fn) {
    const i = el('input', { type: 'checkbox' }); i.checked = !!val;
    i.onchange = () => { fn(i.checked); app.savePrefs(); app.redraw(); };
    return el('label', { class: 'check' }, [i, label]);
  }

  // ---------- roof ----------
  st.roof = Object.assign({ type: 'gable', axis: 'auto', pitch: 'std', overhang: 1, mat: 'spruce_planks', trim: '', fill: 'oak_planks', gableFill: true, solid: false }, store.get('bw:roof', {}));
  const ROOFS = [
    ['gable', 'Gable', 'M4 26 L22 6 L40 26 Z'], ['hip', 'Hip', 'M2 26 L13 8 L31 8 L42 26 Z'], ['shed', 'Shed', 'M4 26 L4 15 L40 6 L40 26 Z'], ['gambrel', 'Barn', 'M4 26 L8 14 L22 5 L36 14 L40 26 Z'],
    ['flat', 'Flat', 'M4 26 L4 15 L8 15 L8 18 L36 18 L36 15 L40 15 L40 26 Z'], ['dome', 'Dome', 'M4 26 A18 18 0 0 1 40 26 Z'], ['cone', 'Cone', 'M7 26 L22 2 L37 26 Z'], ['pyramid', 'Pyramid', 'M4 26 L22 5 L40 26 Z M22 5 L22 26'],
  ];
  function roofOpts() {
    const r = st.roof, s = st.sel;
    const [x0, z0, x1, z1] = BP.shapes.norm(s.x0, s.z0, s.x1, s.z1);
    let o = Object.assign({}, r, { x0, z0, x1, z1, y: st.layer, trim: r.trim || null });
    if (r.type === 'pyramid') { // a hip roof on the largest centered square
      const side = Math.min(x1 - x0, z1 - z0); const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      o = Object.assign(o, { type: 'hip', x0: Math.round(cx - side / 2), x1: Math.round(cx - side / 2) + side, z0: Math.round(cz - side / 2), z1: Math.round(cz - side / 2) + side });
    }
    return o;
  }
  function roofPreview() {
    if (!st.sel) { app.setPreview(null); return []; }
    const list = BP.makeRoof(roofOpts()).filter(([x, y, z]) => BP.world.inside(x, y, z));
    app.setPreview(list, { project: true });
    return list;
  }
  function footprintBelow() {
    const w = BP.world; let x0 = w.w, z0 = w.d, x1 = -1, z1 = -1;
    for (let y = st.layer - 1; y >= Math.max(0, st.layer - 6) && x1 < 0; y--) for (const [x, yy, z] of w.each()) if (yy === y) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
    if (x1 < 0) { app.toast('No walls found under this layer. Go up to the layer above your walls first.'); return; }
    st.sel = { x0, z0, x1, z1 }; app.renderOpts(); render(); app.toast(`Using the ${x1 - x0 + 1} × ${z1 - z0 + 1} walls below`);
  }
  function sitOnWalls() {
    const s = st.sel; const [x0, z0, x1, z1] = BP.shapes.norm(s.x0, s.z0, s.x1, s.z1); let top = -1;
    for (const [x, y, z] of BP.world.each()) if (x >= x0 && x <= x1 && z >= z0 && z <= z1) top = Math.max(top, y);
    if (top < 0) { app.toast('No blocks inside the selection yet'); return; }
    app.setLayer(top + 1); render();
  }
  const blockSelect = (val, onchange, filter, none) => {
    const s = el('select', { 'aria-label': 'Block' });
    if (none) s.append(el('option', { value: '', text: none }));
    for (const d of BP.BLOCKS.filter(filter)) { const o = el('option', { value: d.id, text: d.name + (d.shapes ? '' : ' (no stairs)') }); if (d.id === val) o.selected = true; s.append(o); }
    s.onchange = () => onchange(s.value);
    return s;
  };
  PANELS.roof = (b) => {
    const r = st.roof;
    const set = (k, v) => { r[k] = v; store.set('bw:roof', r); render(); };
    if (!st.sel) {
      app.setPreview(null);
      add(b, sec('1. Pick the area', [
        p('Select the area your walls cover, then the roof is built on the current layer. Go to the layer just above your wall tops first.'),
        el('div', { class: 'row' }, [btn('Select area', () => { app.setTool('select'); if (narrow()) app.closePanel(); app.toast('Drag over your walls, then tap Roof'); }, 'primary', 'select'), btn('Use walls below', footprintBelow, '', 'layers')]),
      ]));
    } else {
      const s = st.sel; const [x0, z0, x1, z1] = BP.shapes.norm(s.x0, s.z0, s.x1, s.z1);
      add(b, sec('Area', [el('div', { class: 'card' }, [el('div', { class: 'grow' }, [el('b', { text: `${x1 - x0 + 1} × ${z1 - z0 + 1} blocks` }), el('small', { text: `Starts on layer ${st.layer} (Y ${app.worldY(st.layer)})` })]), btn('Sit on walls', sitOnWalls, 'sm')])]));
    }
    const types = el('div', { class: 'roofs' }, ROOFS.map(([k, n, d]) => el('button', { 'aria-pressed': String(r.type === k), onclick: () => set('type', k), html: `<svg viewBox="0 0 44 28"><path d="${d}"/></svg>` }, [n])));
    add(b, sec('Type', [types]));
    const shapeTypes = ['gable', 'hip', 'shed', 'gambrel', 'pyramid'];
    if (['gable', 'shed', 'gambrel'].includes(r.type)) add(b, sec('Ridge runs', [el('div', { class: 'row' }, [tog('Auto', r.axis === 'auto', () => set('axis', 'auto')), tog('East–West', r.axis === 'x', () => set('axis', 'x')), tog('North–South', r.axis === 'z', () => set('axis', 'z'))])]));
    if (shapeTypes.includes(r.type) || r.type === 'cone') add(b, sec('Pitch', [el('div', { class: 'row' }, [tog('Gentle · slabs', r.pitch === 'low', () => set('pitch', 'low')), tog('Standard · stairs', r.pitch === 'std', () => set('pitch', 'std')), tog('Steep', r.pitch === 'steep', () => set('pitch', 'steep'))])]));
    if (r.type !== 'dome' && r.type !== 'cone') add(b, sec('Overhang', [el('div', { class: 'row' }, [0, 1, 2].map((n) => tog(n ? n + ' block' + (n > 1 ? 's' : '') : 'None', r.overhang === n, () => set('overhang', n))))]));
    add(b, sec('Blocks', [
      el('label', { class: 'field' }, ['Roof', blockSelect(r.mat, (v) => set('mat', v), (d) => d.form === 'cube' && (d.shapes || ['Stone', 'Wood', 'Glass & Light', 'Wool', 'Metal', 'Nature'].includes(d.cat)) && !d.rs)]),
      shapeTypes.includes(r.type) || r.type === 'flat' ? el('label', { class: 'field' }, [r.type === 'flat' ? 'Rim' : 'Edge and ridge trim', blockSelect(r.trim, (v) => set('trim', v), (d) => d.form === 'cube' && !d.rs, 'Same as roof')]) : null,
      el('label', { class: 'field' }, [r.type === 'dome' || r.type === 'cone' ? 'Inside fill' : 'Gable wall fill', blockSelect(r.fill, (v) => set('fill', v), (d) => d.form === 'cube' && !d.rs)]),
      ['gable', 'shed', 'gambrel'].includes(r.type) ? check('Fill the triangle walls at the ends', r.gableFill, (v) => set('gableFill', v)) : null,
      r.type !== 'flat' ? check('Solid underneath (no attic space)', r.solid, (v) => set('solid', v)) : null,
    ]));
    if (st.sel) {
      const list = roofPreview();
      const mats = BP.countMaterials(list.map((v) => v[3]));
      add(b, sec('Preview', [
        el('div', { class: 'mlist' }, mats.slice(0, 6).map((m) => el('div', { class: 'mrow' }, [el('img', { src: tex(m.id), alt: '' }), el('span', { text: m.name }), el('span', { class: 'n', text: m.n })]))),
        el('div', { class: 'row' }, [btn(`Build roof · ${list.length} blocks`, () => {
          const n = app.apply(list, 'Roof'); app.setPreview(null); app.toast(`Roof built: ${n} blocks`, { label: 'Undo', fn: () => app.undo() }); if (narrow()) app.closePanel(); else render();
        }, 'primary', 'roof')]),
        p(r.type === 'hip' || r.type === 'pyramid' ? 'Corner stairs turn into corner shapes on their own when you place them in game.' : 'The orange outline shows the roof from above. Check it in 3D before building.'),
      ]));
    }
  };

  // ---------- redstone ----------
  PANELS.redstone = (b) => {
    const sim = app.sim;
    add(b, sec('Power preview', [
      p('Turn this on to see signal strength on dust, lit lamps, extended pistons and torch states. Use the Hand tool to flip levers and press buttons.'),
      el('div', { class: 'simbar' }, [
        tog(st.power ? 'On' : 'Off', st.power, () => app.setPower(!st.power), 'sel'),
        st.power ? el('button', { class: 'tog', onclick: () => { st.playing = !st.playing; app.startSim(); app.renderOpts(); render(); } }, [icon(st.playing ? 'pause' : 'play'), st.playing ? 'Pause' : 'Play']) : null,
        st.power ? el('button', { class: 'tog', onclick: () => { sim.step(); app.redraw(); render(); } }, [icon('step'), 'Step 1 tick']) : null,
        st.power ? btn('Reset', () => app.setPower(true, true), 'sm') : null,
      ]),
      st.power ? el('div', { class: 'row' }, [tog('Real speed', st.speed === 10, () => { st.speed = 10; app.startSim(); render(); }), tog('Slow motion', st.speed === 2, () => { st.speed = 2; app.startSim(); render(); }), tog(sim.day ? 'Daytime' : 'Night', sim.day, () => { sim.day = !sim.day; render(); })]) : null,
      st.power ? el('span', { class: 'tickc', text: app.tickText() }) : null,
      el('div', { class: 'row' }, [btn('Use the Hand tool', () => { app.setTool('hand'); if (narrow()) app.closePanel(); }, '', 'hand')]),
    ]));
    add(b, sec('Ready-made circuits', [p('Pick one, then tap the plan to place it. Turn it with R or the Rotate button.'),
      ...BP.TEMPLATES.map((t) => el('div', { class: 'card' }, [el('div', { class: 'grow' }, [el('b', { text: t.name }), el('small', { text: t.note })]), btn('Place', () => {
        const xs = t.cells.map((c) => c[0]), zs = t.cells.map((c) => c[2]);
        const mx = Math.min(...xs), mz = Math.min(...zs);
        app.startPaste({ w: Math.max(...xs) - mx + 1, d: Math.max(...zs) - mz + 1, cells: t.cells.map(([x, y, z, c]) => [x - mx, y, z - mz, BP.cloneCell(c)]) });
        if (narrow()) app.closePanel();
      }, 'sm')]))]));
    // delay calculator
    const inp = el('input', { type: 'number', min: 0, step: 0.1, value: P.secs || 1, inputmode: 'decimal' });
    const out = el('p');
    const calc = () => {
      const s = Math.max(0, parseFloat(inp.value) || 0); P.secs = s;
      const ticks = Math.round(s * 10), full = Math.floor(ticks / 4), rest = ticks % 4;
      out.textContent = ticks ? `${ticks} redstone tick${ticks === 1 ? '' : 's'} = ${full ? full + ' repeater' + (full > 1 ? 's' : '') + ' at 4' : ''}${full && rest ? ' + ' : ''}${rest ? '1 repeater at ' + rest : ''}.` : 'Enter a delay above zero.';
    };
    inp.oninput = calc; calc();
    add(b, sec('Delay calculator', [el('label', { class: 'field' }, ['Delay in seconds', inp]), out]));
    add(b, sec('Quick reference', [el('dl', { class: 'kv' }, [
      ['Dust', 'Carries a signal 15 blocks, losing 1 strength per block.'],
      ['Repeater', 'Resets strength to 15. Delay 1 to 4 ticks (0.1 to 0.4 s). Tap with Hand to change.'],
      ['Comparator', 'Compare: passes the back signal if it is at least the side signal. Subtract: back minus side.'],
      ['Torch', 'Turns off when the block it hangs on is powered. 1 tick delay.'],
      ['Observer', 'Sends a 1 tick pulse out of its back when the block in front changes.'],
      ['Strong power', 'Repeaters, comparators, torches under a block, and levers on a block power it strongly, so it powers dust next to it.'],
      ['1 tick', 'One redstone tick is 0.1 s, or 2 game ticks.'],
    ].flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })]))]));
    add(b, sec(null, [p('The preview follows Java Edition rules for common circuits. It does not move blocks with pistons and skips quasi-connectivity, so test tricky builds in game.')]));
  };

  // ---------- materials ----------
  PANELS.materials = (b) => {
    const scope = P.scope || 'all';
    let cells = [];
    if (scope === 'layer') cells = [...BP.world.each()].filter((v) => v[1] === st.layer).map((v) => v[3]);
    else if (scope === 'sel') cells = st.sel ? app.selCells().map((v) => v[3]) : [];
    else cells = [...BP.world.cells.values()];
    const mats = BP.countMaterials(cells).filter((m) => m.id !== 'water' && m.id !== 'lava');
    const got = new Set(store.get('bw:got:' + st.id, []));
    const total = mats.reduce((a, m) => a + m.n, 0);
    add(b, sec(null, [el('div', { class: 'row' }, [tog('Whole build', scope === 'all', () => { P.scope = 'all'; render(); }), tog('This layer', scope === 'layer', () => { P.scope = 'layer'; render(); }), tog('Selection', scope === 'sel', () => { P.scope = 'sel'; render(); })]),
      el('div', { class: 'row' }, [el('span', { class: 'big-num', text: total.toLocaleString() }), el('span', { class: 'hint', text: `blocks · ${BP.stacks(total)}` })])]));
    if (scope === 'sel' && !st.sel) add(b, p('Select an area first with the Select tool.'));
    if (mats.length) {
      add(b, sec('Tick off what you have collected', [el('div', { class: 'mlist' }, mats.map((m) => {
        const c = el('input', { type: 'checkbox', 'aria-label': 'Collected ' + m.name }); c.checked = got.has(m.key);
        const row = el('div', { class: 'mrow' + (c.checked ? ' done' : '') }, [el('img', { src: tex(m.id), alt: '' }), el('label', { class: 'check', style: 'min-height:0' }, [c, m.name]), el('span', { class: 'n' }, [m.n.toLocaleString(), el('small', { text: BP.stacks(m.n) })])]);
        c.onchange = () => { if (c.checked) got.add(m.key); else got.delete(m.key); store.set('bw:got:' + st.id, [...got]); row.classList.toggle('done', c.checked); };
        return row;
      }))]));
      add(b, sec(null, [el('div', { class: 'row' }, [btn('Copy list', async () => {
        const text = `${st.name} — materials\n` + mats.map((m) => `${m.n}\t${m.name}\t(${BP.stacks(m.n)})`).join('\n') + `\nTotal: ${total}`;
        await copyText(text, 'List copied');
      }, '', 'copy')]), p('A stack is 64 blocks and a full shulker box holds 27 stacks (1,728 blocks). Doors count each half.')]));
    } else if (scope !== 'sel' || st.sel) add(b, p('Nothing here yet. Place some blocks and they will be counted.'));
  };

  // ---------- designs ----------
  PANELS.designs = (b) => {
    const name = el('input', { id: 'dname', value: st.name, maxlength: 80, autocomplete: 'off' });
    name.onchange = () => { st.name = name.value.trim() || 'Untitled build'; $('#docnameText').textContent = st.name; app.saveLocal(); };
    const cl = BP.cloud;
    add(b, sec('This design', [el('label', { class: 'field' }, ['Name', name]),
      el('div', { class: 'row' }, [el('span', { class: 'pill ' + (cl && cl.ok ? 'ok' : ''), text: cl ? (cl.ok ? 'Synced to your account' : 'Syncs to your account') : 'Saved on this device' }), el('span', { class: 'hint', text: `${BP.world.w} × ${BP.world.d} plot, ${BP.world.h} layers` })]),
      el('div', { class: 'row' }, [btn('Duplicate', () => { const d = app.snapshot(); d.name = st.name + ' copy'; app.load(d); app.toast('Made a copy'); render(); }, '', 'copy'), btn('Share', () => app.openPanel('share'), '', 'share')])]));
    add(b, sec('Start a new design', [el('div', { class: 'row' }, [
      btn('Small 32×32', () => { app.newDesign(32, 24, 32); render(); }), btn('Medium 64×64', () => { app.newDesign(64, 48, 64); render(); }), btn('Large 128×128', () => { app.newDesign(128, 64, 128); render(); }),
    ]), p('Your current design stays in the list below.')]));
    // merge local and cloud lists
    const local = store.get('bw:list', []);
    const map = new Map(local.map((d) => [d.id, Object.assign({ where: 'device' }, d)]));
    if (cl) for (const d of cl.list) { const m = map.get(d.id); if (!m) map.set(d.id, { id: d.id, name: d.name, saved: d.saved, n: d.n, where: 'cloud', code: d.code }); else if ((d.saved || 0) > (m.saved || 0)) Object.assign(m, { saved: d.saved, n: d.n, name: d.name, where: 'cloud', code: d.code }); else m.where = 'both'; }
    const all = [...map.values()].sort((a, c) => (c.saved || 0) - (a.saved || 0));
    add(b, sec('Your designs', all.map((d) => {
      const cur = d.id === st.id;
      if (P.del === d.id) return el('div', { class: 'confirm' }, [el('b', { text: `Delete “${d.name}”? This cannot be undone.` }), el('div', { class: 'row' }, [
        btn('Delete', () => { store.del('bw:d:' + d.id); store.set('bw:list', store.get('bw:list', []).filter((x) => x.id !== d.id)); if (cl) cl.remove(d.id).catch(() => {}); P.del = null; if (cur) app.newDesign(); render(); }, 'primary'),
        btn('Keep', () => { P.del = null; render(); })])]);
      return el('div', { class: 'card' }, [el('div', { class: 'grow' }, [el('b', { text: d.name }), el('small', { text: `${(d.n || 0).toLocaleString()} blocks · ${ago(d.saved || 0)}${d.where === 'cloud' ? ' · from your account' : ''}` })]),
        cur ? el('span', { class: 'pill ok', text: 'Open' }) : btn('Open', async () => {
          try {
            let data = store.get('bw:d:' + d.id, null);
            if (d.where === 'cloud' && d.code) data = await BP.decodeShare(d.code);
            app.load(data, { id: d.id }); if (narrow()) app.closePanel(); else render();
          } catch (e) { app.toast(e.message); }
        }, 'sm'),
        el('button', { class: 'ib', 'aria-label': 'Delete ' + d.name, onclick: () => { P.del = d.id; render(); } }, [icon('trash')])]);
    })));
  };

  // ---------- share / export / import ----------
  let dlP = null;
  const downloads = () => (dlP = dlP || (window.claude && window.claude.use ? window.claude.use('downloads').catch(() => null) : Promise.resolve(null)));
  async function saveFile(filename, data) {
    const dl = await downloads();
    if (dl) {
      try { await dl.save({ filename, data }); app.toast('Saved ' + filename); return true; }
      catch (e) { if (e && e.code === 'declined') { app.toast('Save cancelled'); return false; } }
    }
    try {
      const blob = data instanceof Blob ? data : new Blob([data], { type: 'application/octet-stream' });
      const a = el('a', { href: URL.createObjectURL(blob), download: filename }); document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000); return true;
    } catch (e) { app.toast('This view cannot save files. Copy the share code instead.'); return false; }
  }
  async function copyText(text, ok) {
    try { await navigator.clipboard.writeText(text); app.toast(ok || 'Copied'); return true; }
    catch (e) { app.toast('Copy is blocked here. Select the text and copy it yourself.'); return false; }
  }
  P.openFile = (f) => {
    const r = new FileReader();
    r.onload = async () => {
      try {
        const text = String(r.result).trim();
        const data = text.startsWith('{') ? JSON.parse(text) : await BP.decodeShare(text);
        app.load(data); app.toast(`Opened “${st.name}”`); if (st.panel) render();
      } catch (e) { app.toast(e.message || 'Could not open that file'); }
    };
    r.readAsText(f);
  };
  const fileName = (ext) => (st.name || 'design').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase().slice(0, 60) + ext;
  PANELS.share = (b) => {
    const code = el('textarea', { readonly: true, id: 'shareCode', rows: 4, 'aria-label': 'Share code' }); code.value = 'Making code…';
    BP.encodeShare(app.snapshot()).then((c) => { code.value = c; size.textContent = `${(c.length / 1024).toFixed(1)} KB of text`; });
    const size = el('span', { class: 'hint' });
    add(b, sec('Share code', [p('Send this code in any chat. The other person opens Blockwright, taps Share, and pastes it under Open a design.'), code,
      el('div', { class: 'row' }, [btn('Copy code', () => { code.select(); copyText(code.value, 'Share code copied'); }, 'primary', 'copy'), size])]));
    const cl = BP.cloud;
    if (cl) {
      const short = el('div', { class: 'row' });
      const mk = btn('Make a short code', async () => {
        mk.disabled = true;
        try { const id = await cl.share(app.snapshot()); P.short = id; render(); }
        catch (e) { app.toast(e.code === 'not_granted' || e.code === 'permission_denied' ? 'Only people who can edit this page can make short codes.' : 'Could not make a short code. Use the long code instead.'); mk.disabled = false; }
      }, '', 'share');
      short.append(P.short ? el('span', { class: 'big-num', text: P.short }) : mk);
      if (P.short) short.append(btn('Copy', () => copyText(P.short, 'Short code copied'), 'sm', 'copy'));
      add(b, sec('Short code', [p('A six letter code that anyone who can open this page can type in. You can also add #s-CODE to the end of this page’s link.'), short]));
    }
    const paste = el('textarea', { id: 'importCode', rows: 3, placeholder: cl ? 'Paste a share code or type a short code' : 'Paste a share code', 'aria-label': 'Code to open' });
    paste.addEventListener('paste', () => setTimeout(() => { openBtn.disabled = !paste.value.trim(); }, 0));
    paste.oninput = () => { openBtn.disabled = !paste.value.trim(); };
    const openBtn = btn('Open', async () => {
      const v = paste.value.trim();
      try {
        let data;
        if (cl && /^(s-)?[A-Za-z0-9]{6}$/.test(v)) { const s = await cl.openShare(v.replace(/^s-/, '')); data = await BP.decodeShare(s.code); }
        else data = await BP.decodeShare(v);
        app.load(data); app.toast(`Opened “${st.name}”`); if (narrow()) app.closePanel(); else render();
      } catch (e) { app.toast(e.message || 'That code did not work'); }
    }, 'primary'); openBtn.disabled = true;
    add(b, sec('Open a design', [paste, el('div', { class: 'row' }, [openBtn, btn('Open a file', () => $('#fileIn').click(), '', 'up')]), p('Opening keeps your current design in Designs.')]));
    const imgBox = el('div', { class: 'sec' });
    add(b, sec('Export', [
      el('div', { class: 'row' }, [btn('Design file (.json)', () => saveFile(fileName('.json'), JSON.stringify(app.snapshot())), '', 'share'),
        btn('Layer guide (.png)', async () => { const blob = await layerGuide(); showImg(imgBox, blob, 'Layer guide'); saveFile(fileName('-layers.png'), blob); }, '', 'layers'),
        btn('3D picture (.png)', async () => { const blob = await shot3d(); if (!blob) return app.toast('The 3D view is not available on this device'); showImg(imgBox, blob, '3D picture'); saveFile(fileName('-3d.png'), blob); }, '', 'rect')]),
      p('The layer guide shows every layer side by side, so you can follow it block by block while building in survival. On iPhone and iPad you can also press and hold the picture below to save it to Photos.'),
      imgBox]));
  };
  function showImg(box, blob, alt) {
    box.textContent = '';
    if (!blob) return;
    box.append(el('img', { class: 'preview-img', src: URL.createObjectURL(blob), alt }));
  }
  async function layerGuide() {
    const w = BP.world; let x0 = w.w, z0 = w.d, x1 = -1, z1 = -1, y1 = -1;
    for (const [x, y, z] of w.each()) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); y1 = Math.max(y1, y); }
    if (x1 < 0) { app.toast('Nothing to export yet'); return null; }
    const W = x1 - x0 + 1, D = z1 - z0 + 1, layers = y1 + 1;
    const cs = Math.max(8, Math.min(22, Math.floor(420 / Math.max(W, D))));
    const cols = Math.min(layers, Math.max(1, Math.min(4, Math.ceil(Math.sqrt(layers)))));
    const rows = Math.ceil(layers / cols);
    const tw = W * cs, th = D * cs, pad = 24, head = 30, title = 70;
    const cv = document.createElement('canvas');
    cv.width = cols * (tw + pad) + pad; cv.height = title + rows * (th + head + pad) + pad;
    if (cv.width * cv.height > 40e6) { app.toast('This build is too big for one image. Export the design file instead.'); return null; }
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    g.fillStyle = '#f4f5f0'; g.fillRect(0, 0, cv.width, cv.height);
    g.fillStyle = '#1d221e'; g.font = '700 26px "Pixelify Sans", sans-serif'; g.textBaseline = 'top'; g.fillText(st.name, pad, 18);
    g.font = '15px "Atkinson Hyperlegible", sans-serif'; g.fillStyle = '#5a645c';
    g.fillText(`${W} × ${D} blocks · ${layers} layers · ${w.cells.size.toLocaleString()} blocks · north is up · made with Blockwright`, pad, 48);
    const r = Object.create(app.v2d); r.g = g; r.col = Object.assign({}, app.v2d.col, { dim: '#5a645c' });
    const savedPower = st.power; st.power = false;
    for (let y = 0; y < layers; y++) {
      const cx = pad + (y % cols) * (tw + pad), cy = title + Math.floor(y / cols) * (th + head + pad);
      g.fillStyle = '#1d221e'; g.font = '700 16px "Atkinson Hyperlegible", sans-serif'; g.fillText(`Layer ${y}  ·  Y ${app.worldY(y)}`, cx, cy + 4);
      const oy = cy + head;
      g.fillStyle = '#ffffff'; g.fillRect(cx, oy, tw, th);
      for (const [x, yy, z, c] of w.each()) if (yy === y) r.drawCell(c, cx + (x - x0) * cs, oy + (z - z0) * cs, cs, x, y, z, false);
      g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 1; g.beginPath();
      for (let i = 0; i <= W; i++) { g.moveTo(cx + i * cs + 0.5, oy); g.lineTo(cx + i * cs + 0.5, oy + th); }
      for (let i = 0; i <= D; i++) { g.moveTo(cx, oy + i * cs + 0.5); g.lineTo(cx + tw, oy + i * cs + 0.5); }
      g.stroke(); g.strokeStyle = '#1d221e'; g.strokeRect(cx + 0.5, oy + 0.5, tw, th);
    }
    st.power = savedPower;
    return new Promise((res) => cv.toBlob(res, 'image/png'));
  }
  async function shot3d() {
    const v = app.v3d; if (!v || !v.ok) return null;
    const R = v.renderer, size = new v.T.Vector2(); R.getSize(size);
    R.setSize(1600, 1000, false); v.camera.aspect = 1.6; v.camera.updateProjectionMatrix();
    if (!v.visible()) { v.rebuild(); if (v.firstBuild !== false) v.preset('iso'); }
    R.render(v.scene, v.camera);
    const blob = await new Promise((res) => R.domElement.toBlob(res, 'image/png'));
    if (size.x && size.y) { R.setSize(size.x, size.y, false); v.camera.aspect = size.x / size.y; v.camera.updateProjectionMatrix(); }
    v.resize();
    return blob;
  }

  // ---------- settings / help / credits ----------
  PANELS.settings = (b) => {
    const tab = P.tab || 'settings';
    add(b, el('div', { class: 'seg', style: 'align-self:flex-start' }, [['settings', 'Settings'], ['help', 'Help'], ['credits', 'Credits']].map(([k, n]) => el('button', { 'aria-pressed': String(tab === k), onclick: () => { P.tab = k; render(); } }, n))));
    if (tab === 'help') return help(b);
    if (tab === 'credits') return credits(b);
    const w = BP.world;
    const num = (label, val, min, max, id) => { const i = el('input', { type: 'number', id, min, max, value: val, inputmode: 'numeric' }); return [el('label', { class: 'field grow' }, [label, i]), i]; };
    const [fw, iw] = num('Width (X)', w.w, 8, 256, 'sw'), [fd, idd] = num('Length (Z)', w.d, 8, 256, 'sd'), [fh, ih] = num('Height (layers)', w.h, 4, 128, 'sh');
    const applySize = () => {
      const nw = Math.max(8, Math.min(256, +iw.value | 0)), nd = Math.max(8, Math.min(256, +idd.value | 0)), nh = Math.max(4, Math.min(128, +ih.value | 0));
      let lost = 0; for (const [x, y, z] of w.each()) if (x >= nw || z >= nd || y >= nh) lost++;
      if (lost && !P.okLost) { P.okLost = true; P.lost = lost; render(); return; }
      P.okLost = false; w.resize(nw, nh, nd); BP.history.clear(); st.mirror = [(nw - 1) / 2, (nd - 1) / 2]; app.setLayer(Math.min(st.layer, nh - 1)); app.v2d.fit(); app.saveLocal(); app.toast(`Plot is now ${nw} × ${nd} with ${nh} layers`); render();
    };
    add(b, sec('Plot size', [el('div', { class: 'row' }, [fw, fd, fh]),
      P.okLost ? el('div', { class: 'confirm' }, [el('b', { text: `${P.lost} blocks are outside the new size and will be removed.` }), el('div', { class: 'row' }, [btn('Resize anyway', applySize, 'primary'), btn('Cancel', () => { P.okLost = false; render(); })])]) : btn('Apply size', applySize),
      p('Up to 256 × 256 and 128 layers. Resizing clears undo history.')]));
    const [ox, iox] = num('X', st.origin[0], -3e7, 3e7, 'ox'), [oy, ioy] = num('Y of layer 0', st.origin[1], -64, 320, 'oy'), [oz, ioz] = num('Z', st.origin[2], -3e7, 3e7, 'oz');
    [iox, ioy, ioz].forEach((i) => { i.onchange = () => { st.origin = [+iox.value | 0, +ioy.value | 0, +ioz.value | 0]; app.setLayer(st.layer); $('#lvY').textContent = 'Y ' + app.worldY(st.layer); app.redraw(); app.saveLocal(); }; });
    add(b, sec('World coordinates', [p('Enter the in-game coordinates of the plot’s top-left corner (press F3 in Java Edition). Rulers and the readout then match your world, and chunk lines line up with real chunks.'), el('div', { class: 'row' }, [ox, oy, oz])]));
    add(b, sec('Plan view', [
      check('Grid', st.showGrid, (v) => { st.showGrid = v; }),
      check('Chunk borders (every 16 blocks)', st.showChunks, (v) => { st.showChunks = v; }),
      check('Faded layers below', st.showBelow, (v) => { st.showBelow = v; $('#ghostBtn').setAttribute('aria-pressed', v); }),
      check('Outline of the layer above', st.showAbove, (v) => { st.showAbove = v; }),
    ]));
    const pm = st.pencilMode;
    const setPm = (v) => { st.pencilMode = v; store.set('bw:pencil', v); if (v !== 'auto') st.penActive = false; render(); };
    add(b, sec('Apple Pencil and touch', [el('div', { class: 'row' }, [tog('Automatic', pm === 'auto', () => setPm('auto')), tog('Pencil draws only', pm === 'on', () => setPm('on')), tog('Fingers draw', pm === 'off', () => setPm('off'))]),
      p('Automatic switches to Pencil mode the first time it sees an Apple Pencil: the Pencil draws, and one finger moves the plan. Two fingers always pinch and move.')]));
    const th = store.get('bw:theme', 'system');
    const setTh = (v) => { store.set('bw:theme', v); if (v === 'system') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', v); app.v2d.readColors(); app.v3d.applyTheme(); render(); };
    add(b, sec('Theme', [el('div', { class: 'row' }, [tog('System', th === 'system', () => setTh('system')), tog('Light', th === 'light', () => setTh('light')), tog('Dark', th === 'dark', () => setTh('dark'))])]));
  };
  function help(b) {
    add(b, sec('Getting started', [el('ol', { style: 'margin:0;padding-left:20px;line-height:1.6' }, [
      el('li', { text: 'Tap the block button at the bottom left to choose a block.' }),
      el('li', { text: 'Pick Rect or Circle and drag on the plan. Set Height to 4 to raise walls in one go.' }),
      el('li', { text: 'Use the arrows on the right to change layer. Lower layers show faded underneath.' }),
      el('li', { text: 'Select your walls and tap Roof to add a roof.' }),
      el('li', { text: 'Check it in 3D, then use Blocks for a shopping list and Share to send it.' }),
    ])]));
    const kv = (rows) => el('dl', { class: 'kv' }, rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', { text: v })]));
    add(b, sec('Touch and Apple Pencil', [kv([
      ['Pencil', 'Draws. Hovering an iPad Pencil shows where the block will go.'], ['One finger', 'Draws, or moves the plan once a Pencil is in use.'],
      ['Two fingers', 'Pinch to zoom, drag to move.'], ['Two-finger tap', 'Undo'], ['Three-finger tap', 'Redo'],
      ['3D view', 'Drag to orbit, pinch to zoom, two fingers to pan. Tap to place with Place, or remove with Erase.'],
    ])]));
    const k = (t) => el('kbd', { text: t });
    add(b, sec('Keyboard', [kv([
      [[k('B'), ' ', k('E'), ' ', k('U'), ' ', k('O'), ' ', k('L')], 'Place, Erase, Rect, Circle, Line'], [[k('G'), ' ', k('S'), ' ', k('I'), ' ', k('H')], 'Fill, Select, Pick, Use'],
      [[k('R')], 'Turn the block (stairs, repeaters, pistons) or the paste'], [[k('['), ' ', k(']')], 'Layer down, layer up'], [[k('1'), '–', k('9')], 'Recent blocks'],
      [[k('Shift')], 'Perfect squares and circles while dragging'], [[k('Alt'), '-click'], 'Pick the block under the cursor'], [[k('Space'), ' drag'], 'Move the plan'],
      [[k('Ctrl'), ' ', k('Z')], 'Undo (add Shift to redo)'], [[k('Ctrl'), ' ', k('C'), ' ', k('X'), ' ', k('V')], 'Copy, cut, paste a selection'],
      [[k('Tab')], 'Switch plan and 3D'], [[k('F')], 'Fit build to screen'], [[k('P')], 'Power preview on or off'], [[k('X')], 'Mirror left and right'],
    ])]));
    add(b, sec('Good to know', [p('Circles with an odd width have a single center block, which makes doors and towers easier to line up. Even widths have a 2 × 2 center.'), p('Chunk borders use your world coordinates from Settings, so farms and spawn-proofing line up with real chunks.')]));
  }
  function credits(b) {
    add(b, sec('Textures', [p('Block textures come from two free projects, both licensed Creative Commons Attribution-ShareAlike 3.0 (CC BY-SA 3.0). That license allows personal and non-commercial use, and more, as long as the authors are credited and changes are shared alike.'),
      el('dl', { class: 'kv' }, [
        el('dt', { text: 'Minetest Game' }), el('dd', { text: 'default, wool, doors and xpanes mods. © 2010–2023 celeron55 (Perttu Ahola), Cisoun, VanessaE, Calinou, PilzAdam, BlockMen, paramat, Gambit, TumeniNodes and other contributors.' }),
        el('dt', { text: 'Mesecons' }), el('dd', { text: 'Pistons, lamp, note block and sticky block. © 2011–2016 Mesecons Mod Developer Team and contributors.' }),
        el('dt', { text: 'Blockwright' }), el('dd', { text: 'Redstone dust, repeater, comparator, observer, target, hopper, lever, button, rails, doors and dispenser faces are drawn in code by Blockwright and shared under the same CC BY-SA 3.0 license.' }),
      ]),
      el('p', {}, ['License: ', el('a', { href: 'https://creativecommons.org/licenses/by-sa/3.0/', target: '_blank', rel: 'noopener', text: 'creativecommons.org/licenses/by-sa/3.0' })]),
      el('p', {}, ['Sources: ', el('a', { href: 'https://github.com/luanti-org/minetest_game', target: '_blank', rel: 'noopener', text: 'minetest_game' }), ' and ', el('a', { href: 'https://github.com/minetest-mods/mesecons', target: '_blank', rel: 'noopener', text: 'mesecons' }), '.']),
      p('Blockwright is a fan-made planning tool. It is not affiliated with Mojang or Microsoft. Block names describe what to place in game.')]));
    add(b, sec('3D', [p('3D view uses three.js (MIT license).')]));
  }

  // ---------- notes ----------
  app.editLabel = (x, y, z) => { app.openPanel('label', { x, y, z }); };
  PANELS.label = (b) => {
    const a = P.arg; if (!a) return;
    const i = st.labels.findIndex((L) => L.x === a.x && L.y === a.y && L.z === a.z);
    const inp = el('input', { id: 'ltext', value: i >= 0 ? st.labels[i].text : '', maxlength: 60, placeholder: 'For example: Chest room, or Hopper goes here', autocomplete: 'off' });
    const save = () => {
      const t = inp.value.trim();
      if (i >= 0) { if (t) st.labels[i].text = t; else st.labels.splice(i, 1); } else if (t) st.labels.push({ x: a.x, y: a.y, z: a.z, text: t });
      app.saveLocal(); app.redraw(); app.closePanel();
    };
    inp.onkeydown = (e) => { if (e.key === 'Enter') save(); };
    add(b, sec(`Note at X ${a.x + st.origin[0]}, Z ${a.z + st.origin[2]}, layer ${a.y}`, [el('label', { class: 'field' }, ['Note', inp]),
      el('div', { class: 'row' }, [btn('Save note', save, 'primary'), i >= 0 ? btn('Delete note', () => { st.labels.splice(i, 1); app.saveLocal(); app.redraw(); app.closePanel(); }, 'danger', 'trash') : null])]));
    setTimeout(() => inp.focus(), 50);
  };

  // ---------- cloud sync (artifact db + user) ----------
  const randomCode = () => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; const r = new Uint32Array(6); crypto.getRandomValues(r); for (const v of r) s += a[v % a.length]; return s; };
  async function initCloud() {
    if (!window.claude || !window.claude.use) return;
    let db, user;
    try { [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]); } catch (e) { return; }
    if (!db) return;
    const cloud = { db, list: [], ok: false };
    cloud.share = async (data) => { const code = await BP.encodeShare(data); const id = randomCode(); await db.doc('shares/' + id).set({ name: data.name, code, created: Date.now() }); return id; };
    cloud.openShare = async (id) => { const s = await db.doc('shares/' + id.toUpperCase()).get(); if (!s.exists) throw new Error('No design has that short code.'); return s.data(); };
    let uid = null;
    try { uid = user ? await user.id() : null; } catch (e) { uid = null; }
    if (uid) {
      const col = db.collection('data/users/' + uid + '/designs');
      cloud.queueSave = (id, data) => {
        clearTimeout(cloud.t);
        cloud.t = setTimeout(async () => {
          try { const code = await BP.encodeShare(data); await col.doc(id).set({ name: data.name, code, saved: data.saved, n: data.blocks.length / 4 }); cloud.ok = true; }
          catch (e) { cloud.ok = false; }
          if (st.panel === 'designs') app.refreshPanel();
        }, 2500);
      };
      cloud.remove = (id) => col.doc(id).delete();
      try { col.onSnapshot((snap) => { cloud.list = snap.docs.map((d) => Object.assign({ id: d.id }, d.data())); cloud.ok = true; if (st.panel === 'designs') app.refreshPanel(); }, () => {}); } catch (e) { /* ignore */ }
    } else {
      cloud.queueSave = () => {}; cloud.remove = () => Promise.resolve();
    }
    BP.cloud = cloud;
    if (st.panel === 'share' || st.panel === 'designs') render();
    openHash();
  }
  async function openHash() {
    const m = (location.hash || '').match(/^#s-([A-Za-z0-9]{6})$/);
    if (!m || !BP.cloud) return;
    try { const s = await BP.cloud.openShare(m[1]); app.load(await BP.decodeShare(s.code)); app.toast(`Opened shared design “${st.name}”`); }
    catch (e) { app.toast(e.message || 'Could not open the shared design'); }
  }
  window.addEventListener('hashchange', openHash);

  P.init = () => {
    $('#sheetClose').onclick = app.closePanel;
    $('#fileIn').onchange = (e) => { const f = e.target.files[0]; if (f) P.openFile(f); e.target.value = ''; };
    // swipe the sheet handle down to close on phones
    let sy = null;
    $('#sheet').addEventListener('touchstart', (e) => { if (e.target.closest('.grab, header')) sy = e.touches[0].clientY; }, { passive: true });
    $('#sheet').addEventListener('touchend', (e) => { if (sy != null && e.changedTouches[0].clientY - sy > 60) app.closePanel(); sy = null; }, { passive: true });
  };
  P.afterBoot = () => { initCloud(); };
})();
