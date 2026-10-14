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

test('wall paper stops at the bottom plate and leaves bottom slots and lower walls bare', () => {
  for (const bottomOffset of [5, 10, 25]) {
    const settings = { ...model, bottomOffset };
    const slotTop = settings.bodyHeight - bottomOffset - settings.thickness;
    const hole = [[16, slotTop], [30, slotTop], [30, slotTop + settings.thickness], [16, slotTop + settings.thickness]];
    for (const name of ['Front', 'Back', 'Left', 'Right']) {
      const paper = buildPaperLining({ name, windows: [{ points: hole }] }, settings, materials[0]);
      paper.geometry.computeBoundingBox();
      assert.equal(paper.geometry.boundingBox.min.y, -slotTop);
      assert.equal(paper.geometry.parameters.shapes.holes.length, 0, 'Bottom slots must sit outside the paper outline');
      paper.position.set(0, 0, 0);
      paper.updateMatrixWorld(true);
      const ray = new THREE.Raycaster(new THREE.Vector3(40, -slotTop - 1, 1), new THREE.Vector3(0, 0, -1));
      assert.equal(ray.intersectObject(paper).length, 0, 'No lining below the plate');
      ray.ray.origin.y = -slotTop + 1;
      assert.ok(ray.intersectObject(paper).length > 0, 'Lining still covers the wall above the plate');
      paper.geometry.dispose();
    }
  }
});

test('puck light source remains inside the cavity, including short boxes', () => {
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


test('white puck with silver base rests on the bottom plate', async () => {
  const { buildPuck } = await import('../preview-puck.js');
  const { puckDimensions } = await import('../preview-lighting.js');
  const settings = { ...model, panelWidth: 150, bodyHeight: 243, totalHeight: 253 };
  const dimensions = puckDimensions(settings);
  const puck = buildPuck(settings);
  puck.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(puck);
  assert.ok(Math.abs(bounds.min.y - dimensions.floorTop) < 1e-6);
  assert.ok(Math.abs(bounds.max.y - dimensions.floorTop - dimensions.height) < 1e-6);
  assert.equal(puck.getObjectByName('White diffuser').material.color.getHex(), 0xffffff);
  assert.ok(puck.getObjectByName('Silver base').material.metalness > 0.5);
  assert.ok(lampPosition(settings).y > bounds.max.y);
  puck.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
});

test('preview cord passes through the rear notch with a thin, long, curved tail', async () => {
  const { buildCord } = await import('../preview-cord.js');
  for (const cordDiameter of [1, 8, 12]) {
    const settings = { ...model, cordDiameter };
    const cord = buildCord(settings);
    const path = cord.userData.path;
    const { puckDimensions } = await import('../preview-lighting.js');
    const puck = puckDimensions(settings);
    assert.equal(path.getPoint(0).z, -puck.radius * 0.98);
    assert.ok(path.getPoint(0).y >= puck.floorTop + cord.userData.radius);
    assert.ok(path.getPoint(0).y < puck.floorTop + puck.baseHeight);
    const passage = path.curves[1];
    const panelY = settings.totalHeight / 2 - settings.bodyHeight + settings.bottomOffset + settings.thickness / 2;
    assert.ok(passage.v1.y > panelY && passage.v2.y < panelY);
    assert.equal(passage.v1.x, 0);
    assert.equal(passage.v1.z, -settings.panelWidth / 2 + settings.thickness + cordDiameter / 2);
    assert.ok(cord.userData.radius < cordDiameter / 2);
    assert.ok(path.getPoint(1).z < -settings.panelWidth / 2);
    assert.ok(path.getPoint(1).z < -settings.panelWidth);
    assert.ok(cord.userData.radius <= 1.25);
    assert.ok(path.curves.slice(2).every(curve => curve.isCubicBezierCurve3));
    for (let index = 1; index < path.curves.length; index++) {
      const before = path.curves[index - 1].getTangent(1);
      const after = path.curves[index].getTangent(0);
      assert.ok(before.dot(after) > 0.99, 'Cable bends should have continuous tangents');
    }
    assert.equal(cord.visible, true);
    assert.equal(cord.material.opacity, 1);
    const colors = cord.geometry.getAttribute('color');
    assert.equal(colors.getW(0), 1);
    assert.equal(colors.getW(colors.count - 1), 0);
    assert.ok(Array.from({ length: colors.count }, (_, i) => colors.getW(i)).some(alpha => alpha > 0 && alpha < 1));
    assert.ok(cord.geometry.attributes.position.array.every(Number.isFinite));
    cord.geometry.dispose();
    cord.material.dispose();
  }
});


test('shadow light retains its original elevated position independently of the puck', () => {
  const settings = { ...model, panelWidth: 150, bodyHeight: 243, totalHeight: 253 };
  const floorTop = settings.totalHeight / 2 - settings.bodyHeight + settings.bottomOffset + settings.thickness;
  assert.equal(lampPosition(settings).y - floorTop, 37.5 + 20);
});


test('paper below the bottom plate emits no lamp light onto the ground', () => {
  const settings = { ...model, bottomOffset: 25 };
  const lightThroughWindow = (top, bottom) => {
    const panel = { name: 'Front', points: [[0, 0], [80, 0], [80, 80], [0, 80]],
      openings: [{ points: [[10, top], [70, top], [70, bottom], [10, bottom]] }], windows: [] };
    const box = buildBoxModel({ model: settings, panels: [panel] }, materials, materials[0]);
    const light = paperGroundLighting(box, settings.thickness, -45, 320, 16, 48);
    box.traverse(object => object.geometry?.dispose());
    return light;
  };
  assert.ok(lightThroughWindow(58, 76).every(value => value === 0), 'Lining under the opaque plate must stay unlit');
  assert.ok(lightThroughWindow(15, 45).some(value => value > 0), 'Lining above the plate must still transmit light');
});
