import * as THREE from './vendor/three/three.module.js';
import { puckDimensions } from './preview-lighting.js?v=5';

function roundedDisc(radius, height, bevel) {
  const profile = [[0, 0], [radius - bevel, 0], [radius, bevel],
    [radius, height - bevel], [radius - bevel, height], [0, height]];
  return new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), 64);
}

export function buildPuck(model) {
  const { radius, height, baseHeight, floorTop } = puckDimensions(model);
  const puck = new THREE.Group();
  puck.name = 'Puck light';
  puck.position.y = floorTop;
  const base = new THREE.Mesh(roundedDisc(radius, baseHeight, baseHeight * 0.15),
    new THREE.MeshStandardMaterial({ color: 0xc6cbd1, metalness: 0.7, roughness: 0.27 }));
  base.name = 'Silver base';
  base.receiveShadow = true;
  const diffuser = new THREE.Mesh(roundedDisc(radius * 0.95, height - baseHeight, (height - baseHeight) * 0.2),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.46, emissive: 0xffffff, emissiveIntensity: 0 }));
  diffuser.name = 'White diffuser';
  diffuser.position.y = baseHeight;
  puck.add(base, diffuser);
  return puck;
}
