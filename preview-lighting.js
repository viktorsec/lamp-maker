import * as THREE from './vendor/three/three.module.js';

export const LAMP_COLOR = 0xffbd72;
export const FLOOR_SPAN = 200;
const PAPER_FIELD = {
  resolution: 192, samples: 24, maskSize: 512, warp: 6,
  floorSpan: FLOOR_SPAN, fadeStart: 40, fadeEnd: 80, transmission: 0.35
};

function fieldCoordinate(value, warp) {
  return warp ? Math.sign(value) * Math.expm1(Math.abs(value) * warp) / Math.expm1(warp) : value;
}

export function lampPosition(model) {
  const { panelWidth, totalHeight, bodyHeight, bottomOffset, thickness } = model;
  const floorTop = totalHeight / 2 - bodyHeight + bottomOffset + thickness;
  const cavityHeight = bodyHeight - bottomOffset - 2 * thickness;
  // Raise the original near-base position by 20 mm, keeping clearance from
  // the top if the user makes the box unusually short.
  const elevation = Math.min(Math.min(panelWidth * 0.25, cavityHeight * 0.25) + 20, cavityHeight * 0.95);
  return new THREE.Vector3(0, floorTop + elevation, 0);
}

export function lampOutput(model) {
  return model.panelWidth ** 2 * 56;
}

// Paper absorbs some incident light and distributes the remainder over a
// hemisphere. Radiance * PI cannot exceed the irradiance arriving from the bulb.
export function paperRadiance(source, point, normal, intensity) {
  const incoming = source.clone().sub(point);
  const distanceSquared = incoming.lengthSq();
  const incidence = Math.max(0, incoming.normalize().dot(normal));
  const transmission = PAPER_FIELD.transmission;
  return intensity * incidence / distanceSquared * transmission / Math.PI;
}

// Integrate Lambertian transmission over the paper, then test each ray at
// both wood faces. This avoids inventing a few directional spotlight beams.
export function paperGroundLighting(box, thickness, floorY, extent, resolution = PAPER_FIELD.resolution, subdivisions = PAPER_FIELD.samples, warp = 0) {
  const contains = (polygon, x, y) => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i], b = polygon[j];
      if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  };
  const coordinate = value => fieldCoordinate(value, warp);
  const faces = [];
  box.updateMatrixWorld(true);
  for (const panel of box.children) {
    if (['Top', 'Bottom'].includes(panel.name)) continue; // Top radiates upward.
    const shape = panel.geometry.parameters.shapes;
    const outline = shape.getPoints(1);
    const width = Math.max(...outline.map(point => point.x));
    const height = -Math.min(...outline.map(point => point.y));
    const maskSize = PAPER_FIELD.maskSize;
    const mask = new Uint8Array(maskSize * maskSize);
    const polygons = shape.holes.map(hole => hole.getPoints(1));
    for (const polygon of polygons) {
      const minX = Math.max(0, Math.floor(Math.min(...polygon.map(point => point.x)) / width * maskSize));
      const maxX = Math.min(maskSize - 1, Math.ceil(Math.max(...polygon.map(point => point.x)) / width * maskSize));
      const minY = Math.max(0, Math.floor(-Math.max(...polygon.map(point => point.y)) / height * maskSize));
      const maxY = Math.min(maskSize - 1, Math.ceil(-Math.min(...polygon.map(point => point.y)) / height * maskSize));
      for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
        const px = (x + 0.5) / maskSize * width, py = -(y + 0.5) / maskSize * height;
        if (contains(polygon, px, py)) mask[y * maskSize + x] = 1;
      }
    }
    const aperture = (x, y) => {
      const ix = Math.floor(x / width * maskSize), iy = Math.floor(-y / height * maskSize);
      return ix < 0 || iy < 0 || ix >= maskSize || iy >= maskSize ? 1 : mask[iy * maskSize + ix];
    };
    const paper = panel.children[0];
    paper.geometry.computeBoundingBox();
    const bounds = paper.geometry.boundingBox;
    const size = bounds.getSize(new THREE.Vector3());
    const paperSlots = paper.geometry.parameters.shapes.holes.map(hole => hole.getPoints(1));
    const source = panel.worldToLocal(lampPosition(box.userData.model));
    const intensity = lampOutput(box.userData.model);
    const samples = [];
    for (let y = 0; y < subdivisions; y++) for (let x = 0; x < subdivisions; x++) {
      const sx = bounds.min.x + (x + 0.5) / subdivisions * size.x;
      const sy = bounds.min.y + (y + 0.5) / subdivisions * size.y;
      if (aperture(sx, sy) && !paperSlots.some(slot => contains(slot, sx, sy))) {
        const radiance = paperRadiance(source, new THREE.Vector3(sx, sy, -0.02), new THREE.Vector3(0, 0, -1), intensity);
        samples.push([sx, sy, panel.position.y + sy - floorY, radiance]);
      }
    }
    faces.push({ inverse: panel.matrixWorld.clone().invert(), samples, aperture, area: size.x * size.y / subdivisions ** 2 });
  }
  const values = new Float32Array(resolution * resolution);
  const ground = new THREE.Vector3();
  for (let y = 0; y < resolution; y++) for (let x = 0; x < resolution; x++) {
    const gx = coordinate((x + 0.5) / resolution * 2 - 1) * extent / 2;
    // PlaneGeometry's local +Y becomes world -Z after rotating onto the floor.
    const gz = coordinate(1 - (y + 0.5) / resolution * 2) * extent / 2;
    let irradiance = 0;
    for (const face of faces) {
      ground.set(gx, floorY, gz).applyMatrix4(face.inverse);
      const dz = ground.z + 0.02;
      if (dz <= thickness + 0.02) continue;
      const outer = (thickness + 0.02) / dz, inner = 0.02 / dz;
      for (const [sx, sy, elevation, radiance] of face.samples) {
        const dx = ground.x - sx, dy = ground.y - sy;
        if (!face.aperture(sx + dx * inner, sy + dy * inner) || !face.aperture(sx + dx * outer, sy + dy * outer)) continue;
        const distanceSquared = dx * dx + dy * dy + dz * dz;
        // cos(emission) * cos(receiver) / distance², integrated over surface.
        irradiance += radiance * face.area * dz * elevation / (distanceSquared * distanceSquared);
      }
    }
    values[y * resolution + x] = irradiance;
  }
  // Reconstruct the sampled light field smoothly rather than displaying
  // individual integration/texture cells as stripes on the ground.
  const scratch = new Float32Array(values.length);
  const weights = [1, 2, 3, 4, 3, 2, 1];
  for (let pass = 0; pass < 2; pass++) {
    const input = pass ? scratch : values, output = pass ? values : scratch;
    for (let y = 0; y < resolution; y++) for (let x = 0; x < resolution; x++) {
      let sum = 0;
      for (let k = -3; k <= 3; k++) {
        const xx = pass ? x : THREE.MathUtils.clamp(x + k, 0, resolution - 1);
        const yy = pass ? THREE.MathUtils.clamp(y + k, 0, resolution - 1) : y;
        sum += input[yy * resolution + xx] * weights[k + 3];
      }
      output[y * resolution + x] = sum / 16;
    }
  }
  return values;
}

// Add diffuse paper illumination to the existing receiver. A second plane
// at nearly the same depth can flicker as the camera rotates or zooms.
export function attachPaperLighting(material) {
  const uniforms = {
    paperMap: { value: null },
    paperColor: { value: new THREE.Color(LAMP_COLOR) },
    paperEnabled: { value: 0 }
  };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 paperUV;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\npaperUV = uv;');
    const warp = PAPER_FIELD.warp.toFixed(1);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 paperUV;
        uniform sampler2D paperMap;
        uniform vec3 paperColor;
        uniform float paperEnabled;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        vec2 fieldUV = 0.5 + 0.5 * sign(paperUV * 2.0 - 1.0) *
          log(1.0 + abs(paperUV * 2.0 - 1.0) * (exp(${warp}) - 1.0)) / ${warp};
        totalEmissiveRadiance += texture2D(paperMap, fieldUV).rgb * paperColor * paperEnabled;`);
  };
  material.customProgramCacheKey = () => `paper-floor-lighting-${PAPER_FIELD.warp}`;
  return uniforms;
}

export function buildPaperLighting(box, floorY, radius) {
  const { resolution, samples, warp, floorSpan, fadeStart, fadeEnd } = PAPER_FIELD;
  const illumination = paperGroundLighting(box, box.userData.model.thickness, floorY, radius * floorSpan, resolution, samples, warp);
  const coordinates = Array.from({ length: resolution }, (_, i) => fieldCoordinate((i + 0.5) / resolution * 2 - 1, warp) * floorSpan / 2);
  const pixels = new Float32Array(illumination.length * 4);
  illumination.forEach((value, index) => {
    const distance = Math.hypot(coordinates[index % resolution], coordinates[Math.floor(index / resolution)]);
    // Only taper the negligible far tail, smoothly and radially.
    const brightness = value * (1 - THREE.MathUtils.smoothstep(distance, fadeStart, fadeEnd));
    pixels.set([brightness, brightness, brightness, 1], index * 4);
  });
  const texture = new THREE.DataTexture(pixels, resolution, resolution, THREE.RGBAFormat, THREE.FloatType);
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  // The visible paper shares one material, so use mean transmitted radiance.
  const source = lampPosition(box.userData.model), intensity = lampOutput(box.userData.model);
  const faces = box.children.filter(panel => panel.name !== 'Bottom');
  const emissiveIntensity = faces.reduce((sum, panel) => {
    const paper = panel.children[0];
    paper.geometry.computeBoundingBox();
    const center = paper.localToWorld(paper.geometry.boundingBox.getCenter(new THREE.Vector3()));
    const inward = new THREE.Vector3(0, 0, -1).transformDirection(panel.matrixWorld);
    return sum + paperRadiance(source, center, inward, intensity);
  }, 0) / faces.length;
  return { texture, emissiveIntensity };
}
