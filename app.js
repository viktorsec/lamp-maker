const sizeInput = document.querySelector('#size');
const downloadButton = document.querySelector('#download');
const dimensions = document.querySelector('#dimensions');
const error = document.querySelector('#size-error');
const preview = document.querySelector('#preview');

function readSize() {
  const size = sizeInput.valueAsNumber;
  return Number.isFinite(size) && size >= 1 && size <= 1000 ? size : null;
}

function updatePreview() {
  const size = readSize();
  const valid = size !== null;
  downloadButton.disabled = !valid;
  sizeInput.setAttribute('aria-invalid', String(!valid));
  error.textContent = valid ? '' : 'Enter a side length from 1 to 1,000 mm.';
  if (valid) {
    dimensions.textContent = `${size} × ${size} mm`;
    preview.setAttribute('aria-label', `Preview of a ${size} millimeter square`);
  } else {
    dimensions.textContent = 'Enter a valid size';
    preview.setAttribute('aria-label', 'Square preview unavailable: enter a valid size');
  }
  preview.querySelector('svg').style.visibility = valid ? 'visible' : 'hidden';
}

function generateSvg(size) {
  // A 1 mm margin keeps the full stroke inside the SVG canvas.
  const canvasSize = size + 2;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${canvasSize}mm" height="${canvasSize}mm" viewBox="0 0 ${canvasSize} ${canvasSize}">
  <rect x="1" y="1" width="${size}" height="${size}" fill="none" stroke="#000000" stroke-width="0.01" />
</svg>
`;
}

sizeInput.addEventListener('input', updatePreview);
downloadButton.addEventListener('click', () => {
  const size = readSize();
  if (size === null) return;
  const blob = new Blob([generateSvg(size)], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `square-${size}mm.svg`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

updatePreview();
