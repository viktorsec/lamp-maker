import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { buildBoxModel, buildPaperLining, paperGroundLighting, lampPosition, paperRadiance } from '../preview3d.js';

const model = { panelWidth: 80, bodyHeight: 80, totalHeight: 90, thickness: 3, bottomOffset: 10 };
const materials = [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()];

function assertVisibleHoleWalls(mesh, holes, depth) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 0.01;
  for (const points of holes) {
    points.forEach((a, index) => {
      const b = points[(index + 1) % points.length];
      const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
      for (const proportion of [0.01, 0.5, 0.99]) {
        const x = a[0] + dx * proportion - dy / length * 0.001;
        const y = a[1] + dy * proportion + dx / length * 0.001;
        raycaster.set(new THREE.Vector3(x, -y, depth / 2), new THREE.Vector3(dy / length, dx / length, 0));
        assert.ok(raycaster.intersectObject(mesh, false).length > 0, 'Cutout wall must face into the opening, including near the spoke junctions');
      }
    });
  }
}

test('triangular and diamond openings have visible inner walls near every vertex', () => {
  const holes = [
    [[12, 12], [34, 12], [23, 34]],
    [[46, 12], [68, 12], [57, 34]],
    [[40, 36], [52, 48], [40, 60], [28, 48]]
  ];
  const panel = { name: 'Top', points: [[0, 0], [80, 0], [80, 80], [0, 80]], openings: holes.map(points => ({ points })), windows: [] };
  const box = buildBoxModel({ model, panels: [panel] }, materials);
  const mesh = box.children[0];
  mesh.position.set(0, 0, 0);
  mesh.rotation.set(0, 0, 0);
  mesh.updateMatrixWorld(true);
  assertVisibleHoleWalls(mesh, holes, model.thickness);
  mesh.geometry.dispose();
});

test('paper bottom-slot walls face into their openings', () => {
  const hole = [[16, 50], [30, 50], [30, 53], [16, 53]];
  const paper = buildPaperLining({ name: 'Front', windows: [{ points: hole }] }, model, materials[0]);
  paper.position.set(0, 0, 0);
  paper.updateMatrixWorld(true);
  assertVisibleHoleWalls(paper, [hole], paper.geometry.parameters.options.depth);
  paper.geometry.dispose();
});

test('raised bulb remains inside the cavity, including short boxes', () => {
  for (const settings of [model, { ...model, panelWidth: 150, bodyHeight: 243, totalHeight: 253 }, { ...model, panelWidth: 1000 }, { ...model, bodyHeight: 26, totalHeight: 36 }]) {
    const position = lampPosition(settings);
    const base = settings.totalHeight / 2 - settings.bodyHeight + settings.bottomOffset + settings.thickness;
    const cavity = settings.bodyHeight - settings.bottomOffset - 2 * settings.thickness;
    assert.equal(position.x, 0);
    assert.equal(position.z, 0);
    assert.ok(position.y > base);
    assert.ok(position.y < base + cavity);
  }
});


test('paper transmission respects the outer wood and box corner geometry', () => {
  const hole = [[20, 20], [60, 20], [60, 60], [20, 60]];
  const panels = ['Front', 'Back', 'Left', 'Right', 'Top', 'Bottom'].map(name => ({
    name, points: [[0, 0], [80, 0], [80, 80], [0, 80]],
    openings: name === 'Bottom' ? [] : [{ points: hole }], windows: []
  }));
  const box = buildBoxModel({ model, panels }, materials, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  box.children.forEach(panel => { panel.children[0].visible = true; });
  box.updateMatrixWorld(true);
  const size = 32;
  const lighting = paperGroundLighting(box, 3, -45, 320, size, 24);
  const thicker = paperGroundLighting(box, 10, -45, 320, size, 24);
  assert.equal(lighting[16 * size + 16], 0, 'Outward paper emission cannot illuminate ground underneath the closed box');
  assert.ok(lighting[2 * size + 16] > 0, 'The exposed paper illuminates ground outside the box');
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const value = lighting[y * size + x];
    assert.ok(Math.abs(value - lighting[x * size + y]) < 0.00001, 'A symmetric box must have symmetric illumination');
    assert.ok(thicker[y * size + x] <= value + 0.00001, 'Thicker wood must occlude at least as much transmitted light');
  }
  assert.ok(thicker.reduce((sum, value) => sum + value, 0) < lighting.reduce((sum, value) => sum + value, 0), 'Outer wood actually masks the paper emission');
  const panel = box.children[0];
  const normal = new THREE.Vector3(0, 0, 1).transformDirection(panel.matrixWorld);
  const opening = panel.localToWorld(new THREE.Vector3(40, -40, 0));
  const ray = new THREE.Raycaster(opening.clone().addScaledVector(normal, -5), normal, 0, 10);
  assert.equal(ray.intersectObject(panel, false).length, 0);
  assert.ok(ray.intersectObject(panel.children[0], false).length > 0, 'Lining intercepts direct bulb rays through the opening');
  box.traverse(object => object.geometry?.dispose());
});


test('empty panels and slots without paper emit no diffuse light', () => {
  for (const windows of [[], [{ points: [[20, 20], [60, 20], [60, 60], [20, 60]] }]]) {
    const panel = { name: 'Front', points: [[0, 0], [80, 0], [80, 80], [0, 80]], openings: [], windows };
    const box = buildBoxModel({ model, panels: [panel] }, materials, materials[0]);
    const lighting = paperGroundLighting(box, 3, -45, 320, 16, 24);
    assert.ok(lighting.every(value => value === 0), 'Light needs an opening backed by paper');
    box.traverse(object => object.geometry?.dispose());
  }
});


test('paper loses energy and follows the bulb output and inverse-square falloff', () => {
  const normal = new THREE.Vector3(0, 0, 1);
  const point = new THREE.Vector3();
  const source = new THREE.Vector3(0, 0, 10);
  const radiance = paperRadiance(source, point, normal, 100);
  assert.ok(radiance * Math.PI < 100 / source.lengthSq(), 'Transmitted hemispherical output must be below incident bulb irradiance');
  assert.equal(paperRadiance(source, point, normal, 0), 0);
  assert.equal(paperRadiance(source, point, normal, 200), radiance * 2);
  assert.equal(paperRadiance(source.clone().multiplyScalar(2), point, normal, 100), radiance / 4);
  assert.equal(paperRadiance(source.clone().negate(), point, normal, 100), 0, 'Light cannot arrive from the outward side of the paper');
});


test('default bulb is raised by 20 mm', () => {
  const settings = { ...model, panelWidth: 150, bodyHeight: 243, totalHeight: 253 };
  const base = settings.totalHeight / 2 - settings.bodyHeight + settings.bottomOffset + settings.thickness;
  assert.equal(lampPosition(settings).y - base, 37.5 + 20);
});
