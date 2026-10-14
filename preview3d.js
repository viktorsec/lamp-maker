import * as THREE from './vendor/three/three.module.js';
import { OrbitControls } from './vendor/three/OrbitControls.js';
import { buildBoxModel } from './preview-geometry.js';
import { lampPosition, lampOutput, paperRadiance, paperGroundLighting, attachPaperLighting } from './preview-lighting.js?v=2';

export { buildBoxModel, buildPaperLining } from './preview-geometry.js';
export { lampPosition, lampOutput, paperRadiance, paperGroundLighting } from './preview-lighting.js?v=2';

export function createBoxViewer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor('#eee9d8');
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  // Accumulate all lighting before mapping it to the display. Mapping each
  // channel/material separately clips bright amber light towards white.
  renderer.toneMapping = THREE.NoToneMapping;
  const hdrTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const displayScene = new THREE.Scene();
  const displayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const displayMaterial = new THREE.ShaderMaterial({
    uniforms: {
      image: { value: hdrTarget.texture },
      background: { value: new THREE.Color('#eee9d8') },
      exposure: { value: 1.15 }
    },
    vertexShader: `varying vec2 screenUV;
      void main() { screenUV = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `uniform sampler2D image;
      uniform vec3 background;
      uniform float exposure;
      varying vec2 screenUV;
      void main() {
        vec4 sampleColor = texture2D(image, screenUV);
        vec3 radiance = sampleColor.rgb * exposure;
        float peak = max(max(radiance.r, radiance.g), radiance.b);
        // One scale for all channels preserves the light's chromaticity.
        vec3 mapped = radiance / (1.0 + peak);
        gl_FragColor = vec4(mix(background, mapped, clamp(sampleColor.a, 0.0, 1.0)), 1.0);
        #include <colorspace_fragment>
      }`,
    depthTest: false, depthWrite: false, toneMapped: false
  });
  displayScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), displayMaterial));
  container.replaceChildren(renderer.domElement);
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'Rotate assembled box with mouse dragging or arrow keys. Scroll to zoom.');
  const scene = new THREE.Scene();
  const environmentLight = new THREE.HemisphereLight(0xfff4dc, 0x655c47, 2.1);
  scene.add(environmentLight);
  const keyLight = new THREE.DirectionalLight(0xfff3db, 3);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.bias = -0.00002;
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0xe4eaf8, 1.5);
  scene.add(fillLight);
  const lampLight = new THREE.PointLight(0xffbd72, 0, 0, 2);
  lampLight.castShadow = true;
  lampLight.shadow.mapSize.set(1024, 1024);
  lampLight.shadow.bias = -0.000002;
  lampLight.shadow.radius = 3;
  scene.add(lampLight);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), new THREE.MeshBasicMaterial({ color: 0xffedbf }));
  bulb.visible = false;
  scene.add(bulb);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 10000);
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.enableDamping = false;
  controls.rotateSpeed = 0.75;
  controls.minPolarAngle = 0.05;
  controls.maxPolarAngle = Math.PI - 0.05;
  const materials = [
    new THREE.MeshStandardMaterial({ color: 0xc9a775, roughness: 0.87 }),
    new THREE.MeshStandardMaterial({ color: 0x81522b, roughness: 0.95 })
  ];
  const paperMaterial = new THREE.MeshStandardMaterial({ color: 0xfff8e8, roughness: 1, side: THREE.DoubleSide, shadowSide: THREE.BackSide });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ roughness: 1, toneMapped: false }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  let model = null;
  let geometryKey = '';
  let visible = true;
  let radius = 1;
  let resetDistance = 1;
  let paperEnabled = false;
  let lampEnabled = false;
  let lampIntensity = 0;
  let paperEmissiveIntensity = 0;
  const paperLighting = attachPaperLighting(floor.material);

  function setEnvironmentLight(percent) {
    const level = THREE.MathUtils.clamp(percent, 0, 100) / 100;
    environmentLight.intensity = 2.1 * level;
    keyLight.intensity = 3 * level;
    fillLight.intensity = 1.5 * level;
    const background = new THREE.Color('#10131a').lerp(new THREE.Color('#eee9d8'), level);
    renderer.setClearColor(background, 0);
    displayMaterial.uniforms.background.value.copy(background);
    container.parentElement.style.setProperty('--showcase-background', `#${background.getHexString()}`);
    // Keep one receiver at every brightness, balancing its fill against the
    // environment instead of swapping materials at the slider's endpoint.
    floor.material.color.copy(background).multiplyScalar(0.55);
    // A dark environment should not turn the ground into a light absorber:
    // retain enough reflectance to reveal light passing through the lattice.
    floor.material.color.r = Math.max(0.25, floor.material.color.r);
    floor.material.color.g = Math.max(0.25, floor.material.color.g);
    floor.material.color.b = Math.max(0.25, floor.material.color.b);
    floor.material.emissive.copy(background).multiplyScalar(1 - 0.75 * level);
    // Use the same receiver reflectance and Lambertian response as the floor's
    // direct bulb lighting, rather than adding an independently boosted glow.
    paperLighting.paperColor.value.setHex(0xffbd72).multiply(floor.material.color).multiplyScalar(1 / Math.PI);
    container.dataset.environmentIntensity = String(environmentLight.intensity);
    container.dataset.environmentLevel = String(level * 100);
    container.dataset.environmentBackground = `#${background.getHexString()}`;
    render();
  }

  function setLampEnabled(value) {
    if (lampEnabled !== value) renderer.shadowMap.needsUpdate = true;
    lampEnabled = value;
    lampLight.visible = value;
    lampLight.castShadow = value;
    lampLight.intensity = value ? lampIntensity : 0;
    paperLighting.paperEnabled.value = value && paperEnabled ? 1 : 0;
    paperLighting.paperColor.value.setHex(0xffbd72).multiply(floor.material.color).multiplyScalar(1 / Math.PI);
    bulb.visible = value;
    // An emissive paper surface approximates light transmitted through the lining.
    paperMaterial.emissive.setHex(value ? 0xffbb67 : 0x000000);
    paperMaterial.emissiveIntensity = value ? paperEmissiveIntensity : 0;
    container.dataset.lampEnabled = String(value);
    render();
  }

  function setPaperEnabled(value) {
    if (paperEnabled !== value) renderer.shadowMap.needsUpdate = true;
    paperEnabled = value;
    model?.children.forEach(panel => panel.children.forEach(paper => { paper.visible = value; }));
    container.dataset.paperEnabled = String(value);
    setLampEnabled(lampEnabled);
  }

  function render() {
    if (!visible || !model || !container.clientWidth || !container.clientHeight) return;
    renderer.setRenderTarget(hdrTarget);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(displayScene, displayCamera);
    // Expose current interaction state for inspecting the rendered view.
    canvas.dataset.azimuth = String(controls.getAzimuthalAngle());
    canvas.dataset.polar = String(controls.getPolarAngle());
    canvas.dataset.distance = String(controls.getDistance());
  }
  function resize() {
    const width = container.clientWidth, height = container.clientHeight;
    if (!visible || !width || !height) return;
    renderer.setSize(width, height, false);
    const drawingSize = renderer.getDrawingBufferSize(new THREE.Vector2());
    hdrTarget.setSize(drawingSize.x, drawingSize.y);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (model && controls.getDistance() < minimumFitDistance()) reset();
    render();
  }
  function minimumFitDistance() {
    const vertical = THREE.MathUtils.degToRad(camera.fov / 2);
    const horizontal = Math.atan(Math.tan(vertical) * camera.aspect);
    return radius / Math.sin(Math.min(vertical, horizontal)) * 1.08;
  }
  function reset() {
    resetDistance = minimumFitDistance();
    controls.target.set(0, 0, 0);
    camera.position.copy(new THREE.Vector3(1, 0.65, 1.25).normalize().multiplyScalar(resetDistance));
    controls.minDistance = radius * 1.1;
    controls.maxDistance = resetDistance * 5;
    camera.near = Math.max(0.01, radius / 1000);
    camera.far = resetDistance * 12;
    camera.updateProjectionMatrix();
    controls.update();
    render();
  }
  controls.addEventListener('change', render);
  canvas.addEventListener('pointerdown', () => canvas.focus({ preventScroll: true }));
  canvas.addEventListener('keydown', event => {
    const delta = { ArrowLeft: [-0.12, 0], ArrowRight: [0.12, 0], ArrowUp: [0, -0.12], ArrowDown: [0, 0.12] }[event.key];
    if (!delta) return;
    event.preventDefault();
    const spherical = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    spherical.theta += delta[0];
    spherical.phi = THREE.MathUtils.clamp(spherical.phi + delta[1], 0.05, Math.PI - 0.05);
    camera.position.copy(new THREE.Vector3().setFromSpherical(spherical).add(controls.target));
    controls.update();
  });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    document.querySelector('#box-error').textContent = 'The 3D graphics context was interrupted. Reload the page to restore Preview.';
  });
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);

  return {
    update(drawing) {
      const nextKey = JSON.stringify({ model: drawing.model, panels: drawing.panels.map(panel => [panel.points, panel.openings.map(opening => opening.points), panel.windows.map(window => window.points)]) });
      if (nextKey === geometryKey && model) { resize(); return; }
      const nextModel = buildBoxModel(drawing, materials, paperMaterial);
      if (model) {
        scene.remove(model);
        model.traverse(object => object.geometry?.dispose());
      }
      model = nextModel;
      geometryKey = nextKey;
      scene.add(model);

      model.children.forEach(panel => panel.children.forEach(paper => { paper.visible = paperEnabled; }));
      const bounds = new THREE.Box3().setFromObject(model);
      radius = bounds.getBoundingSphere(new THREE.Sphere()).radius;
      floor.position.y = bounds.min.y - 0.02;
      // Extend the receiver beyond the orbit camera range; its old square
      // boundary visibly truncated the projected light.
      floor.scale.set(radius * 200, radius * 200, 1);
      const illumination = paperGroundLighting(model, drawing.model.thickness, floor.position.y, radius * 200, 192, 24, 6);
      const pixels = new Float32Array(illumination.length * 4);
      illumination.forEach((value, index) => {
        const x = index % 192, y = Math.floor(index / 192);
        const coordinate = index => Math.sign(index) * Math.expm1(Math.abs(index) * 6) / Math.expm1(6) * 100;
        const distance = Math.hypot(coordinate((x + 0.5) / 192 * 2 - 1), coordinate((y + 0.5) / 192 * 2 - 1));
        // Only taper the negligible far tail, smoothly and radially.
        const fade = 1 - THREE.MathUtils.smoothstep(distance, 40, 80);
        const brightness = value * fade;
        pixels.set([brightness, brightness, brightness, 1], index * 4);
      });
      paperLighting.paperMap.value?.dispose();
      const texture = new THREE.DataTexture(pixels, 192, 192, THREE.RGBAFormat, THREE.FloatType);
      texture.minFilter = texture.magFilter = THREE.LinearFilter;
      texture.needsUpdate = true;
      paperLighting.paperMap.value = texture;
      lampLight.position.copy(lampPosition(drawing.model));
      lampIntensity = lampOutput(drawing.model);
      // Use the same transmitted radiance for the visible paper, averaged
      // across exposed faces because they share one material.
      const linedFaces = model.children.filter(panel => panel.name !== 'Bottom');
      paperEmissiveIntensity = linedFaces.reduce((sum, panel) => {
        const paper = panel.children[0];
        paper.geometry.computeBoundingBox();
        const center = paper.localToWorld(paper.geometry.boundingBox.getCenter(new THREE.Vector3()));
        const inward = new THREE.Vector3(0, 0, -1).transformDirection(panel.matrixWorld);
        return sum + paperRadiance(lampLight.position, center, inward, lampIntensity);
      }, 0) / linedFaces.length;
      // Let illumination fade by inverse-square distance, without a cutoff.
      lampLight.distance = 0;
      const floorTop = drawing.model.totalHeight / 2 - drawing.model.bodyHeight + drawing.model.bottomOffset + drawing.model.thickness;
      lampLight.shadow.camera.near = Math.max(0.1, Math.min(drawing.model.panelWidth * 0.02, (lampLight.position.y - floorTop) * 0.2));
      lampLight.shadow.camera.far = radius * 160;
      lampLight.shadow.normalBias = Math.min(drawing.model.thickness * 0.01, 0.02);
      lampLight.shadow.camera.updateProjectionMatrix();
      bulb.position.copy(lampLight.position);
      bulb.scale.setScalar(Math.min(drawing.model.panelWidth * 0.02, (drawing.model.bodyHeight - drawing.model.bottomOffset - 2 * drawing.model.thickness) * 0.06));
      container.dataset.lampPosition = JSON.stringify(lampLight.position.toArray());
      keyLight.position.set(radius * 2, radius * 3, radius * 2);
      fillLight.position.set(-radius * 2, radius, -radius);
      const lightDistance = keyLight.position.length();
      Object.assign(keyLight.shadow.camera, { left: -radius * 1.15, right: radius * 1.15, top: radius * 1.15, bottom: -radius * 1.15, near: lightDistance - radius * 1.5, far: lightDistance + radius * 2 });
      keyLight.shadow.normalBias = Math.min(drawing.model.thickness * 0.025, 0.075);
      keyLight.shadow.camera.updateProjectionMatrix();
      renderer.shadowMap.needsUpdate = true;
      container.dataset.panelCount = String(model.children.length);
      container.dataset.modelSize = JSON.stringify(bounds.getSize(new THREE.Vector3()).toArray());
      resize();
      reset();
      setLampEnabled(lampEnabled);
    },
    setVisible(value) {
      visible = value;
      controls.enabled = value;
      if (value) resize();
    },
    reset,
    setPaperEnabled,
    setLampEnabled,
    setEnvironmentLight
  };
}
