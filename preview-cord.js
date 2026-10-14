import * as THREE from './vendor/three/three.module.js';
import { puckDimensions } from './preview-lighting.js?v=5';

// The notch is on the rear edge of the bottom panel (negative world Z).
export function buildCord(model) {
  const { panelWidth: width, totalHeight, bodyHeight, bottomOffset, thickness, cordDiameter } = model;
  if (!cordDiameter) return null;
  const radius = Math.min(1.25, cordDiameter * 0.18, (totalHeight - bodyHeight) * 0.35);
  const underside = totalHeight / 2 - bodyHeight + bottomOffset;
  const ground = -totalHeight / 2 + radius + 0.03;
  const notchZ = -width / 2 + thickness + cordDiameter / 2;
  const puck = puckDimensions(model);
  const source = new THREE.Vector3(0, puck.floorTop + Math.max(radius, puck.baseHeight * 0.5), -puck.radius * 0.98);
  const entry = new THREE.Vector3(0, underside + thickness + radius, notchZ);
  const legHeight = totalHeight - bodyHeight;
  const bendHeight = Math.min(legHeight * 0.45, width * 0.07);
  const exit = new THREE.Vector3(0, ground + bendHeight, notchZ);
  const rear = new THREE.Vector3(-width * 0.1, ground, -width * 0.62);
  // Run diagonally away from the initial camera, inside the lamp's silhouette.
  // Broad, slightly asymmetric bends give the cable some relaxed slack.
  const tailLength = Math.min(width * 0.85, totalHeight * 0.8);
  const end = new THREE.Vector3(rear.x - tailLength * 0.8, ground, rear.z - tailLength);
  const path = new THREE.CurvePath();
  path.add(new THREE.CubicBezierCurve3(source,
    new THREE.Vector3(0, source.y, source.z - Math.max(radius, (source.z - notchZ) * 0.45)),
    new THREE.Vector3(0, entry.y + radius * 2, notchZ), entry));
  path.add(new THREE.LineCurve3(entry, exit));
  path.add(new THREE.CubicBezierCurve3(exit,
    new THREE.Vector3(0, ground, notchZ),
    new THREE.Vector3(rear.x + width * 0.04, ground, rear.z + width * 0.06), rear));
  const middle = new THREE.Vector3(rear.x - tailLength * 0.35, ground, rear.z - tailLength * 0.52);
  path.add(new THREE.CubicBezierCurve3(rear,
    new THREE.Vector3(rear.x - tailLength * 0.12, ground, rear.z - tailLength * 0.18),
    new THREE.Vector3(middle.x + tailLength * 0.2, ground, middle.z + tailLength * 0.12), middle));
  path.add(new THREE.CubicBezierCurve3(middle,
    new THREE.Vector3(middle.x - tailLength * 0.2, ground, middle.z - tailLength * 0.12),
    new THREE.Vector3(end.x + tailLength * 0.12, ground, end.z + tailLength * 0.2), end));
  const geometry = new THREE.TubeGeometry(path, 240, radius, 16, false);
  const uv = geometry.getAttribute('uv');
  const colors = new Float32Array(uv.count * 4);
  // Fade by position along the ground tail, so the visible end has no hard cap.
  for (let index = 0; index < uv.count; index++) {
    const point = path.getPointAt(uv.getX(index));
    const alpha = 1 - THREE.MathUtils.smoothstep(-point.z, -rear.z + tailLength * 0.65, -end.z);
    colors.set([1, 1, 1, alpha], index * 4);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.48,
    vertexColors: true, transparent: true, depthWrite: false });
  const cord = new THREE.Mesh(geometry, material);
  cord.name = 'Power cord';
  cord.userData.path = path;
  cord.userData.radius = radius;
  return cord;
}

