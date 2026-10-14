import * as THREE from './vendor/three/three.module.js';

function panelPath(points, PathClass) {
  const path = new PathClass();
  const outline = points.map(([x, y]) => new THREE.Vector2(x, -y));
  // Extrusion requires clockwise outer boundaries and counterclockwise holes.
  // Negating the drawing's Y axis reverses both, so normalize each explicitly.
  const clockwise = PathClass === THREE.Shape;
  if (THREE.ShapeUtils.isClockWise(outline) !== clockwise) outline.reverse();
  outline.forEach(({ x, y }, index) => {
    if (index === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  });
  path.closePath();
  return path;
}

// Assemble the finished, nominal panels. Kerf offsets and visual joint
// exaggeration belong to cut files and the flat preview, not the finished box.
export function buildPaperLining(panel, model, material) {
  const { panelWidth: width, bodyHeight, thickness } = model;
  const wall = !['Top', 'Bottom'].includes(panel.name);
  const inset = thickness + 0.2;
  const bottom = wall ? bodyHeight - 0.2 : width - inset;
  // Cover the pattern openings, but leave the joints, legs and bottom slots clear.
  const shape = panelPath([[inset, inset], [width - inset, inset], [width - inset, bottom], [inset, bottom]], THREE.Shape);
  shape.holes = panel.windows.map(window => panelPath(window.points, THREE.Path));
  const paperThickness = Math.min(0.12, thickness * 0.05);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: paperThickness, steps: 1, bevelEnabled: false, curveSegments: 1 });
  const paper = new THREE.Mesh(geometry, material);
  paper.name = `${panel.name} paper`;
  // The bottom panel's inner face is above its extrusion; all others face inward at z=0.
  paper.position.z = panel.name === 'Bottom' ? thickness + 0.02 : -paperThickness - 0.02;
  paper.receiveShadow = true;
  // Opaque diffusion blocks the direct bulb projection. Transmitted light is
  // represented separately by the diffuse ground-light calculation.
  paper.castShadow = true;
  paper.visible = false;
  return paper;
}

export function buildBoxModel(drawing, materials, paperMaterial) {
  const { panelWidth: width, totalHeight: height, bodyHeight, thickness, bottomOffset } = drawing.model;
  const group = new THREE.Group();
  group.userData.model = drawing.model;
  for (const panel of drawing.panels) {
    const shape = panelPath(panel.points, THREE.Shape);
    shape.holes = [...panel.openings, ...panel.windows].map(opening => panelPath(opening.points, THREE.Path));
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, steps: 1, bevelEnabled: false, curveSegments: 1 });
    const mesh = new THREE.Mesh(geometry, materials);
    mesh.name = panel.name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    switch (panel.name) {
      case 'Front': mesh.position.set(-width / 2, height / 2, width / 2 - thickness); break;
      case 'Back':
        mesh.rotation.y = Math.PI;
        mesh.position.set(width / 2, height / 2, -width / 2 + thickness);
        break;
      case 'Left':
        mesh.rotation.y = -Math.PI / 2;
        mesh.position.set(-width / 2 + thickness, height / 2, -width / 2);
        break;
      case 'Right':
        mesh.rotation.y = Math.PI / 2;
        mesh.position.set(width / 2 - thickness, height / 2, width / 2);
        break;
      case 'Top':
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(-width / 2, height / 2 - thickness, -width / 2);
        break;
      case 'Bottom':
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(-width / 2, height / 2 - bodyHeight + bottomOffset, -width / 2);
        break;
    }
    if (paperMaterial) mesh.add(buildPaperLining(panel, drawing.model, paperMaterial));
    group.add(mesh);
  }
  group.updateMatrixWorld(true);
  return group;
}

