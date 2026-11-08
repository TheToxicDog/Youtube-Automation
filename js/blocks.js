// Blockwright: block registry and procedural textures.
// Image textures come from js/textures.js (Minetest Game + Mesecons, CC BY-SA 3.0).
// Redstone parts that had no good match are drawn here as 16x16 pixel art.
(function () {
  const BP = (window.BP = window.BP || {});
  const TEX = (BP.TEX = Object.assign({}, window.BP_TEX || {}));

  // ---------- tiny pixel painter ----------
  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }
  function paint(fn) {
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    const g = c.getContext('2d');
    const px = (x, y, col, w = 1, h = 1) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    fn(g, px);
    return c.toDataURL('image/png');
  }
  function noise(px, base, vary, seed) {
    const r = rng(seed);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const k = (r() - 0.5) * vary;
      px(x, y, `rgb(${clamp(base[0] + k)},${clamp(base[1] + k)},${clamp(base[2] + k)})`);
    }
  }
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const smooth = (px, seed) => { noise(px, [158, 158, 156], 14, seed); for (let i = 0; i < 16; i++) { px(i, 0, '#b4b4b2'); px(0, i, '#b4b4b2'); px(i, 15, '#7c7c7a'); px(15, i, '#7c7c7a'); } };
  const RED = '#e0301e', RED_D = '#7a120a', RED_L = '#ff6a50';

  const proc = {
    redstone_block: () => paint((g, px) => {
      noise(px, [176, 24, 14], 40, 7);
      const r = rng(9);
      for (let i = 0; i < 26; i++) px((r() * 16) | 0, (r() * 16) | 0, RED_L);
      for (let i = 0; i < 16; i++) { px(i, 0, RED_D); px(0, i, RED_D); px(i, 15, RED_D); px(15, i, RED_D); }
    }),
    redstone_dust: () => paint((g, px) => {
      const r = rng(3);
      for (let i = 0; i < 70; i++) {
        const a = r() * Math.PI * 2, d = r() * 6.5;
        px(8 + Math.cos(a) * d | 0, 8 + Math.sin(a) * d | 0, r() < 0.5 ? RED : RED_D);
      }
      px(6, 6, RED_L, 4, 4);
    }),
    redstone_torch: () => paint((g, px) => {
      px(7, 6, '#6b4a26', 2, 10); px(7, 6, '#8a6234', 1, 10);
      px(6, 3, RED_D, 4, 4); px(7, 3, RED, 2, 3); px(7, 4, RED_L, 1, 1);
    }),
    repeater_top: () => paint((g, px) => {
      smooth(px, 11);
      px(3, 7, '#9a1d12', 10, 2); px(7, 2, '#9a1d12', 2, 12);
      px(7, 2, RED, 2, 2); px(6, 2, RED_D, 1, 2); px(9, 2, RED_D, 1, 2);
      px(7, 11, RED, 2, 2); px(6, 11, RED_D, 1, 2); px(9, 11, RED_D, 1, 2);
      px(7, 0, '#fff3', 2, 1);
    }),
    comparator_top: () => paint((g, px) => {
      smooth(px, 12);
      px(3, 4, '#9a1d12', 10, 1); px(7, 2, '#9a1d12', 2, 12);
      px(7, 2, RED, 2, 2);
      px(3, 11, RED, 2, 2); px(11, 11, RED, 2, 2);
      px(2, 11, RED_D, 1, 2); px(13, 11, RED_D, 1, 2);
      px(7, 0, '#fff3', 2, 1);
    }),
    lever: () => paint((g, px) => {
      noise(px, [120, 120, 118], 30, 21);
      g.clearRect(0, 0, 16, 4); g.clearRect(0, 12, 16, 4); g.clearRect(0, 0, 4, 16); g.clearRect(12, 0, 4, 16);
      px(7, 1, '#6b4a26', 2, 9); px(7, 1, '#9b7040', 1, 8);
    }),
    button: () => paint((g, px) => {
      noise(px, [130, 130, 128], 18, 23);
      g.clearRect(0, 0, 16, 6); g.clearRect(0, 10, 16, 6); g.clearRect(0, 0, 5, 16); g.clearRect(11, 0, 5, 16);
    }),
    observer_front: () => paint((g, px) => {
      noise(px, [94, 94, 96], 24, 31);
      px(2, 3, '#2a2a2c', 12, 4); px(3, 4, '#8a8a8e', 3, 2); px(10, 4, '#8a8a8e', 3, 2);
      px(2, 10, '#2a2a2c', 12, 3);
    }),
    observer_back: () => paint((g, px) => {
      noise(px, [94, 94, 96], 24, 32);
      px(6, 6, '#2a2a2c', 4, 4); px(7, 7, '#5a1009', 2, 2);
    }),
    observer_side: () => paint((g, px) => {
      noise(px, [104, 104, 106], 22, 33);
      px(7, 3, '#3a3a3c', 2, 10); px(5, 5, '#3a3a3c', 6, 1); px(6, 4, '#3a3a3c', 4, 1);
    }),
    target: () => paint((g, px) => {
      noise(px, [226, 214, 182], 18, 41);
      g.fillStyle = '#c4281c'; g.beginPath(); g.arc(8, 8, 7, 0, 7); g.fill();
      g.fillStyle = '#ebe2c8'; g.beginPath(); g.arc(8, 8, 4.6, 0, 7); g.fill();
      g.fillStyle = '#c4281c'; g.beginPath(); g.arc(8, 8, 2.2, 0, 7); g.fill();
    }),
    hopper_top: () => paint((g, px) => {
      noise(px, [70, 70, 74], 18, 51);
      px(3, 3, '#1e1e20', 10, 10); px(4, 4, '#353538', 8, 8);
      for (let i = 0; i < 16; i++) { px(i, 0, '#9a9aa0'); px(0, i, '#9a9aa0'); }
    }),
    hopper_side: () => paint((g, px) => {
      noise(px, [70, 70, 74], 18, 52);
      g.clearRect(0, 11, 4, 5); g.clearRect(12, 11, 4, 5);
      px(0, 10, '#2a2a2e', 16, 1);
    }),
    dispenser_front: () => paint((g, px) => {
      noise(px, [122, 122, 120], 30, 61);
      px(5, 5, '#1d1d1d', 6, 6); px(6, 6, '#3c3c3c', 4, 4); px(7, 7, '#141414', 2, 2);
    }),
    dropper_front: () => paint((g, px) => {
      noise(px, [122, 122, 120], 30, 62);
      px(5, 6, '#1d1d1d', 6, 4); px(6, 7, '#3c3c3c', 4, 2);
    }),
    daylight_top: () => paint((g, px) => {
      noise(px, [196, 182, 140], 16, 71);
      px(2, 2, '#4b6a8c', 12, 12);
      for (let i = 2; i < 14; i += 3) { px(i, 2, '#8fb3d6', 1, 12); px(2, i, '#8fb3d6', 12, 1); }
    }),
    door_wood: () => paint((g, px) => {
      noise(px, [148, 106, 60], 24, 81);
      px(0, 0, '#5d3f1c', 16, 1); px(0, 15, '#5d3f1c', 16, 1); px(0, 0, '#5d3f1c', 1, 16); px(15, 0, '#5d3f1c', 1, 16);
      px(3, 2, '#5d3f1c', 4, 5); px(9, 2, '#5d3f1c', 4, 5); px(4, 3, '#a7bfd4', 2, 3); px(10, 3, '#a7bfd4', 2, 3);
      px(12, 9, '#2c2c2c', 2, 1);
    }),
    door_iron: () => paint((g, px) => {
      noise(px, [196, 196, 200], 14, 82);
      px(0, 0, '#7a7a80', 16, 1); px(0, 15, '#7a7a80', 16, 1); px(0, 0, '#7a7a80', 1, 16); px(15, 0, '#7a7a80', 1, 16);
      for (let y = 3; y < 13; y += 3) px(3, y, '#8f8f96', 10, 1);
    }),
    rail: () => paint((g, px) => {
      for (let y = 1; y < 16; y += 4) px(2, y, '#6b4a26', 12, 2);
      px(3, 0, '#8d8d93', 2, 16); px(11, 0, '#8d8d93', 2, 16);
    }),
    powered_rail: () => paint((g, px) => {
      for (let y = 1; y < 16; y += 4) px(2, y, '#6b4a26', 12, 2);
      px(3, 0, '#d8b23a', 2, 16); px(11, 0, '#d8b23a', 2, 16); px(7, 0, RED, 2, 16);
    }),
    note_icon: null,
  };
  for (const k in proc) if (proc[k]) TEX[k] = proc[k]();

  // ---------- block registry ----------
  // form: cube | flat | low | post | pane | torch | small | panel | door | trapdoor
  // dir:  none | h4 (n,e,s,w) | all6 (+u,d) | wall (u + n,e,s,w) | hopper (d + n,e,s,w)
  // tex:  top / side / bottom / front / back texture keys
  // shapes: can be turned into slabs and stairs
  const B = [];
  const add = (id, name, cat, tex, o = {}) => B.push(Object.assign({ id, name, cat, tex: typeof tex === 'string' ? { all: tex } : tex, form: 'cube', dir: 'none', shapes: false, solid: true, clear: false }, o));

  add('stone', 'Stone', 'Stone', 'stone', { shapes: true });
  add('cobblestone', 'Cobblestone', 'Stone', 'cobblestone', { shapes: true });
  add('stone_bricks', 'Stone Bricks', 'Stone', 'stone_bricks', { shapes: true });
  add('smooth_stone', 'Smooth Stone', 'Stone', 'smooth_stone', { shapes: true });
  add('mossy_cobblestone', 'Mossy Cobblestone', 'Stone', 'mossy_cobblestone', { shapes: true });
  add('bricks', 'Bricks', 'Stone', 'bricks', { shapes: true });
  add('granite', 'Granite', 'Stone', 'granite', { shapes: true });
  add('granite_bricks', 'Granite Bricks', 'Stone', 'granite_bricks', { shapes: true });
  add('sandstone', 'Sandstone', 'Stone', 'sandstone', { shapes: true });
  add('cut_sandstone', 'Cut Sandstone', 'Stone', 'cut_sandstone', { shapes: true });
  add('sandstone_bricks', 'Sandstone Bricks', 'Stone', 'sandstone_bricks', { shapes: true });
  add('red_sandstone', 'Red Sandstone', 'Stone', 'red_sandstone', { shapes: true });
  add('obsidian', 'Obsidian', 'Stone', 'obsidian');
  add('obsidian_bricks', 'Dark Bricks', 'Stone', 'obsidian_bricks', { shapes: true });

  add('oak_planks', 'Oak Planks', 'Wood', 'oak_planks', { shapes: true });
  add('spruce_planks', 'Spruce Planks', 'Wood', 'spruce_planks', { shapes: true });
  add('birch_planks', 'Birch Planks', 'Wood', 'birch_planks', { shapes: true });
  add('jungle_planks', 'Jungle Planks', 'Wood', 'jungle_planks', { shapes: true });
  add('acacia_planks', 'Acacia Planks', 'Wood', 'acacia_planks', { shapes: true });
  add('oak_log', 'Oak Log', 'Wood', { top: 'oak_log_top', side: 'oak_log' });
  add('spruce_log', 'Spruce Log', 'Wood', { top: 'spruce_log_top', side: 'spruce_log' });
  add('birch_log', 'Birch Log', 'Wood', { top: 'birch_log_top', side: 'birch_log' });
  add('jungle_log', 'Jungle Log', 'Wood', { top: 'jungle_log_top', side: 'jungle_log' });
  add('bookshelf', 'Bookshelf', 'Wood', { top: 'oak_planks', side: 'bookshelf' });
  add('oak_fence', 'Oak Fence', 'Wood', 'oak_planks', { form: 'post', solid: false });
  add('spruce_fence', 'Spruce Fence', 'Wood', 'spruce_planks', { form: 'post', solid: false });
  add('oak_door', 'Oak Door', 'Wood', { all: 'door_wood' }, { form: 'door', dir: 'h4', solid: false, rs: 'door' });
  add('trapdoor', 'Trapdoor', 'Wood', 'trapdoor', { form: 'trapdoor', dir: 'h4', solid: false, rs: 'door' });
  add('ladder', 'Ladder', 'Wood', 'ladder', { form: 'panel', dir: 'h4', solid: false, clear: true });

  add('grass_block', 'Grass Block', 'Nature', { top: 'grass_top', side: 'grass_side', bottom: 'dirt' });
  add('dirt', 'Dirt', 'Nature', 'dirt');
  add('sand', 'Sand', 'Nature', 'sand');
  add('gravel', 'Gravel', 'Nature', 'gravel');
  add('clay', 'Clay', 'Nature', 'clay');
  add('snow_block', 'Snow', 'Nature', 'snow');
  add('ice', 'Ice', 'Nature', 'ice', { clear: true });
  add('oak_leaves', 'Leaves', 'Nature', 'leaves', { clear: true });
  add('water', 'Water', 'Nature', 'water', { clear: true, solid: false });
  add('lava', 'Lava', 'Nature', 'lava', { solid: false });

  add('glass', 'Glass', 'Glass & Light', 'glass', { clear: true, solid: false });
  add('glass_pane', 'Glass Pane', 'Glass & Light', 'glass', { form: 'pane', clear: true, solid: false });
  add('iron_bars', 'Iron Bars', 'Glass & Light', 'iron_bars', { form: 'pane', clear: true, solid: false });
  add('glowstone', 'Glowstone', 'Glass & Light', 'glowstone');
  add('torch', 'Torch', 'Glass & Light', 'torch', { form: 'torch', dir: 'wall', solid: false, clear: true });

  const wool = [['white', 'White'], ['grey', 'Light Gray'], ['dark_grey', 'Gray'], ['black', 'Black'], ['red', 'Red'], ['orange', 'Orange'], ['yellow', 'Yellow'], ['green', 'Lime'], ['dark_green', 'Green'], ['cyan', 'Cyan'], ['blue', 'Blue'], ['violet', 'Purple'], ['magenta', 'Magenta'], ['pink', 'Pink'], ['brown', 'Brown']];
  for (const [k, n] of wool) add('wool_' + k, n + ' Wool', 'Wool', 'wool_' + k);
  for (const [k, n] of wool.slice(0, 8)) add('carpet_' + k, n + ' Carpet', 'Wool', 'wool_' + k, { form: 'flat', solid: false });

  add('iron_block', 'Iron Block', 'Metal', 'iron_block');
  add('gold_block', 'Gold Block', 'Metal', 'gold_block');
  add('copper_block', 'Copper Block', 'Metal', 'copper_block', { shapes: true });
  add('diamond_block', 'Diamond Block', 'Metal', 'diamond_block');
  add('coal_block', 'Coal Block', 'Metal', 'coal_block');
  add('furnace', 'Furnace', 'Metal', { top: 'furnace_top', side: 'furnace_side', front: 'furnace_front' }, { dir: 'h4' });
  add('chest', 'Chest', 'Metal', { top: 'chest_top', side: 'chest_side', front: 'chest_front' }, { dir: 'h4', rs: 'container' });

  // redstone
  add('redstone_dust', 'Redstone Dust', 'Redstone', 'redstone_dust', { form: 'flat', solid: false, clear: true, rs: 'dust' });
  add('redstone_block', 'Block of Redstone', 'Redstone', 'redstone_block', { rs: 'block', solid: false });
  add('redstone_torch', 'Redstone Torch', 'Redstone', 'redstone_torch', { form: 'torch', dir: 'wall', solid: false, clear: true, rs: 'torch' });
  add('repeater', 'Repeater', 'Redstone', { top: 'repeater_top', side: 'smooth_stone' }, { form: 'low', dir: 'h4', solid: false, rs: 'repeater' });
  add('comparator', 'Comparator', 'Redstone', { top: 'comparator_top', side: 'smooth_stone' }, { form: 'low', dir: 'h4', solid: false, rs: 'comparator' });
  add('lever', 'Lever', 'Redstone', 'lever', { form: 'small', dir: 'wall', solid: false, clear: true, rs: 'lever' });
  add('stone_button', 'Button', 'Redstone', 'button', { form: 'small', dir: 'wall', solid: false, clear: true, rs: 'button' });
  add('pressure_plate', 'Pressure Plate', 'Redstone', 'smooth_stone', { form: 'flat', solid: false, rs: 'plate' });
  add('redstone_lamp', 'Redstone Lamp', 'Redstone', 'redstone_lamp', { rs: 'lamp' });
  add('piston', 'Piston', 'Redstone', { side: 'piston_side', front: 'piston_front', back: 'piston_back' }, { dir: 'all6', rs: 'piston' });
  add('sticky_piston', 'Sticky Piston', 'Redstone', { side: 'piston_side', front: 'sticky_piston_front', back: 'piston_back' }, { dir: 'all6', rs: 'piston' });
  add('observer', 'Observer', 'Redstone', { side: 'observer_side', front: 'observer_front', back: 'observer_back' }, { dir: 'all6', rs: 'observer' });
  add('target', 'Target', 'Redstone', 'target', { rs: 'target' });
  add('note_block', 'Note Block', 'Redstone', 'note_block', { rs: 'note' });
  add('hopper', 'Hopper', 'Redstone', { top: 'hopper_top', side: 'hopper_side', bottom: 'hopper_top' }, { dir: 'hopper', solid: false, rs: 'container' });
  add('dispenser', 'Dispenser', 'Redstone', { side: 'furnace_side', front: 'dispenser_front', top: 'furnace_top' }, { dir: 'all6', rs: 'dispenser' });
  add('dropper', 'Dropper', 'Redstone', { side: 'furnace_side', front: 'dropper_front', top: 'furnace_top' }, { dir: 'all6', rs: 'dispenser' });
  add('daylight_sensor', 'Daylight Sensor', 'Redstone', { top: 'daylight_top', side: 'oak_planks' }, { form: 'low', solid: false, rs: 'daylight' });
  add('slime_block', 'Slime Block', 'Redstone', 'slime_block', { clear: true });
  add('rail', 'Rail', 'Redstone', 'rail', { form: 'flat', dir: 'h4', solid: false, clear: true });
  add('powered_rail', 'Powered Rail', 'Redstone', 'powered_rail', { form: 'flat', dir: 'h4', solid: false, clear: true, rs: 'prail' });

  BP.BLOCKS = B;
  BP.BLOCK = Object.fromEntries(B.map((b) => [b.id, b]));
  BP.CATS = [...new Set(B.map((b) => b.cat))];

  // texture for a face. face: top|bottom|side|front|back
  BP.faceTex = function (def, face) {
    const t = def.tex;
    if (face === 'front') return t.front || t.side || t.all;
    if (face === 'back') return t.back || t.side || t.all;
    if (face === 'top') return t.top || t.all || t.side;
    if (face === 'bottom') return t.bottom || t.top || t.all || t.side;
    return t.side || t.all;
  };

  // ---------- directions ----------
  BP.DIRS = {
    n: [0, 0, -1], s: [0, 0, 1], e: [1, 0, 0], w: [-1, 0, 0], u: [0, 1, 0], d: [0, -1, 0],
  };
  BP.OPP = { n: 's', s: 'n', e: 'w', w: 'e', u: 'd', d: 'u' };
  BP.CW = { n: 'e', e: 's', s: 'w', w: 'n', u: 'u', d: 'd' };
  BP.DIR_NAME = { n: 'North', e: 'East', s: 'South', w: 'West', u: 'Up', d: 'Down' };
  BP.dirChoices = function (def, shape) {
    if (shape === 'stair' || shape === 'stairT') return ['n', 'e', 's', 'w'];
    switch (def.dir) {
      case 'h4': return ['n', 'e', 's', 'w'];
      case 'all6': return ['n', 'e', 's', 'w', 'u', 'd'];
      case 'wall': return ['u', 'n', 'e', 's', 'w'];
      case 'hopper': return ['d', 'n', 'e', 's', 'w'];
      default: return null;
    }
  };

  // ---------- image cache (loaded once) ----------
  BP.IMG = {};
  BP.texReady = Promise.all(Object.entries(TEX).map(([k, url]) => new Promise((res) => {
    const im = new Image();
    im.onload = () => { BP.IMG[k] = im; res(); };
    im.onerror = () => res();
    im.src = url;
  }))).then(() => {
    // average color for each block (used for far zoom and the minimap)
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const g = c.getContext('2d', { willReadFrequently: true });
    for (const b of B) {
      const im = BP.IMG[BP.faceTex(b, 'top')];
      if (!im) { b.color = '#888'; continue; }
      g.clearRect(0, 0, 16, 16); g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, 16, 16).data;
      let r = 0, gg = 0, bl = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 40) { r += d[i]; gg += d[i + 1]; bl += d[i + 2]; n++; }
      b.color = n ? `rgb(${r / n | 0},${gg / n | 0},${bl / n | 0})` : '#888';
    }
  });
})();
