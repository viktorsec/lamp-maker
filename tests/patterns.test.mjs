import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../vendor/three/three.module.js';
import { buildBoxModel } from '../preview3d.js';

// Run the actual drawing generators with the defaults from the form, before
// the browser-only preview and event handlers are initialized.
const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function generators(pattern = 'goma') {
  const inputs = new Map([...html.matchAll(/<input\b[^>]*id="([^"]+)"[^>]*value="([^"]*)"[^>]*>/g)]
    .map(([, id, value]) => [`#${id}`, { value, defaultValue: value, validity: {} }]));
  inputs.set('#kumiko-pattern', { value: pattern });
  inputs.set('#kumiko-combine', { checked: false });
  inputs.set('#kumiko-second-pattern', { value: 'asanoha' });
  inputs.set('#kumiko-combination-layout', { value: 'bands' });
  for (const input of inputs.values()) input.setAttribute = function(name, value) { this[name] = value; };
  const context = vm.createContext({ document: { querySelector: selector => {
    if (!inputs.has(selector)) inputs.set(selector, { style: {}, setAttribute(name, value) { this[name] = value; } });
    return inputs.get(selector);
  } } });
  vm.runInContext(source.slice(0, source.indexOf('function matingPath(')), context);
  return { context, set: (id, value) => {
    const input = inputs.get(`#${id}`);
    if ('checked' in input) input.checked = Boolean(value);
    else input.value = String(value);
  } };
}

test('exact sizing derives panel dimensions from cell size and complete row repeats', () => {
  for (const pattern of ['triangular', 'asanoha', 'goma', 'sakura', 'rindo', 'kagome', 'tsumiishi-kikko',
    'kakuasa', 'masu', 'masu-tsunagi', 'shokko', 'diamond', 'senbon']) {
    const { context, set } = generators(pattern);
    vm.runInContext('dimensionsLinked = false', context);
    set('kumiko-rows', 8);
    const layout = context.syncPatternSizing();
    const drawing = context.kumikoDrawing();
    assert.ok(Math.abs(drawing.width - 150) < 1e-8);
    assert.ok(Math.abs(drawing.height - (14 + 8 * layout.rowHeight)) < 1e-8);
    assert.ok(Math.abs((drawing.height - 14) / layout.rowHeight - 8) < 1e-8);
    assert.equal(drawing.width, Number(context.document.querySelector('#assembly-width').value));
    assert.equal(drawing.height, Number(context.document.querySelector('#assembly-height').value));
    assert.equal(context.document.querySelector('#kumiko-cell-count').value, '5');
    assert.doesNotMatch(context.generateSvg(drawing), /NaN|Infinity/);
  }
});

test('golden ratio chooses the nearest whole repeat and manual rows reject incomplete values', () => {
  const { context, set } = generators('asanoha');
  context.syncPatternSizing();
  assert.equal(context.document.querySelector('#kumiko-rows').value, '10');
  assert.ok(Math.abs(Number(context.document.querySelector('#kumiko-height').value) - 249.5589098293673) < 1e-8);
  vm.runInContext('dimensionsLinked = false', context);
  for (const rows of ['', 0, 3, 201]) {
    set('kumiko-rows', rows);
    assert.throws(() => context.syncPatternSizing(), /rows/);
  }
  set('kumiko-rows', 12);
  context.syncPatternSizing();
  assert.equal(context.document.querySelector('#kumiko-rows').value, '12');
});

test('triangular wall motifs retain equilateral cells, including Rindo', () => {
  for (const pattern of ['triangular', 'asanoha', 'goma', 'sakura', 'rindo', 'tsumiishi-kikko']) {
    const { context } = generators(pattern);
    for (const [width, height, surface] of [[150, 243, 'wall'], [150, 150, 'wall'], [213, 105, 'wall']]) {
      let count = 0;
      const drawing = context.kumikoDrawing({ pattern, panelWidth: width, panelHeight: height, surface,
        trianglePattern(triangle) {
          const sides = triangle.map((a, i) => Math.hypot(a[0] - triangle[(i + 1) % 3][0], a[1] - triangle[(i + 1) % 3][1]));
          assert.ok(Math.max(...sides) - Math.min(...sides) < 1e-8, pattern);
          count++;
          return 'triangular';
        } });
      assert.ok(count > 0);
      assert.ok(Math.abs(drawing.grid.rowHeight / drawing.grid.pitch - Math.sqrt(3) / 2) < 1e-10);
    }
  }
});

test('square lid uses the original uniform row fitting while square cells remain unchanged', () => {
  const { context } = generators('triangular');
  const canonical = polygons => Array.from(polygons, points => Array.from(points, ([x, y]) => `${x.toFixed(5)},${y.toFixed(5)}`).sort().join(';')).sort();
  for (const cellCount of [3, 4, 5, 6]) {
    const drawing = context.kumikoDrawing({ panelWidth: 150, panelHeight: 150, cellCount, surface: 'top' });
    const reflected = drawing.openingPolygons.map(points => points.map(([x, y]) => [x, 150 - y]));
    assert.deepEqual(canonical(drawing.openingPolygons), canonical(reflected));
    assert.ok(Math.abs(drawing.grid.rowHeight * drawing.grid.rows - 136) < 1e-8);
    assert.equal(drawing.grid.rows % 2, 0);
  }
  const square = context.kumikoDrawing({ pattern: 'masu', panelWidth: 150, panelHeight: 150, cellCount: 5, surface: 'top' });
  assert.equal(square.openingPolygons.length, 25, 'Square grids need no half-cell cropping on a square lid');
});

test('lid restores the original repeat counts and keeps every base triangle uniform', () => {
  for (const [cellCount, expectedRows, rindoRows] of [[3, 4, 2], [4, 4, 4], [5, 6, 4], [6, 6, 6], [9, 10, 10]]) {
    const { context } = generators('asanoha');
    let firstSides;
    const lid = context.kumikoDrawing({ panelWidth: 150, panelHeight: 150, cellCount, surface: 'top',
      trianglePattern(triangle) {
        const sides = Array.from(triangle, (a, i) => Math.hypot(a[0] - triangle[(i + 1) % 3][0], a[1] - triangle[(i + 1) % 3][1])).sort((a, b) => a - b);
        firstSides ??= sides;
        assert.ok(sides.every((length, i) => Math.abs(length - firstSides[i]) < 1e-8), 'The lid must not introduce special edge or transition cells');
        return 'triangular';
      } });
    assert.equal(lid.grid.rows, expectedRows);
    assert.equal(lid.grid.originY, 7);
    assert.ok(Math.abs(lid.grid.rowHeight * expectedRows - 136) < 1e-8);
    const rindo = context.kumikoDrawing({ pattern: 'rindo', panelWidth: 150, panelHeight: 150, cellCount, strut: 0.5, infillStrut: 0.5, surface: 'top' });
    assert.equal(rindo.grid.rows, rindoRows);
    const wall = context.kumikoDrawing({ panelWidth: 150, panelHeight: 250, cellCount });
    assert.ok(Math.abs(wall.grid.rowHeight - wall.grid.pitch * Math.sqrt(3) / 2) < 1e-8);
  }
});

test('lid combinations keep their motifs on the same fitted grid', () => {
  for (const layout of ['islands', 'interlock']) {
    const { context, set } = generators('asanoha');
    set('kumiko-combine', true);
    set('kumiko-second-pattern', 'rindo');
    set('kumiko-combination-layout', layout);
    const options = { panelWidth: 150, panelHeight: 150, surface: 'top' };
    const combined = context.kumikoDrawing(options);
    const plain = context.kumikoDrawing({ ...options, pattern: 'triangular', combine: false, trianglePatterns: ['asanoha', 'rindo'] });
    assert.deepEqual(combined.grid, plain.grid);
    assert.ok(combined.combination.counts.background > 0 && combined.combination.counts.accent > 0);
    assert.doesNotMatch(context.generateSvg(combined), /NaN|Infinity/);
  }
});

test('snapped mixed bands use complete repeats at both frame edges and the divider', () => {
  for (const [first, second] of [['asanoha', 'goma'], ['diamond', 'asanoha'], ['kakuasa', 'sakura'], ['senbon', 'masu'], ['shokko', 'masu'], ['masu', 'shokko']]) {
    for (const position of [1, 2, 3]) {
      const { context, set } = generators(first);
      set('kumiko-combine', true);
      set('kumiko-second-pattern', second);
      set('kumiko-split', position);
      const layout = context.syncPatternSizing();
      const drawing = context.kumikoDrawing();
      assert.ok(Math.abs(drawing.height - 14 - layout.topSpan - layout.bottomSpan) < 1e-8);
      assert.ok(Math.abs(drawing.combination.split - 7 - layout.topSpan) < 1e-8);
      assert.equal(layout.topRows % context.latticeSpec(first, 27.2).rowStep, 0);
      assert.equal(layout.bottomRows % context.latticeSpec(second, 27.2).rowStep, 0);
      for (const points of drawing.openingPolygons) {
        const ys = points.map(p => p[1]);
        assert.ok(Math.max(...ys) <= drawing.combination.split - 1 + 1e-8
          || Math.min(...ys) >= drawing.combination.split + 1 - 1e-8);
      }
      const assembly = context.assemblyDrawing();
      assert.ok(Math.abs(assembly.model.panelHeight - drawing.height) < 1e-8);
      assert.doesNotMatch(context.generateSvg(assembly), /NaN|Infinity/);
    }
  }
});

test('shared motifs retain the same snapped grid, independently of their infill', () => {
  const { context, set } = generators('asanoha');
  set('kumiko-combine', true);
  set('kumiko-combination-layout', 'interlock');
  set('kumiko-second-pattern', 'rindo');
  context.syncPatternSizing();
  const drawing = context.kumikoDrawing();
  const plain = context.kumikoDrawing({ pattern: 'triangular', combine: false });
  assert.deepEqual(drawing.grid, plain.grid);
  set('kumiko-infill-strut', 1);
  assert.deepEqual(context.kumikoDrawing().grid, plain.grid);
  const assembly = context.assemblyDrawing();
  assert.equal(assembly.model.panelHeight, drawing.height);
});

test('band positions visit every valid whole-repeat divider', () => {
  for (const [first, second] of [['asanoha', 'goma'], ['masu', 'shokko'], ['kakuasa', 'sakura']]) {
    const { context, set } = generators(first);
    vm.runInContext('dimensionsLinked = false', context);
    set('kumiko-combine', true);
    set('kumiko-second-pattern', second);
    set('kumiko-rows', 10);
    const positions = context.bandPositions(first, 27.2, 10, second);
    let previous = 0;
    for (let position = 1; position <= positions.length; position++) {
      set('kumiko-split', position);
      context.syncPatternSizing();
      const drawing = context.kumikoDrawing();
      assert.equal(drawing.combination.position, position);
      assert.ok(drawing.combination.split > previous);
      previous = drawing.combination.split;
      assert.equal(context.document.querySelector('#kumiko-split').max, String(positions.length));
      assert.ok(positions[position - 1].topRows > 0 && positions[position - 1].bottomRows > 0);
    }
  }
});

test('band position clamps when rows shrink to one valid divider', () => {
  const { context, set } = generators('asanoha');
  vm.runInContext('dimensionsLinked = false', context);
  set('kumiko-combine', true);
  set('kumiko-second-pattern', 'goma');
  set('kumiko-rows', 10);
  set('kumiko-split', 4);
  context.syncPatternSizing();
  set('kumiko-rows', 4);
  context.syncPatternSizing();
  const input = context.document.querySelector('#kumiko-split');
  assert.equal(input.value, '1');
  assert.equal(input.max, '1');
  assert.equal(input.disabled, true);
  assert.equal(context.kumikoDrawing().combination.position, 1);
});

for (const [pattern, name, vertexCounts] of [
  ['goma', 'Goma', [3, 4]],
  ['sakura', 'Sakura', [3, 5]],
  ['shokko', 'Shokko', [4, 5]],
  ['senbon', 'Senbon', [4]],
  ['tsumiishi-kikko', 'Tsumiishi kikko', [4]],
  ['kakuasa', 'Kakuasa', [3]],
  ['kagome', 'Kagome', [3, 6]],
  ['masu-tsunagi', 'Masu-tsunagi', [3, 4, 5]],
  ['rindo', 'Rindō', [3, 6]],
  ['masu', 'Masu', [4]]
]) {
  test(`${name} produces convex, non-overlapping cutouts within the frame`, () => {
    assert.ok(html.includes(`<option value="${pattern}">${name} /`));
    const { context } = generators(pattern);
    const drawing = context.kumikoDrawing();
    assert.equal(drawing.patternName, name);
    assert.ok(drawing.filename.startsWith(`kumiko-${pattern}-`));
    for (const count of vertexCounts) assert.ok(drawing.openingPolygons.some(points => points.length === count));
    for (const points of drawing.openingPolygons) {
      assert.ok(context.polygonArea(points) > 0.01);
      points.forEach((p, i) => {
        assert.ok(p.every(Number.isFinite));
        assert.ok(p[0] >= 8 - 1e-8 && p[0] <= drawing.width - 8 + 1e-8);
        assert.ok(p[1] >= 8 - 1e-8 && p[1] <= drawing.height - 8 + 1e-8);
        const q = points[(i + 1) % points.length], r = points[(i + 2) % points.length];
        assert.ok((q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0]) >= -1e-8);
      });
    }
    const bounds = drawing.openingPolygons.map(points => [
      Math.min(...points.map(p => p[0])), Math.max(...points.map(p => p[0])),
      Math.min(...points.map(p => p[1])), Math.max(...points.map(p => p[1]))
    ]);
    drawing.openingPolygons.forEach((points, i) => {
      for (let j = i + 1; j < bounds.length; j++) {
        const a = bounds[i], b = bounds[j];
        if (a[1] <= b[0] || b[1] <= a[0] || a[3] <= b[2] || b[3] <= a[2]) continue;
        let overlap = drawing.openingPolygons[j];
        points.forEach((p, k) => {
          const q = points[(k + 1) % points.length];
          overlap = context.clipPolygon(overlap, r => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
        });
        assert.ok(context.polygonArea(overlap) < 1e-8, 'Cutouts must not overlap');
      }
    });
  });

  test(`${name} fits kerf-compensated wall and top cutouts and builds the 3D box`, () => {
    const { context } = generators(pattern);
    const drawing = context.assemblyDrawing();
    assert.ok(drawing.filename.startsWith(`assembly-${pattern}-`));
    for (const panel of drawing.panels) {
      if (panel.name === 'Bottom') continue;
      assert.ok(panel.openings.length > 0);
      for (const opening of panel.openings) {
        assert.ok(context.polygonArea(opening.cutPoints) < context.polygonArea(opening.points));
      }
    }
    const material = new THREE.MeshBasicMaterial();
    const box = buildBoxModel(drawing, [material, material]);
    assert.equal(box.children.length, 6);
    box.traverse(object => {
      if (!object.geometry) return;
      assert.ok(object.geometry.attributes.position.array.every(Number.isFinite));
      object.geometry.dispose();
    });
    material.dispose();
  });

  test(`${name} rejects collapsed strips${pattern === 'senbon' ? '' : ' and excessive pattern density'}`, () => {
    const { context, set } = generators(pattern);
    if (pattern === 'senbon' || pattern === 'masu') set('kumiko-cell-count', 10);
    set('kumiko-strut', 20);
    assert.throws(() => context.kumikoDrawing(), /Reduce the lattice width/);
    if (pattern === 'senbon') return;
    set('kumiko-strut', 0.5);
    set('kumiko-cell-count', 100);
    assert.throws(() => context.kumikoDrawing(), /Pattern is too dense/);
  });
}

test('Kakuasa square cells keep the traditional 22.5 degree leaf branches', () => {
  const { context } = generators('kakuasa');
  for (const cellCount of [2, 3, 5]) {
    const drawing = context.kumikoDrawing({ panelWidth: 150, panelHeight: 150, cellCount, strut: 1 });
    const angles = drawing.openingPolygons.flatMap(points => points.map((p, i) => {
      const q = points[(i + 1) % points.length];
      return (Math.atan2(q[1] - p[1], q[0] - p[0]) * 180 / Math.PI + 180) % 180;
    }));
    for (const angle of angles) {
      assert.ok(Math.abs(angle / 22.5 - Math.round(angle / 22.5)) < 1e-8,
        `Unexpected Kakuasa edge angle: ${angle}`);
    }
    for (const branch of [22.5, 67.5, 112.5, 157.5]) {
      assert.ok(angles.some(angle => Math.abs(angle - branch) < 1e-8), `Missing ${branch} degree branches`);
    }
  }
});

test('infill width enlarges motif openings without moving the main Asanoha lattice', () => {
  const { context } = generators('asanoha');
  const wide = context.kumikoDrawing({ infillStrut: 2 });
  const thin = context.kumikoDrawing({ infillStrut: 1 });
  assert.equal(thin.openingPolygons.length, wide.openingPolygons.length);
  assert.ok(thin.openingPolygons.reduce((sum, p) => sum + context.polygonArea(p), 0)
    > wide.openingPolygons.reduce((sum, p) => sum + context.polygonArea(p), 0));
  const horizontalEdges = drawing => [...new Set(drawing.openingPolygons.flatMap(points => points.flatMap((p, i) => {
    const q = points[(i + 1) % points.length];
    return Math.abs(p[1] - q[1]) < 1e-8 ? [p[1].toFixed(6)] : [];
  })))].sort();
  assert.deepEqual(horizontalEdges(thin), horizontalEdges(wide));
});

test('infill width applies only to motifs and visibility follows both selected patterns', () => {
  for (const pattern of ['asanoha', 'goma', 'sakura', 'tsumiishi-kikko', 'rindo', 'kakuasa', 'masu-tsunagi', 'shokko',
    'senbon', 'masu', 'diamond', 'triangular', 'kagome']) {
    const { context, set } = generators(pattern);
    const applicable = !['senbon', 'masu', 'diamond', 'triangular', 'kagome'].includes(pattern);
    const controls = {};
    const originalQuery = context.document.querySelector;
    context.document.querySelector = selector => selector === '#kumiko-infill-controls' ? controls : originalQuery(selector);
    context.syncInfillControls();
    assert.equal(controls.hidden, !applicable, pattern);
    const thin = context.kumikoDrawing({ infillStrut: 1 });
    const wide = context.kumikoDrawing({ infillStrut: 2 });
    assert.equal(thin.content === wide.content, !applicable, pattern);
    set('kumiko-infill-strut', '');
    if (applicable) assert.throws(() => context.kumikoDrawing(), /infill lattice width/);
    else assert.doesNotThrow(() => context.kumikoDrawing());
    set('kumiko-combine', true);
    context.syncInfillControls();
    assert.equal(controls.hidden, false, 'Asanoha accent must expose infill width');
  }
});

test('infill edits reach combined panels, kerf-compensated assembly and reject collapsed openings', () => {
  for (const layout of ['bands', 'islands', 'interlock']) {
    const { context, set } = generators('asanoha');
    set('kumiko-combine', true);
    set('kumiko-second-pattern', 'goma');
    set('kumiko-combination-layout', layout);
    set('kumiko-infill-strut', 1);
    const thin = context.assemblyDrawing();
    set('kumiko-infill-strut', 2);
    const wide = context.assemblyDrawing();
    for (const panel of thin.panels.filter(panel => panel.name !== 'Bottom')) {
      assert.notEqual(JSON.stringify(panel.openings), JSON.stringify(wide.panels.find(p => p.name === panel.name).openings));
      for (const opening of panel.openings) assert.ok(context.polygonArea(opening.cutPoints) < context.polygonArea(opening.points));
    }
    for (const value of [0, 21, '']) {
      set('kumiko-infill-strut', value);
      assert.throws(() => context.kumikoDrawing(), /infill lattice width/);
    }
    set('kumiko-infill-strut', 20);
    assert.throws(() => context.kumikoDrawing(), /Reduce the lattice width or infill/);
  }
});

test('Senbon keeps equally spaced slots at full height as dimensions and density change', () => {
  const { context, set } = generators('senbon');
  for (const [width, height, count] of [[150, 243, 5], [243, 150, 8], [150, 1000, 100], [150, 243, 1]]) {
    set('kumiko-width', width);
    set('kumiko-height', height);
    set('kumiko-cell-count', count);
    set('kumiko-strut', 0.5);
    const drawing = context.kumikoDrawing();
    assert.equal(drawing.openingPolygons.length, count);
    const slotWidth = (width - 16 + 0.5) / count - 0.5;
    drawing.openingPolygons.forEach((points, index) => {
      const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
      assert.ok(Math.abs(Math.min(...xs) - (8 + index * (slotWidth + 0.5))) < 1e-8);
      assert.ok(Math.abs(Math.max(...xs) - Math.min(...xs) - slotWidth) < 1e-8);
      assert.equal(Math.min(...ys), 8);
      assert.equal(Math.max(...ys), height - 8);
    });
    assert.doesNotMatch(context.generateSvg(drawing), /NaN|Infinity/);
  }
});

test('new pattern exports remain valid on square, wide and tall panels', () => {
  for (const pattern of ['kakuasa', 'kagome', 'masu-tsunagi', 'rindo', 'masu']) {
    const { context, set } = generators(pattern);
    set('kumiko-strut', 0.5);
    for (const [width, height, count] of [[120, 120, 3], [240, 120, 4], [120, 360, 3], [120, 200, 1]]) {
      set('kumiko-width', width);
      set('kumiko-height', height);
      set('kumiko-cell-count', count);
      const drawing = context.kumikoDrawing();
      assert.ok(drawing.openingPolygons.length > 0);
      assert.doesNotMatch(context.generateSvg(drawing), /NaN|Infinity/);
      for (const points of drawing.openingPolygons) {
        for (const [x, y] of points) {
          assert.ok(x >= 8 - 1e-8 && x <= width - 8 + 1e-8);
          assert.ok(y >= 8 - 1e-8 && y <= height - 8 + 1e-8);
        }
      }
    }
  }
});


test('bottom cord notch defaults to 8 mm and stays centered with kerf compensation', () => {
  const { context, set } = generators();
  assert.equal(context.assemblyDrawing().model.cordDiameter, 8);
  for (const tabs of [2, 4]) {
    set('assembly-bottom-fingers', tabs);
    for (const diameter of [4, 8, 12]) {
      set('assembly-bottom-cord-diameter', diameter);
      const drawing = context.assemblyDrawing();
      const bottom = drawing.panels.find(panel => panel.name === 'Bottom');
      const { panelWidth: width, thickness } = drawing.model;
      const center = width / 2;
      const radius = diameter / 2;
      const arc = bottom.points.filter(([x, y]) => x >= center - radius - 1e-8 && x <= center + radius + 1e-8 && y > thickness);
      assert.equal(arc.length, 65);
      arc.forEach(([x, y]) => assert.ok(Math.abs(Math.hypot(x - center, y - thickness - radius) - radius) < 1e-8));
      assert.ok(Math.abs(Math.max(...arc.map(p => p[1])) - thickness - diameter) < 1e-8);
      const kerf = 0.1;
      const cutArc = bottom.cutPoints.filter(([x, y]) => x >= center - radius && x <= center + radius && y > thickness);
      assert.equal(cutArc.length, 65);
      cutArc.forEach(([x, y]) => assert.ok(Math.abs(Math.hypot(x - center, y - thickness - radius) - (radius - kerf / 2)) < 1e-8));
      assert.ok(bottom.path.includes('L'));
      assert.doesNotMatch(context.generateSvg(drawing), /NaN|Infinity/);
      const material = new THREE.MeshBasicMaterial();
      const box = buildBoxModel(drawing, [material, material], material);
      const bottomMesh = box.children.find(mesh => mesh.name === 'Bottom');
      const ray = new THREE.Raycaster(new THREE.Vector3(center, -(thickness + radius), thickness + 1), new THREE.Vector3(0, 0, -1));
      bottomMesh.position.set(0, 0, 0);
      bottomMesh.rotation.set(0, 0, 0);
      bottomMesh.updateMatrixWorld(true);
      assert.equal(ray.intersectObject(bottomMesh, true).length, 0, 'Wood and paper must leave the cord exit open');
      box.traverse(object => object.geometry?.dispose());
      material.dispose();
    }
  }
});

test('cord diameter rejects invalid values and collisions with bottom fingers', () => {
  const { context, set } = generators();
  for (const value of ['', 0, -1, 101, 'NaN']) {
    set('assembly-bottom-cord-diameter', value);
    assert.throws(() => context.assemblyDrawing(), /cord diameter/i);
  }
  set('assembly-bottom-cord-diameter', 30);
  assert.throws(() => context.assemblyDrawing(), /fewer bottom fingers/);
});


test('assembly shares the bottom frame with finger clearance when calculating total height', () => {
  const { context, set } = generators();
  for (const [under, over, legs] of [[10, 10, 10], [18, 7, 15], [5, 25, 8]]) {
    set('assembly-bottom-offset', under);
    set('assembly-bottom-over', over);
    set('assembly-leg-height', legs);
    const drawing = context.assemblyDrawing();
    const { model } = drawing;
    assert.equal(model.bodyHeight, model.panelHeight - model.frameWidth + over + model.thickness + under);
    assert.equal(model.totalHeight, model.bodyHeight + legs);
    const front = drawing.panels.find(panel => panel.name === 'Front');
    assert.ok(Math.abs(front.windows[0].points[0][1] - (model.panelHeight - model.frameWidth + over)) < 1e-8);
    assert.ok(Math.abs(front.windows[0].points[2][1] - (model.panelHeight - model.frameWidth + over + model.thickness)) < 1e-8);
    assert.equal(Math.max(...front.points.map(point => point[1])), model.totalHeight);
    assert.ok(front.openings.every(opening => opening.points.every(point => point[1] <= model.panelHeight - 8)));
    const paperMaterial = new THREE.MeshBasicMaterial();
    const box = buildBoxModel(drawing, [paperMaterial, paperMaterial], paperMaterial);
    box.children.find(panel => panel.name === 'Front').children[0].geometry.computeBoundingBox();
    const paperBounds = box.children.find(panel => panel.name === 'Front').children[0].geometry.boundingBox;
    assert.ok(Math.abs(paperBounds.min.y + model.panelHeight - model.frameWidth + over) < 1e-4);
    box.traverse(object => object.geometry?.dispose());
    paperMaterial.dispose();
  }
});

test('assembly rejects missing or invalid finger clearances', () => {
  for (const id of ['assembly-bottom-offset', 'assembly-bottom-over']) {
    const { context, set } = generators();
    for (const value of ['', 0, -5, 1001]) {
      set(id, value);
      assert.throws(() => context.assemblyDrawing(), /clearance/i);
    }
  }
});


test('frame width does not add an extra gap above bottom fingers', () => {
  const { context, set } = generators('senbon');
  for (const frame of [4, 8, 12]) {
    set('kumiko-frame', frame);
    set('assembly-bottom-over', 10);
    set('assembly-bottom-offset', 10);
    const drawing = context.assemblyDrawing();
    const wall = drawing.panels.find(panel => panel.name === 'Front');
    const patternBottom = Math.max(...wall.openings.flatMap(opening => opening.points.map(point => point[1])));
    assert.equal(wall.windows[0].points[0][1] - patternBottom, 10);
    assert.equal(drawing.model.totalHeight, drawing.model.panelHeight - frame + 10 + 3 + 10 + 10);
  }
});


test('experimental combinations keep closed openings separated by a solid rail', () => {
  for (const [top, bottom] of [['diamond', 'asanoha'], ['goma', 'senbon'], ['kagome', 'masu'], ['rindo', 'sakura']]) {
    const { context, set } = generators(top);
    const original = context.kumikoDrawing();
    set('kumiko-combine', true);
    set('kumiko-second-pattern', bottom);
    for (const position of [1, 2, 3]) {
      set('kumiko-split', position);
      const drawing = context.kumikoDrawing();
      const { split, rail } = drawing.combination;
      let upper = 0, lower = 0;
      for (const points of drawing.openingPolygons) {
        assert.ok(context.polygonArea(points) > 0.01);
        const ys = points.map(point => point[1]);
        if (Math.max(...ys) <= split - rail / 2 + 1e-8) upper++;
        else {
          assert.ok(Math.min(...ys) >= split + rail / 2 - 1e-8, 'No opening crosses the rail');
          lower++;
        }
        points.forEach(([x, y]) => {
          assert.ok(x >= 8 - 1e-8 && x <= drawing.width - 8 + 1e-8);
          assert.ok(y >= 8 - 1e-8 && y <= drawing.height - 8 + 1e-8);
        });
      }
      assert.ok(upper > 0 && lower > 0);
      assert.doesNotMatch(context.generateSvg(drawing), /NaN|Infinity/);
      assert.ok(drawing.filename.includes(`${bottom}-position-${position}`));
    }
    const thumbnail = context.kumikoDrawing({ pattern: top });
    assert.equal(thumbnail.combination, undefined);
    assert.equal(thumbnail.content, original.content);
    set('kumiko-combine', false);
    assert.equal(context.kumikoDrawing().content, original.content);
  }
});

test('combined patterns export kerf-compensated assembly panels and build the 3D model', () => {
  const { context, set } = generators('diamond');
  set('kumiko-combine', true);
  set('kumiko-second-pattern', 'asanoha');
  const drawing = context.assemblyDrawing();
  assert.equal(drawing.patternName, 'Hishi + Asanoha');
  assert.ok(drawing.filename.includes('asanoha-position-4'));
  for (const panel of drawing.panels.filter(panel => panel.name !== 'Bottom')) {
    assert.ok(panel.openings.length > 0);
    panel.openings.forEach(opening => assert.ok(context.polygonArea(opening.cutPoints) < context.polygonArea(opening.points)));
  }
  const material = new THREE.MeshBasicMaterial();
  const box = buildBoxModel(drawing, [material, material]);
  box.traverse(object => {
    if (!object.geometry) return;
    assert.ok(object.geometry.attributes.position.array.every(Number.isFinite));
    object.geometry.dispose();
  });
  material.dispose();
});

test('combination split rejects incomplete and out-of-range input', () => {
  const { context, set } = generators();
  set('kumiko-combine', true);
  for (const position of ['', 0, 1.5, 999, 'NaN']) {
    set('kumiko-split', position);
    assert.throws(() => context.kumikoDrawing(), /band position/);
  }
});


for (const layout of ['islands', 'interlock']) {
  test(`${layout} combines compatible motifs on one connected triangular lattice`, () => {
    for (const [background, accent] of [['triangular', 'asanoha'], ['goma', 'sakura'], ['tsumiishi-kikko', 'rindo']]) {
      const { context, set } = generators(background);
      set('kumiko-combine', true);
      set('kumiko-combination-layout', layout);
      set('kumiko-second-pattern', accent);
      const drawing = context.kumikoDrawing();
      assert.equal(drawing.combination.layout, layout);
      assert.ok(drawing.combination.counts.background > 0);
      assert.ok(drawing.combination.counts.accent > 0);
      assert.ok(drawing.filename.includes(layout));
      const polygons = drawing.openingPolygons;
      const bounds = polygons.map(points => [Math.min(...points.map(p => p[0])), Math.max(...points.map(p => p[0])),
        Math.min(...points.map(p => p[1])), Math.max(...points.map(p => p[1]))]);
      polygons.forEach((points, index) => {
        assert.ok(points.every(([x, y]) => x >= 8 - 1e-8 && x <= drawing.width - 8 + 1e-8 && y >= 8 - 1e-8 && y <= drawing.height - 8 + 1e-8));
        assert.ok(context.polygonArea(points) > 0.01);
        for (let other = index + 1; other < polygons.length; other++) {
          const a = bounds[index], b = bounds[other];
          if (a[1] <= b[0] || b[1] <= a[0] || a[3] <= b[2] || b[3] <= a[2]) continue;
          let overlap = polygons[other];
          points.forEach((p, i) => {
            const q = points[(i + 1) % points.length];
            overlap = context.clipPolygon(overlap, r => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
          });
          assert.ok(context.polygonArea(overlap) < 1e-8, 'Infill openings cannot overlap');
        }
      });
      const assembly = context.assemblyDrawing();
      assert.ok(assembly.filename.includes(layout));
      const material = new THREE.MeshBasicMaterial();
      const box = buildBoxModel(assembly, [material, material]);
      box.traverse(object => {
        if (!object.geometry) return;
        assert.ok(object.geometry.attributes.position.array.every(Number.isFinite));
        object.geometry.dispose();
      });
      material.dispose();
      assert.doesNotMatch(context.generateSvg(assembly), /NaN|Infinity/);
    }
  });
}

test('shared-lattice layouts reject incompatible patterns rather than clipping unrelated grids', () => {
  const { context, set } = generators('diamond');
  set('kumiko-combine', true);
  set('kumiko-combination-layout', 'islands');
  assert.throws(() => context.kumikoDrawing(), /compatible triangular patterns/);
});


test('Bands uses only the upper pattern on the top panel', () => {
  const { context, set } = generators('diamond');
  const topOpenings = () => context.assemblyDrawing().panels.find(panel => panel.name === 'Top').openings;
  const original = JSON.stringify(topOpenings());
  set('kumiko-combine', true);
  set('kumiko-combination-layout', 'bands');
  for (const accent of ['asanoha', 'sakura']) {
    set('kumiko-second-pattern', accent);
    for (const position of [1, 2, 3]) {
      set('kumiko-split', position);
      assert.equal(JSON.stringify(topOpenings()), original, 'Lid must ignore lower pattern and band split');
    }
  }
});

test('interlocking walls are consecutive sections of one unfolded perimeter design', () => {
  const canonical = openings => openings.map(opening => opening.points
    .map(point => point.map(value => Number(value.toFixed(5))).join(','))
    .filter((point, index, points) => points.indexOf(point) === index)
    .sort().join(';')).sort();
  for (const [width, height, count, frame] of [[150, 243, 5, 8], [180, 180, 4, 10]]) {
    const { context, set } = generators('triangular');
    set('kumiko-width', width);
    set('kumiko-height', height);
    set('assembly-width', width);
    set('assembly-height', height);
    set('kumiko-frame', frame);
    set('kumiko-cell-count', count);
    set('kumiko-combine', true);
    set('kumiko-combination-layout', 'interlock');
    const drawing = context.assemblyDrawing();
    const span = width - 2 * frame + 2;
    const unfolded = context.kumikoDrawing({ panelWidth: 4 * span + 2 * frame - 2, panelHeight: height,
      cellCount: 4 * count, wrap: { width, index: 0, count: 4 } });
    const panels = ['Front', 'Right', 'Back', 'Left'].map(name => drawing.panels.find(panel => panel.name === name));
    panels.forEach((panel, index) => {
      const translated = { openingPolygons: unfolded.openingPolygons.map(points => points.map(([x, y]) => [x - index * span, y])) };
      const expected = context.fittedPatternOpenings(translated, frame, width, height - frame, 0.1);
      assert.deepEqual(canonical(panel.openings), canonical(expected), `${panel.name} must follow the previous wall without restarting the design`);
    });
    assert.ok(new Set(panels.map(panel => JSON.stringify(canonical(panel.openings)))).size > 1, 'Walls must have distinct sections, rather than repeat the same panel');
    const summaryCount = panels.reduce((sum, panel) => sum + panel.openings.length, 0);
    assert.ok(drawing.label.includes(`${summaryCount} cutouts across the side walls`));
  }
});

test('interlocking motif choice closes all four corners, including Left back to Front', () => {
  const { context } = generators();
  for (const width of [80, 150, 243]) {
    for (let wall = 0; wall < 4; wall++) {
      for (let y = 0; y < 243; y += 0.7) {
        const right = context.interlockingAccentAt(width, y, width, 243, 27, { width, index: wall, count: 4 });
        const left = context.interlockingAccentAt(0, y, width, 243, 27, { width, index: (wall + 1) % 4, count: 4 });
        assert.equal(right, left, 'Both sides of a corner must choose the same motif');
      }
    }
  }
});

test('upper dense patches follow the lid edges at the Front-Right corner and leave the river below', () => {
  const { context, set } = generators('triangular');
  const accentAt = (wall, u, v) => context.interlockingAccentAt(u * 150, v * 243, 150, 243, 28,
    { width: 150, index: wall, count: 4 });
  assert.equal(accentAt(0, 0.95, 0.05), true);
  assert.equal(accentAt(1, 0.05, 0.05), true);
  for (let wall = 0; wall < 4; wall++) {
    for (let sample = 0; sample <= 40; sample++) {
      const u = sample / 40;
      if (wall > 1) assert.equal(accentAt(wall, u, 0.05), false);
      // The cap must not alter the existing river or lower banks.
      for (const v of [0.4, 0.7, 0.9]) {
        const step = 0.13 * Math.sin(v * 243 / 28 * Math.PI / 2);
        const expected = v > 0.5 + 0.23 * Math.sin(2 * Math.PI * (wall + u) / 4) + step * 0.5;
        assert.equal(accentAt(wall, u, v), expected);
      }
    }
  }
  const top = () => JSON.stringify(context.assemblyDrawing().panels.find(panel => panel.name === 'Top').openings);
  set('kumiko-combine', true);
  set('kumiko-combination-layout', 'interlock');
  const lid = top();
  const source = context.interlockingAccentAt;
  context.interlockingAccentAt = (x, y, width, height, rowHeight, wrap) => wrap ? false : source(x, y, width, height, rowHeight);
  assert.equal(top(), lid, 'Adding corner cells on the walls must preserve the existing lid');
});


test('both upper wall edges inherit the dense cells along their adjoining lid edges', () => {
  const { context } = generators('triangular');
  for (const rowHeight of [23, 34]) {
    for (let sample = 1; sample < 100; sample++) {
      const x = sample / 100 * 150;
      const wrap = { width: 150, count: 4, lidRowHeight: rowHeight };
      assert.equal(context.interlockingAccentAt(x, 0, 150, 243, 28, { ...wrap, index: 0 }),
        context.interlockingAccentAt(x, 150, 150, 150, rowHeight), 'Front edge follows lid bottom edge');
      assert.equal(context.interlockingAccentAt(x, 0, 150, 243, 28, { ...wrap, index: 1 }),
        context.interlockingAccentAt(150, 150 - x, 150, 150, rowHeight), 'Right edge follows lid right edge');
    }
  }
});


test('Pattern and Assembly Front have identical frame-fitted interlocking nodes and openings', () => {
  const canonical = polygons => polygons.map(points => [...new Set(points.map(point => point.map(value => Number(value.toFixed(6))).join(',')))].sort().join(';')).sort();
  for (const [pattern, frame, strut] of [['triangular', 8, 2], ['goma', 12, 1.5], ['rindo', 10, 1]]) {
    const { context, set } = generators(pattern);
    set('kumiko-combine', true);
    set('kumiko-combination-layout', 'interlock');
    set('kumiko-frame', frame);
    set('kumiko-strut', strut);
    const drawing = context.kumikoDrawing();
    const front = context.assemblyDrawing().panels.find(panel => panel.name === 'Front');
    assert.deepEqual(canonical(front.openings.map(opening => opening.points)), canonical(drawing.openingPolygons));
    const reference = context.kumikoDrawing({ pattern: 'triangular', combine: false });
    if (pattern === 'triangular') {
      const referenceCells = new Set(canonical(reference.openingPolygons));
      const simple = drawing.openingPolygons.filter(points => points.length === 3);
      assert.ok(simple.length > 0);
      assert.ok(canonical(simple).some(cell => referenceCells.has(cell)), 'Simple cells retain the frame-fitted base grid');
    }
  }
});
