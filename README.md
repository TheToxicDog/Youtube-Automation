# Blockwright

A Minecraft build planner that runs in the browser and is built for touch: iPhone in portrait,
iPad with Apple Pencil, and desktop with mouse and keyboard.

Plan layer by layer in a top-down view, check height and shape in a live 3D view, generate roofs,
and test redstone circuits with a built-in power preview.

## Features

- **Shapes:** rectangles, squares, circles and ovals (outline or filled, wall thickness, draw from
  center), lines, flood fill, brush sizes. **Height** extrudes a shape up many layers at once, so a
  rectangle outline with height 5 is a set of walls.
- **Layers:** step up and down, faded ghost of the layers below, outline of the layer above,
  copy a layer up, clear a layer.
- **3D view:** textured, orbit/zoom/pan by touch or mouse, Iso/Top/Front/Side presets, cut-away at
  the current layer. Tap to place or erase blocks in 3D.
- **Roof creator:** gable, hip, shed, barn (gambrel), flat with rim, dome, cone and pyramid.
  Gentle (slabs), standard (stairs) or steep pitch, 0–2 block overhang, trim block, gable wall
  fill, live preview in both views.
- **Redstone:** dust, repeaters (1–4 tick delay), comparators, torches, levers, buttons, plates,
  observers, pistons, lamps, targets, hoppers, droppers and more. The power preview simulates
  signal strength and timing tick by tick (play, pause, step, slow motion), and the Hand tool flips
  levers and changes delays. Includes ready-made circuits (NOT, OR, AND, repeater clock, observer
  clock, piston pair, long line), a delay calculator and a quick reference.
- **Quality of life:** undo/redo (two- and three-finger taps on touch), mirror symmetry, select /
  copy / cut / paste / rotate / flip / swap block / build walls, eyedropper, measure tool, notes
  pinned to blocks, recent-block hotbar (keys 1–9), stairs/slab shapes and facing, live
  dimensions while drawing, real world coordinates and chunk borders, material list in stacks and
  shulker boxes with collected checkboxes.
- **Share, export, import:** compressed share codes, short codes (when hosted as a Claude
  artifact), `.json` design files, a layer-by-layer PNG guide, a 3D PNG picture, drag-and-drop
  import. Designs autosave; multiple designs are kept on the device and sync to your account when
  available.

## Apple Pencil and touch

The first time an Apple Pencil touches the screen, Blockwright switches to Pencil mode: the Pencil
draws, one finger moves the plan, two fingers pinch. Hovering an iPad Pencil shows a ghost of the
block. You can force the mode in Settings.

## Running it

Open `index.html` through any static web server, for example:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

`python3 tools/build_standalone.py` writes `dist/blockwright.html`, a single file with all
scripts and textures inlined.

`python3 tools/build_textures.py` regenerates `js/textures.js` after adding PNGs to
`assets/textures/`.

## Layout

| Path | What it holds |
| --- | --- |
| `index.html` | Page markup, styles, icons |
| `js/blocks.js` | Block list, procedural redstone textures |
| `js/model.js` | World, undo history, shapes, roof generator, share codes |
| `js/redstone.js` | Power simulator and circuit templates |
| `js/view2d.js` | Top-down canvas view and touch/Pencil input |
| `js/view3d.js` | three.js 3D view |
| `js/app.js` | Tools, state, storage, keyboard |
| `js/panels.js` | Panels: blocks, layers, roof, redstone, materials, designs, share, settings |

See `CREDITS.md` for texture licenses.
