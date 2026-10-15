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
  const context = vm.createContext({ document: { querySelector: selector => inputs.get(selector) ?? {} } });
  vm.runInContext(source.slice(0, source.indexOf('function matingPath(')), context);
  return { context, set: (id, value) => {
    const input = inputs.get(`#${id}`);
    if ('checked' in input) input.checked = Boolean(value);
    else input.value = String(value);
  } };
}

test('simple patterns boost cells once and restore the original count without rounding drift', () => {
  const { context, set } = generators('diamond');
  for (const count of [1, 5, 6, 67, 99, 100]) {
    set('kumiko-cell-count', count);
    for (const pattern of ['senbon', 'masu', 'senbon', 'diamond', 'masu', 'goma']) {
      vm.runInContext(`kumikoPattern.value = '${pattern}'; adjustPatternCellCount();`, context);
      const actual = vm.runInContext("numericValue(document.querySelector('#kumiko-cell-count'))", context);
      assert.equal(actual, ['senbon', 'masu'].includes(pattern) ? Math.min(100, Math.ceil(count * 1.5)) : count);
    }
  }
});

test('leaving simple patterns scales manual density edits back and preserves incomplete input', () => {
  const { context, set } = generators('diamond');
  vm.runInContext("kumikoPattern.value = 'senbon'; adjustPatternCellCount();", context);
  set('kumiko-cell-count', 12);
  vm.runInContext("kumikoPattern.value = 'goma'; adjustPatternCellCount();", context);
  assert.equal(vm.runInContext("numericValue(document.querySelector('#kumiko-cell-count'))", context), 8);
  vm.runInContext("kumikoPattern.value = 'masu'; adjustPatternCellCount();", context);
  set('kumiko-cell-count', '');
  vm.runInContext("kumikoPattern.value = 'diamond'; adjustPatternCellCount();", context);
  assert.equal(vm.runInContext("document.querySelector('#kumiko-cell-count').value", context), '');
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
    assert.equal(front.windows[0].points[0][1], model.panelHeight - model.frameWidth + over);
    assert.equal(front.windows[0].points[2][1], model.panelHeight - model.frameWidth + over + model.thickness);
    assert.equal(Math.max(...front.points.map(point => point[1])), model.totalHeight);
    assert.ok(front.openings.every(opening => opening.points.every(point => point[1] <= model.panelHeight - 8)));
    const paperMaterial = new THREE.MeshBasicMaterial();
    const box = buildBoxModel(drawing, [paperMaterial, paperMaterial], paperMaterial);
    box.children.find(panel => panel.name === 'Front').children[0].geometry.computeBoundingBox();
    const paperBounds = box.children.find(panel => panel.name === 'Front').children[0].geometry.boundingBox;
    assert.equal(paperBounds.min.y, -(model.panelHeight - model.frameWidth + over));
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
    assert.equal(drawing.model.totalHeight, 243 - frame + 10 + 3 + 10 + 10);
  }
});


test('experimental combinations keep closed openings separated by a solid rail', () => {
  for (const [top, bottom] of [['diamond', 'asanoha'], ['goma', 'senbon'], ['kagome', 'masu'], ['rindo', 'sakura']]) {
    const { context, set } = generators(top);
    const original = context.kumikoDrawing();
    set('kumiko-combine', true);
    set('kumiko-second-pattern', bottom);
    for (const share of [20, 50, 80]) {
      set('kumiko-split', share);
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
      assert.ok(drawing.filename.includes(`${bottom}-${share}pct`));
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
  assert.ok(drawing.filename.includes('asanoha-50pct'));
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
  for (const share of ['', 0, 19, 81, 'NaN']) {
    set('kumiko-split', share);
    assert.throws(() => context.kumikoDrawing(), /top band share/);
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
    for (const share of [20, 50, 80]) {
      set('kumiko-split', share);
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
