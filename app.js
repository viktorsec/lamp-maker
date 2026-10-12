const sizeInput = document.querySelector('#size');
const downloadButton = document.querySelector('#download');
const dimensions = document.querySelector('#dimensions');
const error = document.querySelector('#size-error');
const preview = document.querySelector('#preview');
const kerfInputs = ['min', 'max', 'step'].map(name => document.querySelector(`#kerf-${name}`));
let mode = 'square';
let currentDrawing = null;
const number = value => String(Number(value.toFixed(6)));

function readSize() {
  const size = sizeInput.valueAsNumber;
  return Number.isFinite(size) && size >= 1 && size <= 1000 ? size : null;
}

function readKerfs() {
  const values = kerfInputs.map(input => input.valueAsNumber);
  if (values.some(value => !Number.isFinite(value))) throw new Error('Enter all three kerf values.');
  // Integer micrometers avoid floating-point errors when counting samples.
  if (values.some(value => Math.abs(value * 1000 - Math.round(value * 1000)) > 0.000001)) {
    throw new Error('Use at most three decimal places.');
  }
  const [min, max, step] = values.map(value => Math.round(value * 1000));
  if (min < -1000 || max > 1000 || max < min || step < 1 || step > 1000) {
    throw new Error('Use a range within −1 to 1 mm, last ≥ first, and an increment of 0.001–1 mm.');
  }
  const count = Math.floor((max - min) / step) + 1;
  if (count > 15) throw new Error('Use a larger increment or a smaller range: maximum 15 pairs.');
  return Array.from({ length: count }, (_, index) => (min + index * step) / 1000);
}

// Clockwise, orthogonal outlines. Only the shared mating seam is compensated.
const tabOutline = [[0,0],[20,0],[20,5],[26,5],[26,15],[20,15],[20,20],[0,20]];
const slotOutline = [[0,0],[20,0],[20,20],[0,20],[0,15],[6,15],[6,5],[0,5]];

// Each flag refers to the edge from vertex i to vertex i + 1.
// The tab/notch and both shoulders meet; the other three sides stay fixed.
const tabMatingEdges = [false, true, true, true, true, true, false, false];
const slotMatingEdges = [false, false, false, true, true, true, true, true];

function compensatedOutline(points, kerf, matingEdges) {
  // Shift mating edges by half the signed compensation. Unselected edges
  // retain their original supporting lines, including at the seam endpoints.
  // For perpendicular edges their offset-line intersection is the sum of normals.
  const normals = points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    const dx = next[0] - point[0], dy = next[1] - point[1];
    const length = Math.hypot(dx, dy);
    return matingEdges[index] ? [dy / length, -dx / length] : [0, 0];
  });
  return points.map((point, index) => {
    const before = normals[(index + points.length - 1) % points.length];
    const after = normals[index];
    return point.map((value, axis) => value + (before[axis] + after[axis]) * kerf / 2);
  });
}

function outlinePath(points, x, y) {
  return points.map((point, index) => `${index ? 'L' : 'M'}${number(point[0] + x)} ${number(point[1] + y)}`).join(' ') + ' Z';
}

// Single-line digits: labels remain portable SVG paths, with no font dependency.
const digits = {
  '0': 'M0 0H1.4V2.4H0Z', '1': 'M0.4 0.4L0.8 0V2.4M0.2 2.4H1.4',
  '2': 'M0 0H1.4V1.2H0V2.4H1.4', '3': 'M0 0H1.4V2.4H0M0 1.2H1.4',
  '4': 'M0 0V1.2H1.4M1.4 0V2.4', '5': 'M1.4 0H0V1.2H1.4V2.4H0',
  '6': 'M1.4 0H0V2.4H1.4V1.2H0', '7': 'M0 0H1.4L0.4 2.4',
  '8': 'M0 1.2V0H1.4V2.4H0V1.2H1.4', '9': 'M1.4 1.2H0V0H1.4V2.4H0',
  '.': 'M0.6 2.3V2.4', '-': 'M0 1.2H1.4'
};

function labelPaths(value, x, y) {
  return [...value.toFixed(3)].map((char, index) =>
    `<path transform="translate(${number(x + index * 2)} ${number(y)})" d="${digits[char]}" />`
  ).join('');
}

function squareDrawing(size) {
  return { width: size + 2, height: size + 2,
    content: `<g id="cut-outlines"><rect x="1" y="1" width="${size}" height="${size}" /></g>`,
    filename: `square-${size}mm.svg`, description: `${size} × ${size} mm`,
    label: `Preview of a ${size} millimeter square`, hint: '1 closed path · millimeter units' };
}

function kerfDrawing(kerfs) {
  const columns = Math.min(2, kerfs.length);
  const rows = Math.ceil(kerfs.length / columns);
  const outlines = [], labels = [];
  const pieces = [];
  kerfs.forEach((kerf, index) => {
    const x = 2 + (index % columns) * 56, y = 2 + Math.floor(index / columns) * 26;
    pieces.push({ kerf, x, y, points: tabOutline, matingEdges: tabMatingEdges }, { kerf, x: x + 30, y, points: slotOutline, matingEdges: slotMatingEdges });
    outlines.push(`<g id="pair-${index + 1}" data-kerf-mm="${number(kerf)}"><path d="${outlinePath(compensatedOutline(tabOutline, kerf, tabMatingEdges), x, y)}" /><path d="${outlinePath(compensatedOutline(slotOutline, kerf, slotMatingEdges), x + 30, y)}" /></g>`);
    labels.push(`<g data-kerf-mm="${number(kerf)}">${labelPaths(kerf, x + 3, y + 16)}${labelPaths(kerf, x + 33, y + 16)}</g>`);
  });
  return { width: columns * 56, height: rows * 26, pieces, labels: labels.join(''),
    content: `<g id="cut-outlines">${outlines.join('')}</g><g id="engrave-labels" stroke="rgb(255, 0, 0)">${labels.join('')}</g>`,
    filename: `kerf-test-${number(kerfs[0])}-${number(kerfs.at(-1))}mm.svg`,
    description: `${kerfs.length} pairs · ${columns * 56} × ${rows * 26} mm`,
    label: `Kerf test with ${kerfs.length} labeled tab-and-slot pairs: ${kerfs.map(number).join(', ')} millimeters`,
    hint: `${kerfs.length} pairs · labels to engrave / outlines to cut` };
}

function generateSvg(drawing) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${drawing.width}mm" height="${drawing.height}mm" viewBox="0 0 ${drawing.width} ${drawing.height}" fill="none" stroke="#000000" stroke-width="0.01">
  ${drawing.content}
</svg>
`;
}

function matingPath(points, matingEdges, x, y) {
  return points.map((point, index) => {
    if (!matingEdges[index]) return '';
    const next = points[(index + 1) % points.length];
    return `M${number(point[0] + x)} ${number(point[1] + y)} L${number(next[0] + x)} ${number(next[1] + y)}`;
  }).join(' ');
}

function previewContent(drawing) {
  if (!drawing.pieces) return drawing.content;
  const emphasize = document.querySelector('#emphasize-offset').checked;
  const largest = Math.max(...drawing.pieces.map(piece => Math.abs(piece.kerf)));
  // Keep exaggerated shapes within the canvas and their notches open.
  const scale = emphasize && largest > 0 ? Math.min(10, 4 / largest) : 1;
  document.querySelector('#offset-note').textContent = scale > 1
    ? `Offsets exaggerated ×${number(scale)} for visibility. Download uses exact compensation.`
    : 'Offsets shown at actual size. Download uses exact compensation.';
  const outlines = drawing.pieces.map(({ points, matingEdges, x, y, kerf }) => {
    const original = outlinePath(points, x, y);
    if (kerf === 0) return `<path d="${original}" stroke="#000000" />`;
    const adjustedPoints = compensatedOutline(points, kerf * scale, matingEdges);
    const adjusted = outlinePath(adjustedPoints, x, y);
    const color = kerf > 0 ? '#2164bd' : '#b4401f';
    return `<path d="${original} ${adjusted}" fill="${color}" fill-opacity="0.4" fill-rule="evenodd" stroke="none" />
      <path d="${adjusted}" stroke="#000000" />
      <path d="${matingPath(points, matingEdges, x, y)}" stroke="#657080" stroke-dasharray="0.6 0.5" stroke-width="0.08" />
      <path d="${matingPath(adjustedPoints, matingEdges, x, y)}" stroke="${color}" stroke-width="0.12" />`;
  }).join('');
  return `${outlines}<g>${drawing.labels}</g>`;
}

function updatePreview() {
  try {
    if (mode === 'square') {
      const size = readSize();
      if (size === null) throw new Error('Enter a side length from 1 to 1,000 mm.');
      currentDrawing = squareDrawing(size);
    } else {
      currentDrawing = kerfDrawing(readKerfs());
    }
    error.textContent = '';
    downloadButton.disabled = false;
    dimensions.textContent = currentDrawing.description;
    preview.setAttribute('aria-label', currentDrawing.label);
    document.querySelector('#download-hint').textContent = currentDrawing.hint;
    // Preview overlays and optional exaggeration never enter the downloaded SVG.
    preview.innerHTML = `<svg viewBox="0 0 ${currentDrawing.width} ${currentDrawing.height}" aria-hidden="true" fill="none" stroke="#000000" stroke-width="${mode === 'square' ? currentDrawing.width / 600 : 0.09}">${previewContent(currentDrawing)}</svg>`;
  } catch (issue) {
    currentDrawing = null;
    error.textContent = issue.message;
    downloadButton.disabled = true;
    dimensions.textContent = 'Enter valid dimensions';
    preview.innerHTML = '';
    preview.setAttribute('aria-label', 'Preview unavailable: enter valid dimensions');
  }
  sizeInput.setAttribute('aria-invalid', String(mode === 'square' && !currentDrawing));
  kerfInputs.forEach(input => input.setAttribute('aria-invalid', String(mode === 'kerf' && !currentDrawing)));
}

function setMode(nextMode) {
  mode = nextMode;
  document.body.dataset.mode = mode;
  document.querySelector('#square-controls').hidden = mode !== 'square';
  document.querySelector('#kerf-controls').hidden = mode !== 'kerf';
  document.querySelector('#kerf-legend').hidden = mode !== 'kerf';
  document.querySelectorAll('[data-mode]').forEach(button => {
    if (button.tagName === 'BUTTON') button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
  });
  const kerf = mode === 'kerf';
  document.querySelector('#title').innerHTML = kerf ? 'Kerf test<span>02</span>' : 'Square<span>01</span>';
  document.querySelector('.eyebrow').textContent = `GEOMETRY LIBRARY / ${kerf ? '002' : '001'}`;
  document.querySelector('#controls-title').textContent = kerf ? 'Kerf compensation' : 'Dimensions';
  document.querySelector('#description').textContent = kerf ? '20 mm pieces. Compensation only on the mating edges.' : 'Equal sides. Four right angles.';
  document.querySelector('#footer-mode').textContent = kerf ? '02 — Kerf test' : '01 — Square';
  updatePreview();
}

[sizeInput, ...kerfInputs].forEach(input => input.addEventListener('input', updatePreview));
document.querySelectorAll('button[data-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
downloadButton.addEventListener('click', () => {
  if (!currentDrawing) return;
  const blob = new Blob([generateSvg(currentDrawing)], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = currentDrawing.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
document.querySelector('#emphasize-offset').addEventListener('change', updatePreview);
setMode('square');
