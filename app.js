const downloadButton = document.querySelector('#download');
const dimensions = document.querySelector('#dimensions');
const error = document.querySelector('#size-error');
const preview = document.querySelector('#preview');
const kerfInputs = ['min', 'max', 'step'].map(name => document.querySelector(`#kerf-${name}`));
const kumikoInputs = ['width', 'height', 'cell-count', 'strut', 'frame'].map(name => document.querySelector(`#kumiko-${name}`));
const kumikoPattern = document.querySelector('#kumiko-pattern');
const assemblyInputs = ['width', 'height', 'thickness', 'kerf', 'fingers'].map(name => document.querySelector(`#assembly-${name}`));
const bottomInputs = ['offset', 'fingers', 'cord-diameter', 'over'].map(name => document.querySelector(`#assembly-bottom-${name}`));
const legInputs = ['height', 'width'].map(name => document.querySelector(`#assembly-leg-${name}`));
// Initialize every generator before applying the selected material.
[...kerfInputs, ...kumikoInputs, ...assemblyInputs, ...bottomInputs, ...legInputs].forEach(input => { input.value = input.defaultValue; });
const numericValue = input => input.value.trim() === '' || input.validity.badInput ? NaN : Number(input.value);
let mode = 'material';
let currentDrawing = null;
let boxViewer = null;
let boxViewerPromise = null;
let boxPreviewRevision = 0;
const number = value => String(Number(value.toFixed(6)));

const patternDetails = {
  kakuasa: {
    name: 'Kakuasa',
    description: 'Hemp leaves arranged within squares. A geometric variation of the older hemp-leaf motif found in Heian Buddhist decoration. It symbolizes healthy growth, protection, and stability.',
    sources: [
      { url: 'https://engikumiko.shop/en/pages/kumikodesigns', label: 'Kawashima Tategu · Square hemp-leaf symbolism' },
      { url: 'https://www.aisf.or.jp/~jaanus/deta/a/asanoha.htm', label: 'JAANUS · Hemp-leaf history' }
    ]
  },
  kagome: {
    name: 'Kagome',
    description: 'Named for the “eyes,” or openings, in a woven basket. Derived from bamboo basketry, its crossing strips form stars and hexagons. It traditionally represents protection against harmful influences.',
    sources: [
      { url: 'https://www.kagami.jp/english/about/kiriko/', label: 'Kagami Crystal · Basket-weave motif' },
      { url: 'https://akizakura.net/patterndictionary04/', label: 'Akizakura · Protective symbolism' }
    ]
  },
  'masu-tsunagi': {
    name: 'Masu-tsunagi',
    description: 'Linked square measuring boxes. Rooted in everyday grain measures, the motif appears in textiles and decorative screens. It suggests growing prosperity through masu’s wordplay with “increase.”',
    sources: [
      { url: 'https://www.bigsandwoodworking.com/masu-tsunagi-kumiko-pattern/', label: 'Big Sand Woodworking · Name & construction' },
      { url: 'https://www.nippon-chuko.co.jp/chuko-blog/january-2026-update-free-sashiko-pattern-download/', label: 'Nippon Chuko · Measuring-box symbolism' }
    ]
  },
  rindo: {
    name: 'Rindō',
    description: 'Gentian flower. Its floral motif has roots in Heian court dress, later adapted into interlocking wooden flowers. The linked forms symbolize lasting bonds and good relationships.',
    sources: [
      { url: 'https://nirc.nanzan-u.ac.jp/journal/6/article/1047/pdf/download', label: 'Nanzan Institute · Gentian motifs in court dress (PDF)' },
      { url: 'https://engikumiko.shop/en/pages/kumikodesigns', label: 'Kawashima Tategu · Gentian symbolism' }
    ]
  },
  masu: {
    name: 'Masu',
    description: 'Square wooden measuring boxes. A simple lattice traditionally used in sliding screens and as a base for more elaborate patterns.',
    sources: [
      { url: 'https://www.bigsandwoodworking.com/masu-tsunagi-kumiko-pattern/', label: 'Big Sand Woodworking · Measuring-box name' },
      { url: 'https://k-ino.jp/en/kumiko/what-is-kumiko/', label: 'Inomata Art · Screen-grid tradition' }
    ]
  },
  asanoha: {
    name: 'Asanoha',
    description: 'Hemp leaves. Found on Heian Buddhist statues, it became a fashion favorite through Edo kabuki costumes. It symbolizes children’s healthy growth, echoing hemp’s vigorous, upright stems.',
    sources: [
      { url: 'https://www.aisf.or.jp/~jaanus/deta/a/asanoha.htm', label: 'JAANUS · Hemp-leaf history' },
      { url: 'https://www.nippon.com/en/japan-data/h00478/traditional-japanese-patterns.html', label: 'Nippon.com · Healthy-growth symbolism' }
    ]
  },
  goma: {
    name: 'Goma',
    description: 'Sesame plant. Found in samurai dress and decorative screens, it draws on sesame’s traditional medicinal associations. It expresses wishes for health and long life.',
    sources: [
      { url: 'https://japanobjects.com/features/kumiko', label: 'Japan Objects · Sesame motif in samurai dress' },
      { url: 'https://engikumiko.shop/en/pages/kumikodesigns', label: 'Kawashima Tategu · Sesame symbolism' }
    ]
  },
  sakura: {
    name: 'Sakura',
    description: 'Cherry blossoms. Rooted in the blossom-viewing culture of the Heian court, the motif spread through clothing and decorative arts. It represents spring and the fleeting beauty of life.',
    sources: [
      { url: 'https://www.loc.gov/exhibits/cherry-blossoms/cherry-blossoms-in-japanese-cultural-history.html', label: 'Library of Congress · Blossom-viewing history' },
      { url: 'https://www.smb.museum/en/exhibitions/detail/falling-cherry-blossoms/', label: 'Asian Art Museum, Berlin · Blossom symbolism' }
    ]
  },
  shokko: {
    name: 'Shokko',
    description: 'Named for brocade from the ancient kingdom of Shu, in present-day Sichuan. Its textile motif was adopted during the Muromachi period. The interlocking octagons and squares recall richly patterned silk.',
    sources: [
      { url: 'https://umma.umich.edu/objects/obi-2013-2-376/', label: 'University of Michigan Museum of Art · Shu brocade origins' },
      { url: 'https://www.metmuseum.org/art/collection/search/55965', label: 'The Met · Edo brocade example' }
    ]
  },
  senbon: {
    name: 'Senbon',
    description: 'Named for “a thousand slats,” describing its closely spaced bars. Associated with Kyoto townhouse façades, it belongs to a practical architectural lattice tradition. It provides privacy while admitting light.',
    sources: [
      { url: 'https://www.city.kyoto.lg.jp/sogo/cmsfiles/contents/0000062/62090/kyoto.pdf', label: 'Kyoto City · Thousand-slat lattice (PDF)' },
      { url: 'https://www.nippon.com/en/guide-to-japan/gu900011/recognizing-design-features-in-kyoto%E2%80%99s-machiya-townhouses.html', label: 'Nippon.com · Townhouse lattice history' }
    ]
  },
  'tsumiishi-kikko': {
    name: 'Tsumiishi kikko',
    description: 'Tortoise shell. A stacked-stone variation of a shell motif inherited from Chinese ornament and Heian court decoration. It symbolizes longevity.',
    sources: [
      { url: 'https://kumikowoodworking.com/products/tn-118/', label: 'Tanihata · Stacked-stone variation' },
      { url: 'https://www.aisf.or.jp/~jaanus/deta/k/kikkoumon.htm', label: 'JAANUS · Tortoiseshell origins & symbolism' }
    ]
  },
  triangular: {
    name: 'Mitsukude',
    description: 'Three intersecting directions. A triangular lattice from the decorative-screen tradition. Its repeating geometry forms the basis of many intricate floral patterns.',
    sources: [
      { url: 'https://k-ino.jp/en/kumiko/kumiko-technique/', label: 'Inomata Art · Three-way joints & triangular framework' },
      { url: 'https://k-ino.jp/fr/kumiko/les-differentes-techniques/', label: 'Inomata Art · Mitsukude name' }
    ]
  },
  diamond: {
    name: 'Hishi',
    description: 'Water chestnut. Part of the court-textile tradition, the diamond-shaped motif also appears in family crests. It represents vitality and good health, reflecting the plant’s vigorous growth.',
    sources: [
      { url: 'https://www.aisf.or.jp/~jaanus/deta/h/hishimon.htm', label: 'JAANUS · Diamond motifs in court textiles & crests' },
      { url: 'https://en.thebecos.com/blogs/column/10-japanese-patterns-steeped-in-history-and-their-traditional-meaning', label: 'BECOS · Water-chestnut name & symbolism' }
    ]
  }
};

let boostedPatternCellCount = null;
function adjustPatternCellCount() {
  const input = document.querySelector('#kumiko-cell-count');
  const count = numericValue(input);
  const boosted = ['senbon', 'masu'].includes(kumikoPattern.value);
  if (boosted && !boostedPatternCellCount && Number.isInteger(count) && count >= 1 && count <= 100) {
    const adjusted = Math.min(100, Math.ceil(count * 1.5));
    boostedPatternCellCount = { original: count, adjusted };
    input.value = String(adjusted);
  } else if (!boosted && boostedPatternCellCount) {
    if (Number.isInteger(count) && count >= 1 && count <= 100) {
      // Restore exactly after rounding or clamping; preserve manual density edits.
      input.value = String(count === boostedPatternCellCount.adjusted
        ? boostedPatternCellCount.original
        : Math.max(1, Math.round(count / 1.5)));
    }
    boostedPatternCellCount = null;
  }
}

function readKerfs() {
  const values = kerfInputs.map(numericValue);
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

// Clip a convex polygon against a half-plane. The same operation trims cells
// to the frame and offsets their edges to leave a continuous material lattice.
function clipPolygon(points, distance) {
  const result = [];
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    const a = distance(point), b = distance(next);
    if (a >= 0) result.push(point);
    if ((a >= 0) !== (b >= 0)) {
      const t = a / (a - b);
      result.push([point[0] + t * (next[0] - point[0]), point[1] + t * (next[1] - point[1])]);
    }
  });
  return result;
}

function kumikoDrawing(options = {}) {
  if (options.combine !== false && options.pattern === undefined && document.querySelector('#kumiko-combine').checked) {
    return combinedPatternDrawing(options);
  }
  let { panelWidth, panelHeight, pattern = kumikoPattern.value, cellCount, strut, frame } = options;
  const [inputWidth, inputHeight, inputCellCount, inputStrut, inputFrame] = kumikoInputs.map(numericValue);
  cellCount ??= inputCellCount;
  strut ??= inputStrut;
  frame ??= inputFrame;
  const width = panelWidth ?? inputWidth;
  const height = panelHeight ?? inputHeight;
  const limits = [[10, 1000], [10, 1000], [1, 100], [0.5, 20], [1, 100]];
  if ([width, height, cellCount, strut, frame].some((value, index) =>
    !Number.isFinite(value) || value < limits[index][0] || value > limits[index][1])) {
    throw new Error('Enter all pattern dimensions within the displayed ranges.');
  }
  if (!Number.isInteger(cellCount)) throw new Error('Enter a whole pattern cell count from 1 to 100.');
  if (2 * frame >= Math.min(width, height)) throw new Error('Frame must be less than half the smaller panel dimension.');
  const asanoha = pattern === 'asanoha';
  const goma = pattern === 'goma';
  const sakura = pattern === 'sakura';
  const shokko = pattern === 'shokko';
  const senbon = pattern === 'senbon';
  const tsumiishiKikko = pattern === 'tsumiishi-kikko';
  const kakuasa = pattern === 'kakuasa';
  const kagome = pattern === 'kagome';
  const masuTsunagi = pattern === 'masu-tsunagi';
  const rindo = pattern === 'rindo';
  const masu = pattern === 'masu';
  const squareGrid = kakuasa || masuTsunagi || masu;
  const diamond = pattern === 'diamond';
  const innerWidth = width - 2 * frame, innerHeight = height - 2 * frame;
  // Boundary spokes belong inside the frame. Put their centerlines half a
  // lattice width outside the opening so their inner edges meet it exactly.
  const latticeWidth = innerWidth + strut, latticeHeight = innerHeight + strut;
  const latticeOrigin = frame - strut / 2;
  const pitch = latticeWidth / cellCount;
  // Fit complete square rows, or an even number of triangular rows, to the
  // exact opening. Rindō uses fewer rows to keep its fine intersections open.
  const fittedRows = latticeHeight / (pitch * (diamond || shokko ? 1 : Math.sqrt(3)));
  const rows = senbon ? 1 : squareGrid
    ? Math.max(1, Math.round(latticeHeight / pitch))
    : Math.max(2, 2 * (rindo || options.trianglePatterns?.includes('rindo') ? Math.floor(fittedRows) : Math.round(fittedRows)));
  const rowHeight = latticeHeight / rows;
  const cellLimit = senbon ? cellCount : squareGrid
    ? rows * cellCount * (kakuasa ? 6 : masuTsunagi ? 9 : 1)
    : shokko
    ? (rows + 1) * (2 * cellCount + 1) * 4
    : (rows + (kagome ? 2 : 1)) * (cellCount + 2) * (rindo ? 32 : goma ? 14 : sakura ? 12 : asanoha || tsumiishiKikko ? 6 : kagome ? 3 : diamond ? 1 : 2);
  if (cellLimit > 6000) {
    throw new Error('Pattern is too dense. Reduce the pattern cell count or use a less elongated panel.');
  }
  const openings = [];
  const openingPolygons = [];
  function addOpening(cell) {
    const perimeter = cell.reduce((sum, p, i) => {
      const q = cell[(i + 1) % cell.length];
      return sum + Math.hypot(q[0] - p[0], q[1] - p[1]);
    }, 0);
    const twiceArea = Math.abs(cell.reduce((sum, p, i) => {
      const q = cell[(i + 1) % cell.length];
      return sum + p[0] * q[1] - q[0] * p[1];
    }, 0));
    // Validate against the fitted geometry, including the automatically fitted row height.
    if (strut >= 2 * twiceArea / perimeter) {
      throw new Error('Reduce the lattice width or reduce the pattern cell count to leave open cutouts.');
    }
    let polygon = cell;
    cell.forEach((a, index) => {
      const b = cell[(index + 1) % cell.length];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const length = Math.hypot(dx, dy);
      polygon = clipPolygon(polygon, p => (dx * (p[1] - a[1]) - dy * (p[0] - a[0])) / length - strut / 2);
    });
    polygon = clipPolygon(polygon, p => p[0] - frame);
    polygon = clipPolygon(polygon, p => width - frame - p[0]);
    polygon = clipPolygon(polygon, p => p[1] - frame);
    polygon = clipPolygon(polygon, p => height - frame - p[1]);
    const area = Math.abs(polygon.reduce((sum, p, i) => {
      const q = polygon[(i + 1) % polygon.length];
      return sum + p[0] * q[1] - q[0] * p[1];
    }, 0)) / 2;
    // Omit collapsed edge slivers that cannot produce useful cutouts.
    if (polygon.length >= 3 && area > 0.01) {
      if (openingPolygons.length >= 6000) throw new Error('Pattern is too dense. Reduce the pattern cell count.');
      openingPolygons.push(polygon);
      openings.push(outlinePath(polygon, 0, 0));
    }
  }
  function splitCells(cells, distance) {
    return cells.flatMap(cell => [clipPolygon(cell, distance), clipPolygon(cell, p => -distance(p))])
      .map(cell => cell.filter((p, i) => {
        const previous = cell[(i + cell.length - 1) % cell.length];
        return Math.hypot(p[0] - previous[0], p[1] - previous[1]) > 1e-7;
      }))
      .filter(cell => cell.length >= 3 && polygonArea(cell) > 1e-6);
  }
  function addTriangle(triangle) {
    const motif = options.trianglePattern?.(triangle, { pitch, rowHeight, latticeOrigin, rows, cellCount }) ?? pattern;
    const rindo = motif === 'rindo', sakura = motif === 'sakura', goma = motif === 'goma';
    const asanoha = motif === 'asanoha', tsumiishiKikko = motif === 'tsumiishi-kikko', kakuasa = motif === 'kakuasa';
    if (rindo) {
      // Two cevians from each tip form the angular gentian flower and its
      // central hexagon. Partition into convex cells before adding the webs.
      let cells = [triangle];
      triangle.forEach((a, i) => {
        const b = triangle[(i + 1) % 3], c = triangle[(i + 2) % 3];
        for (const t of [3 / 10, 7 / 10]) {
          const end = b.map((value, axis) => value + (c[axis] - value) * t);
          cells = splitCells(cells, p => (end[0] - a[0]) * (p[1] - a[1]) - (end[1] - a[1]) * (p[0] - a[0]));
        }
      });
      cells.forEach(addOpening);
      return;
    }
    if (sakura) {
      // Clip each tip into a small triangle, then join the center to the
      // side midpoints. The three remaining pentagons form the petals.
      const center = [0, 1].map(axis => triangle.reduce((sum, p) => sum + p[axis], 0) / 3);
      const between = (a, b, t) => a.map((value, axis) => value + (b[axis] - value) * t);
      triangle.forEach((a, index) => {
        const b = triangle[(index + 1) % 3], c = triangle[(index + 2) % 3];
        const nextTip = between(a, b, 1 / 4), previousTip = between(a, c, 1 / 4);
        addOpening([a, nextTip, previousTip]);
        addOpening([nextTip, between(a, b, 1 / 2), center, between(a, c, 1 / 2), previousTip]);
      });
      return;
    }
    if (goma) {
      // Goma adds three full-length strips parallel to the triangle's edges.
      // Their crossings form small corner diamonds around a central triangle.
      // Split at each strip centerline, then inset each convex opening so all
      // strips (including the original lattice) retain the requested width.
      let cells = [triangle];
      triangle.forEach((a, index) => {
        const b = triangle[(index + 1) % 3], opposite = triangle[(index + 2) % 3];
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const side = p => dx * (p[1] - a[1]) - dy * (p[0] - a[0]);
        const offset = side(opposite) / 5;
        cells = cells.flatMap(cell => [
          clipPolygon(cell, p => side(p) - offset),
          clipPolygon(cell, p => offset - side(p))
        ]).filter(cell => cell.length >= 3 && polygonArea(cell) > 0.000001);
      });
      cells.forEach(addOpening);
      return;
    }
    if (!asanoha && !tsumiishiKikko && !kakuasa) return addOpening(triangle);
    // Kakuasa's leaves bisect the triangle's angles. Its incenter gives
    // 22.5° branches in a square cell; the centroid skews them to 26.565°.
    const weights = triangle.map((_, i) => kakuasa
      ? Math.hypot(triangle[(i + 1) % 3][0] - triangle[(i + 2) % 3][0],
        triangle[(i + 1) % 3][1] - triangle[(i + 2) % 3][1])
      : 1);
    const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
    const center = [0, 1].map(axis => triangle.reduce((sum, p, i) => sum + p[axis] * weights[i], 0) / weightSum);
    triangle.forEach((p, i) => {
      if (tsumiishiKikko) {
        // Center-to-midpoint spokes make three kites per triangle. Across
        // neighboring triangles these spokes outline stacked hexagons,
        // while the original triangular lattice crosses their interiors.
        const next = triangle[(i + 1) % 3], previous = triangle[(i + 2) % 3];
        addOpening([p, p.map((value, axis) => (value + next[axis]) / 2), center,
          p.map((value, axis) => (value + previous[axis]) / 2)]);
      } else {
        addOpening([p, triangle[(i + 1) % 3], center]);
      }
    });
  }
  if (squareGrid) {
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < cellCount; column++) {
        const x = latticeOrigin + column * pitch, y = latticeOrigin + row * rowHeight;
        const a = [x, y], b = [x + pitch, y], c = [x + pitch, y + rowHeight], d = [x, y + rowHeight];
        if (kakuasa) {
          // Alternating diagonals let the leaf spokes meet at grid vertices.
          const triangles = (row + column) % 2 === 0 ? [[a, b, c], [a, c, d]] : [[a, b, d], [b, c, d]];
          triangles.forEach(addTriangle);
        } else if (masuTsunagi) {
          // Two parallel strips in each diagonal direction create connected
          // measuring-cup squares, corner pentagons and edge triangles.
          let cells = [[a, b, c, d]];
          const u = p => (p[0] - x) / pitch, v = p => (p[1] - y) / rowHeight;
          for (const offset of [3 / 4, 5 / 4]) cells = splitCells(cells, p => u(p) + v(p) - offset);
          for (const offset of [-1 / 4, 1 / 4]) cells = splitCells(cells, p => u(p) - v(p) - offset);
          cells.forEach(addOpening);
        } else {
          if (strut >= Math.min(pitch, rowHeight)) throw new Error('Reduce the lattice width or reduce the pattern cell count to leave open cutouts.');
          addOpening([a, b, c, d]);
        }
      }
    }
  } else if (kagome) {
    // A trihexagonal tiling: hexagons touch at vertices and leave a triangle
    // in every gap. It uses three continuous families of parallel strips.
    for (let row = -1; row <= rows; row++) {
      for (let column = -1; column <= cellCount; column++) {
        const x = latticeOrigin + column * pitch + ((row % 2 + 2) % 2) * pitch / 2;
        const y = latticeOrigin + row * rowHeight;
        addOpening([[-0.5, 0], [-0.25, -0.5], [0.25, -0.5], [0.5, 0], [0.25, 0.5], [-0.25, 0.5]]
          .map(([u, v]) => [x + u * pitch, y + v * rowHeight]));
        addOpening([[x + pitch / 2, y], [x + 3 * pitch / 4, y + rowHeight / 2], [x + pitch / 4, y + rowHeight / 2]]);
        addOpening([[x - pitch / 4, y + rowHeight / 2], [x + pitch / 4, y + rowHeight / 2], [x, y + rowHeight]]);
      }
    }
  } else if (senbon) {
    // Full-height parallel slats are joined by the frame at both ends.
    // Unlike the repeating motifs, Senbon has no horizontal interior grid.
    if (strut >= pitch) {
      throw new Error('Reduce the lattice width or reduce the pattern cell count to leave open cutouts.');
    }
    for (let column = 0; column < cellCount; column++) {
      const x = latticeOrigin + column * pitch, y = latticeOrigin;
      addOpening([[x, y], [x + pitch, y], [x + pitch, y + latticeHeight], [x, y + latticeHeight]]);
    }
  } else if (shokko) {
    // A checkerboard of octagons and squares, crossed by a straight grid.
    // Two center spacings make one complete repeat; even counts keep the
    // opposite frame edges on matching symmetry axes.
    const radius = 1 / Math.sqrt(2), corner = 1 - radius;
    for (let row = 0; row <= rows; row++) {
      for (let column = 0; column <= 2 * cellCount; column++) {
        const quarter = (row + column) % 2 === 0
          ? [[0, 0], [radius, 0], [radius, corner], [corner, radius], [0, radius]]
          : [[0, 0], [corner, 0], [corner, corner], [0, corner]];
        for (let turn = 0; turn < 4; turn++) {
          addOpening(quarter.map(point => {
            let [x, y] = point;
            for (let rotation = 0; rotation < turn; rotation++) [x, y] = [-y, x];
            return [latticeOrigin + (column + x) * pitch / 2, latticeOrigin + (row + y) * rowHeight];
          }));
        }
      }
    }
  } else {
    for (let row = 0; row < rows + (diamond ? 1 : 0); row++) {
      for (let column = -1; column <= cellCount; column++) {
        const x = latticeOrigin + column * pitch + (row % 2) * pitch / 2;
        const y = latticeOrigin + row * rowHeight;
        if (diamond) {
          addOpening([[x, y - rowHeight], [x + pitch / 2, y], [x, y + rowHeight], [x - pitch / 2, y]]);
          continue;
        }
        addTriangle([[x, y], [x + pitch, y], [x + pitch / 2, y + rowHeight]]);
        addTriangle([[x, y], [x + pitch / 2, y + rowHeight], [x - pitch / 2, y + rowHeight]]);
      }
    }
  }
  if (!openings.length) throw new Error('No openings fit inside the frame. Reduce frame or lattice width, or increase the panel size.');
  const outer = outlinePath([[0, 0], [width, 0], [width, height], [0, height]], 0, 0);
  const name = patternDetails[pattern].name;
  const rounded = value => number(Number(value.toFixed(3)));
  return { width, height, openingPolygons, patternName: name,
    cellDimensions: senbon
      ? `Cell: ${rounded(pitch)} mm wide · ${rounded(latticeHeight)} mm tall`
      : squareGrid || kagome
      ? `Cell: ${rounded(pitch)} mm wide · ${rounded(rowHeight)} mm tall`
      : diamond || shokko
      ? `Cell: ${rounded(pitch)} mm wide · ${rounded(rowHeight * 2)} mm tall`
      : `Cell: ${rounded(pitch)} mm base · ${rounded(Math.hypot(pitch / 2, rowHeight))} mm sides`,
    content: `<g id="cut-outlines"><path id="outer-frame" d="${outer}" /><g id="pattern-openings">${openings.map(d => `<path d="${d}" />`).join('')}</g></g>`,
    preview: `<path d="${outer} ${openings.join(' ')}" fill="#c9a775" fill-rule="evenodd" stroke="#202f61" />`,
    filename: `kumiko-${pattern}-${number(width)}x${number(height)}mm.svg`,
    description: `${number(width)} × ${number(height)} mm`,
    label: `${name} Kumiko panel, ${number(width)} by ${number(height)} millimeters, with ${openings.length} cutouts`,
    hint: `${openings.length} closed cutouts + outer frame · millimeter units` };
}

// Clip two full-size lattices into disjoint bands. Their shared rail keeps
// every opening closed and connected to the same outer frame for cutting.
function combinedPatternDrawing(options) {
  const layout = document.querySelector('#kumiko-combination-layout').value || 'bands';
  if (layout !== 'bands') return sharedCellPatternDrawing(options, layout);
  const first = kumikoDrawing({ ...options, combine: false });
  const secondPattern = document.querySelector('#kumiko-second-pattern').value;
  if (!patternDetails[secondPattern]) throw new Error('Choose a bottom pattern.');
  const second = kumikoDrawing({ ...options, pattern: secondPattern, combine: false });
  const share = numericValue(document.querySelector('#kumiko-split'));
  if (!Number.isFinite(share) || share < 20 || share > 80) throw new Error('Enter a top band share from 20 to 80%.');
  const frame = options.frame ?? numericValue(document.querySelector('#kumiko-frame'));
  const rail = options.strut ?? numericValue(document.querySelector('#kumiko-strut'));
  const split = frame + (first.height - 2 * frame) * share / 100;
  const bands = [first, second].map((drawing, index) => drawing.openingPolygons.flatMap(points => {
    const clipped = clipPolygon(points, point => index === 0 ? split - rail / 2 - point[1] : point[1] - split - rail / 2);
    return clipped.length >= 3 && polygonArea(clipped) > 0.01 ? [clipped] : [];
  }));
  if (bands.some(band => !band.length)) throw new Error('Both pattern bands need openings. Adjust the split, frame, lattice width, or panel size.');
  const openingPolygons = bands.flat();
  const openings = openingPolygons.map(points => outlinePath(points, 0, 0));
  const outer = outlinePath([[0, 0], [first.width, 0], [first.width, first.height], [0, first.height]], 0, 0);
  const name = `${first.patternName} + ${second.patternName}`;
  return { ...first, openingPolygons, patternName: name, combination: { layout: 'bands', split, rail, share },
    cellDimensions: `Two bands · ${number(share)}% top · ${number(rail)} mm divider`,
    content: `<g id="cut-outlines"><path id="outer-frame" d="${outer}" /><g id="pattern-openings">${openings.map(path => `<path d="${path}" />`).join('')}</g></g>`,
    preview: `<path d="${outer} ${openings.join(' ')}" fill="#c9a775" fill-rule="evenodd" stroke="#202f61" />`,
    filename: `kumiko-${kumikoPattern.value}-${secondPattern}-${number(share)}pct-${number(first.width)}x${number(first.height)}mm.svg`,
    label: `${name} combined panel, ${number(first.width)} by ${number(first.height)} millimeters. Top band ${number(share)} percent, with a ${number(rail)} millimeter solid divider. ${openings.length} cutouts.`,
    hint: `${openings.length} closed cutouts + outer frame · two pattern bands · millimeter units` };
}

const sharedCellPatterns = ['triangular', 'asanoha', 'goma', 'sakura', 'tsumiishi-kikko', 'rindo'];

// Evaluate one continuous composition around the perimeter. Periodicity
// closes the last Left-to-Front seam as well as the three other corners.
function interlockingAccentAt(x, y, width, height, rowHeight, wrap) {
  const step = 0.13 * Math.sin(y / rowHeight * Math.PI / 2);
  if (!wrap) return x / width + y / height > 1 + step;
  const span = wrap.span ?? wrap.width;
  const perimeter = span * wrap.count;
  const globalX = wrap.index * span + x - (wrap.origin ?? 0);
  const lowerBank = y / height > 0.5 + 0.23 * Math.sin(2 * Math.PI * globalX / perimeter) + step * 0.5;
  // Continue the lid's dense edge cells down both adjoining walls. Sample
  // farther into the lid as we descend, tapering the cap above the river.
  const along = ((globalX / span - 1 + wrap.count / 2) % wrap.count + wrap.count) % wrap.count - wrap.count / 2;
  const frame = wrap.frame ?? 0;
  const depth = Math.max(0, y - frame) / (height - 2 * frame);
  const inset = depth * wrap.width * 2.8;
  const lidX = along <= 0 ? wrap.width * (1 + along) : wrap.width - inset;
  const lidY = along <= 0 ? wrap.width - inset : wrap.width * (1 - along);
  const cornerCap = Math.abs(along) < 1 && depth < 0.32
    && interlockingAccentAt(lidX, lidY, wrap.width, wrap.width, wrap.lidRowHeight ?? rowHeight);
  return lowerBank || cornerCap;
}

// Infill whole triangles on one shared lattice. Six triangles around a vertex
// make a hexagonal island; no separate border or clipped motifs are needed.
function sharedCellPatternDrawing(options, layout) {
  if (!['islands', 'interlock'].includes(layout)) throw new Error('Choose a combination layout.');
  const background = kumikoPattern.value;
  const accent = document.querySelector('#kumiko-second-pattern').value;
  if (![background, accent].every(pattern => sharedCellPatterns.includes(pattern))) {
    throw new Error('Shared-lattice layouts need compatible triangular patterns.');
  }
  const width = options.panelWidth ?? numericValue(document.querySelector('#kumiko-width'));
  const height = options.panelHeight ?? numericValue(document.querySelector('#kumiko-height'));
  if (layout === 'interlock' && !options.wrap && options.surface !== 'top') {
    options = { ...options, wrap: { width, index: 0, count: 4 } };
  }
  if (layout === 'interlock' && options.wrap) {
    const frame = numericValue(document.querySelector('#kumiko-frame'));
    const strut = numericValue(document.querySelector('#kumiko-strut'));
    const span = options.wrap.width - 2 * frame + strut;
    const count = (options.cellCount ?? numericValue(document.querySelector('#kumiko-cell-count'))) * span / (width - 2 * frame + strut);
    const fittedRows = span / (span / count * Math.sqrt(3));
    const rows = Math.max(2, 2 * ([background, accent].includes('rindo') ? Math.floor(fittedRows) : Math.round(fittedRows)));
    options = { ...options, wrap: { ...options.wrap, span, origin: frame - strut / 2, frame, lidRowHeight: span / rows } };
  }
  let centers;
  const counts = { background: 0, accent: 0 };
  const drawing = kumikoDrawing({ ...options, pattern: 'triangular', combine: false, trianglePatterns: [background, accent],
    trianglePattern(triangle, grid) {
      centers ??= [[0.34, 0.24], [0.66, 0.5], [0.34, 0.76]].map(([u, v]) => {
        const row = Math.max(1, Math.min(grid.rows - 1, Math.round((height * v - grid.latticeOrigin) / grid.rowHeight)));
        const shift = (row % 2) * grid.pitch / 2;
        const column = Math.max(0, Math.min(grid.cellCount, Math.round((width * u - grid.latticeOrigin - shift) / grid.pitch)));
        return [grid.latticeOrigin + column * grid.pitch + shift, grid.latticeOrigin + row * grid.rowHeight];
      });
      const center = [0, 1].map(axis => triangle.reduce((sum, point) => sum + point[axis], 0) / 3);
      const useAccent = layout === 'islands'
        ? centers.some(point => triangle.some(vertex => Math.hypot(vertex[0] - point[0], vertex[1] - point[1]) < 1e-6))
        : interlockingAccentAt(center[0], center[1], width, height, grid.rowHeight, options.wrap);
      // Count only triangles that intersect the panel, not the generated margin.
      if (center[0] > 0 && center[0] < width && center[1] > 0 && center[1] < height) counts[useAccent ? 'accent' : 'background']++;
      return useAccent ? accent : background;
    }
  });
  if (!options.wrap && (!counts.background || !counts.accent)) throw new Error('Use more cells across the width to fit both shared-lattice patterns.');
  const name = `${patternDetails[background].name} + ${patternDetails[accent].name}`;
  const layoutName = layout === 'islands' ? 'Hexagonal islands' : 'River';
  return { ...drawing, patternName: name, combination: { layout, counts, ...(options.wrap ? { wrap: options.wrap } : {}) },
    cellDimensions: `${layoutName} · shared triangular lattice`,
    filename: `kumiko-${background}-${accent}-${layout}-${number(width)}x${number(height)}mm.svg`,
    label: `${name}, ${layoutName.toLowerCase()} on a shared lattice, ${number(width)} by ${number(height)} millimeters.`,
    hint: `${drawing.openingPolygons.length} closed cutouts + outer frame · ${layoutName.toLowerCase()} · millimeter units` };
}

// Pattern cells are convex. Inset their cut paths by half the kerf so the
// laser produces the intended openings without thinning the lattice.
function insetPolygon(points, distance) {
  let polygon = points;
  points.forEach((a, index) => {
    const b = points[(index + 1) % points.length];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const length = Math.hypot(dx, dy);
    if (length > 0) polygon = clipPolygon(polygon, p => (dx * (p[1] - a[1]) - dy * (p[0] - a[0])) / length - distance);
  });
  return polygon;
}
function polygonArea(points) {
  return Math.abs(points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length];
    return sum + p[0] * q[1] - q[0] * p[1];
  }, 0)) / 2;
}

function fittedPatternOpenings(pattern, edge, width, bottom, kerf) {
  return pattern.openingPolygons.flatMap(points => {
    let polygon = clipPolygon(points, p => p[0] - edge);
    polygon = clipPolygon(polygon, p => width - edge - p[0]);
    polygon = clipPolygon(polygon, p => p[1] - edge);
    polygon = clipPolygon(polygon, p => bottom - p[1]);
    if (polygon.length < 3 || polygonArea(polygon) <= 0.01) return [];
    const cutPoints = insetPolygon(polygon, kerf / 2);
    if (cutPoints.length < 3 || polygonArea(cutPoints) <= 0.01) return [];
    return [{ points: polygon, cutPoints }];
  });
}

// Front/back own the corner on alternating height bands; left/right own
// the other bands. A recessed edge is exactly one material thickness deep.
function fingerPanelOutline(width, height, thickness, fingers, front, legHeight = 0, legWidth = 0) {
  const segments = 2 * fingers - 1;
  const pitch = height / segments;
  const inset = band => (band % 2 === 0) === front ? 0 : thickness;
  const topPitch = (width - 2 * thickness) / segments;
  const topDepth = band => band % 2 === 0 ? 0 : thickness;
  const points = [[inset(0), 0], [thickness, 0]];
  for (let band = 0; band < segments; band++) {
    const x = band === segments - 1 ? width - thickness : thickness + (band + 1) * topPitch;
    points.push([x, topDepth(band)]);
    if (band < segments - 1) points.push([x, topDepth(band + 1)]);
  }
  points.push([width - inset(0), 0]);
  for (let band = 0; band < segments; band++) {
    const y = band === segments - 1 ? height : (band + 1) * pitch;
    points.push([width - inset(band), y]);
    if (band < segments - 1) points.push([width - inset(band + 1), y]);
  }
  const left = inset(segments - 1), right = width - left;
  if (legHeight > 0) {
    points.push([right, height + legHeight], [right - legWidth, height + legHeight],
      [right - legWidth, height], [left + legWidth, height],
      [left + legWidth, height + legHeight], [left, height + legHeight]);
  }
  points.push([left, height]);
  for (let band = segments - 1; band >= 0; band--) {
    const y = band * pitch;
    // The closing edge returns to the first point, avoiding a zero-length edge.
    if (band > 0) {
      points.push([inset(band), y], [inset(band - 1), y]);
    }
  }
  return cleanOrthogonalOutline(points);
}

function cleanOrthogonalOutline(points) {
  const unique = points.filter((point, i) => {
    const previous = points[(i + points.length - 1) % points.length];
    return point[0] !== previous[0] || point[1] !== previous[1];
  });
  return unique.filter((point, i) => {
    const previous = unique[(i + unique.length - 1) % unique.length];
    const next = unique[(i + 1) % unique.length];
    return !(previous[0] === point[0] && point[0] === next[0]) &&
      !(previous[1] === point[1] && point[1] === next[1]);
  });
}

// The top fits within the same outside footprint. Its corner squares are
// left to the walls; each remaining edge complements the wall's top notches.
function topPanelOutline(width, thickness, fingers) {
  const segments = 2 * fingers - 1;
  const pitch = (width - 2 * thickness) / segments;
  const depth = band => band % 2 === 0 ? thickness : 0;
  const edge = [[thickness, thickness]];
  for (let band = 0; band < segments; band++) {
    const x = band === segments - 1 ? width - thickness : thickness + (band + 1) * pitch;
    edge.push([x, depth(band)]);
    if (band < segments - 1) edge.push([x, depth(band + 1)]);
  }
  const points = [];
  for (let side = 0; side < 4; side++) {
    for (const point of edge) {
      let [x, y] = point;
      for (let turn = 0; turn < side; turn++) [x, y] = [width - y, x];
      points.push([x, y]);
    }
  }
  return cleanOrthogonalOutline(points);
}

// A U-shaped cord exit in the center gap between bottom fingers. The rounded
// end seats a full cord diameter inside the wall, with an open route to the edge.
function bottomPanelOutline(width, thickness, fingers, diameter, kerf = 0) {
  const outline = topPanelOutline(width, thickness, fingers + 1);
  const points = compensatedOutline(outline, kerf, outline.map(() => true));
  const center = width / 2;
  const radius = diameter / 2;
  const cutRadius = radius - kerf / 2;
  const notch = [[center - cutRadius, thickness - kerf / 2]];
  for (let step = 0; step <= 64; step++) {
    const angle = Math.PI * (1 - step / 64);
    notch.push([center + cutRadius * Math.cos(angle), thickness + radius + cutRadius * Math.sin(angle)]);
  }
  notch.push([center + cutRadius, thickness - kerf / 2]);
  const edge = outline.findIndex((point, index) => {
    const next = outline[(index + 1) % outline.length];
    return point[1] === thickness && next[1] === thickness && point[0] < center && next[0] > center;
  });
  points.splice(edge + 1, 0, ...notch);
  return points;
}

function assemblyDrawing() {
  const [panelWidth, panelHeight, thickness, kerf, fingers] = assemblyInputs.map(numericValue);
  const values = [panelWidth, panelHeight, thickness, kerf, fingers];
  const limits = [[10, 1000], [10, 1000], [0.5, 50], [0, 1], [2, 50]];
  if (values.some((value, i) => !Number.isFinite(value) || value < limits[i][0] || value > limits[i][1])) {
    throw new Error('Enter all assembly dimensions within the displayed ranges.');
  }
  if (!Number.isInteger(fingers)) throw new Error('Enter a whole finger count from 2 to 50.');
  if (kerf >= thickness) throw new Error('Cut kerf must be smaller than the material thickness.');
  if (panelWidth <= 2 * thickness + kerf) throw new Error('Panel width must exceed twice the material thickness plus the kerf.');
  const legHeight = numericValue(legInputs[0]);
  const legWidth = numericValue(legInputs[1]);
  if (!Number.isFinite(legHeight) || legHeight < 0.5 || legHeight > 100) throw new Error('Enter a leg height from 0.5 to 100 mm.');
  if (!Number.isFinite(legWidth) || legWidth < 1 || legWidth > 100) throw new Error('Enter a leg width from 1 to 100 mm.');
  if (legWidth <= kerf + 0.5) throw new Error('Leg width must exceed kerf + 0.5 mm.');
  if (panelWidth - 2 * thickness - 2 * legWidth <= kerf + 0.5) throw new Error('Reduce leg width or increase panel width to leave an opening between the legs.');
  const [bottomOffset, bottomFingers, cordDiameter, bottomOver] = bottomInputs.map(numericValue);
  if (!Number.isFinite(bottomOffset) || bottomOffset < 0.5 || bottomOffset > 1000) throw new Error('Enter clearance under fingers from 0.5 to 1,000 mm.');
  if (!Number.isFinite(bottomOver) || bottomOver < 0.5 || bottomOver > 1000) throw new Error('Enter clearance over fingers from 0.5 to 1,000 mm.');
  if (bottomOver <= kerf + 0.5) throw new Error('Clearance over fingers must exceed kerf + 0.5 mm.');
  const frameWidth = numericValue(document.querySelector('#kumiko-frame'));
  // The bottom frame is shared with the clearance above the bottom fingers.
  const bodyHeight = panelHeight - frameWidth + bottomOver + thickness + bottomOffset;
  const totalHeight = bodyHeight + legHeight;
  if (bodyHeight <= thickness + kerf) throw new Error('Increase panel height to leave room for the wall body and top joints.');
  const pitch = bodyHeight / (2 * fingers - 1);
  if (pitch <= kerf + 0.5) throw new Error('Use fewer fingers or a taller panel: joint segments must exceed kerf + 0.5 mm.');
  const topPitch = (panelWidth - 2 * thickness) / (2 * fingers - 1);
  if (topPitch <= kerf + 0.5) throw new Error('Use fewer fingers or a wider panel: top joint segments must exceed kerf + 0.5 mm.');
  const bottomPitch = (panelWidth - 2 * thickness) / (2 * bottomFingers + 1);
  const slotTop = bodyHeight - bottomOffset - thickness;
  if (![2, 4].includes(bottomFingers)) throw new Error('Choose 2 or 4 bottom fingers per edge.');
  if (bottomOffset <= kerf + 0.5) throw new Error('Clearance under fingers must exceed kerf + 0.5 mm to keep the windows closed.');
  if (slotTop <= thickness + kerf + 0.5) throw new Error('Reduce bottom clearance or increase panel height to leave material between bottom windows and top joints.');
  if (bottomPitch <= kerf + 0.5) throw new Error('Use fewer bottom fingers or a wider panel: bottom fingers must exceed kerf + 0.5 mm.');
  if (!Number.isFinite(cordDiameter) || cordDiameter < 1 || cordDiameter > 100) throw new Error('Enter a cord diameter from 1 to 100 mm.');
  if (cordDiameter <= kerf + 0.5) throw new Error('Cord diameter must exceed kerf + 0.5 mm.');
  if (cordDiameter + kerf + 0.5 >= bottomPitch) throw new Error('Reduce cord diameter or use fewer bottom fingers to leave material beside the cord notch.');
  const wrapInterlocking = document.querySelector('#kumiko-combine').checked && document.querySelector('#kumiko-combination-layout').value === 'interlock';
  const wrappedPattern = index => kumikoDrawing({ panelWidth, panelHeight, wrap: { width: panelWidth, index, count: 4 } });
  const pattern = wrapInterlocking ? wrappedPattern(0) : kumikoDrawing();
  const latticeWidth = numericValue(document.querySelector('#kumiko-strut'));
  const web = Math.max(0.5, latticeWidth);
  const patternEdge = Math.max(frameWidth, thickness + web);
  const patternBottom = Math.min(panelHeight - frameWidth, slotTop - web);
  // The drawing sheet order differs from the assembled perimeter order:
  // Front -> Right -> Back -> Left, all following each panel's local +X.
  const wallPatterns = wrapInterlocking ? [pattern, wrappedPattern(3), wrappedPattern(2), wrappedPattern(1)] : Array(4).fill(pattern);
  const wallOpenings = wallPatterns.map(wall => fittedPatternOpenings(wall, patternEdge, panelWidth, patternBottom, kerf));
  const wallOpeningCount = wallOpenings.reduce((sum, openings) => sum + openings.length, 0);
  if (wallOpenings.some(openings => !openings.length)) throw new Error('No pattern openings fit above the bottom slots. Reduce the frame, lattice width, or bottom clearance, or increase the panel dimensions.');
  // Bands continue around the walls; the lid uses their upper pattern alone.
  const topPattern = kumikoDrawing({ panelWidth, panelHeight: panelWidth, surface: 'top',
    ...(pattern.combination?.layout === 'bands' ? { combine: false } : {}) });
  const topOpenings = fittedPatternOpenings(topPattern, patternEdge, panelWidth, panelWidth - patternEdge, kerf);
  if (!topOpenings.length) throw new Error('No pattern openings fit inside the top joints. Reduce the frame or lattice width, or increase the panel width.');
  const margin = 2 + kerf / 2, gap = 8 + kerf;
  const labelSpace = Math.min(panelWidth / 3, Math.max(12, panelWidth / 15));
  const width = 2 * panelWidth + gap + 2 * margin;
  const height = 2 * (totalHeight + labelSpace + gap) + panelWidth + labelSpace + 2 * margin;
  // Preview depth is capped to keep fingers open and the panel bodies intact.
  // The exact cut points and exported paths always use material thickness.
  const previewScale = document.querySelector('#exaggerate-fingers').checked
    ? Math.max(1, Math.min(4, (patternEdge - web) / thickness, panelWidth / (8 * thickness), bodyHeight / (8 * thickness), pitch / (2 * thickness),
      (panelWidth - 2 * legWidth - kerf - 0.5) / (2 * thickness),
      (thickness + bottomPitch / 2) / thickness,
      (panelWidth - (cordDiameter + kerf + 0.5) * (2 * bottomFingers + 1)) / (2 * thickness),
      (slotTop - kerf - 0.5) / thickness))
    : 1;
  const previewThickness = thickness * previewScale;
  const panelNames = ['Front', 'Left', 'Back', 'Right', 'Top', 'Bottom'];
  const panels = panelNames.map((name, index) => {
    const points = name === 'Bottom' ? bottomPanelOutline(panelWidth, thickness, bottomFingers, cordDiameter)
      : name === 'Top' ? topPanelOutline(panelWidth, thickness, fingers)
      : fingerPanelOutline(panelWidth, bodyHeight, thickness, fingers, name === 'Front' || name === 'Back', legHeight, legWidth);
    const cutPoints = name === 'Bottom' ? bottomPanelOutline(panelWidth, thickness, bottomFingers, cordDiameter, kerf)
      : compensatedOutline(points, kerf, points.map(() => true));
    const x = margin + (index % 2) * (panelWidth + gap);
    const y = margin + labelSpace + Math.floor(index / 2) * (totalHeight + labelSpace + gap);
    const previewPoints = previewScale === 1 ? cutPoints : (() => {
      const shape = name === 'Bottom' ? bottomPanelOutline(panelWidth, previewThickness, bottomFingers, cordDiameter, kerf)
        : name === 'Top' ? topPanelOutline(panelWidth, previewThickness, fingers)
        : fingerPanelOutline(panelWidth, bodyHeight, previewThickness, fingers, name === 'Front' || name === 'Back', legHeight, legWidth);
      return name === 'Bottom' ? shape : compensatedOutline(shape, kerf, shape.map(() => true));
    })();
    const windows = [];
    if (index < 4) {
      for (let finger = 0; finger < bottomFingers; finger++) {
        const left = thickness + (2 * finger + 1) * bottomPitch;
        const right = left + bottomPitch;
        const points = [[left, slotTop], [right, slotTop], [right, slotTop + thickness], [left, slotTop + thickness]];
        // Internal openings shrink by half the kerf; the cut widens them back
        // to the nominal finger width and material thickness.
        const cutPoints = compensatedOutline(points, -kerf, points.map(() => true));
        windows.push({ points, cutPoints, path: outlinePath(cutPoints, x, y) });
      }
    }
    const panelOpenings = index < 4 ? wallOpenings[index] : name === 'Top' ? topOpenings : [];
    const openings = panelOpenings.map(opening => ({ ...opening, path: outlinePath(opening.cutPoints, x, y) }));
    return { name, points, cutPoints, windows, openings, x, y, path: outlinePath(cutPoints, x, y), previewPath: outlinePath(previewPoints, x, y) };
  });
  const content = `<g id="cut-outlines">${panels.map(panel => `<g id="panel-${panel.name.toLowerCase()}"><title>${panel.name}</title><path d="${panel.path}" />${panel.openings.length ? `<g id="${panel.name.toLowerCase()}-pattern-openings">${panel.openings.map(opening => `<path d="${opening.path}" />`).join('')}</g>` : ''}${panel.windows.length ? `<g id="${panel.name.toLowerCase()}-bottom-windows">${panel.windows.map(window => `<path d="${window.path}" />`).join('')}</g>` : ''}</g>`).join('')}</g>`;
  return { width, height, panels, content, patternName: pattern.patternName,
    model: { panelWidth, panelHeight, frameWidth, bodyHeight, thickness, legHeight, bottomOffset, bottomOver, cordDiameter, totalHeight },
    previewNote: previewScale > 1
      ? `Joint depth exaggerated ×${number(Number(previewScale.toFixed(2)))} for visibility. SVG uses exact dimensions.`
      : 'Joint depth shown at actual size. SVG uses exact dimensions.',
    preview: panels.map(panel => `<text x="${number(panel.x)}" y="${number(panel.y - labelSpace / 4)}" fill="#202f61" stroke="none" font-family="monospace" font-size="${number(labelSpace * 0.65)}">${panel.name.toUpperCase()}</text><path d="${panel.previewPath} ${panel.openings.map(opening => opening.path).join(' ')} ${panel.windows.map(window => window.path).join(' ')}" fill="#c9a775" fill-rule="evenodd" stroke="#202f61" />`).join(''),
    joints: `${fingers} front/back fingers · ${fingers - 1} left/right and top fingers per edge · ${number(Number(pitch.toFixed(3)))} mm vertical segments · ${number(Number(topPitch.toFixed(3)))} mm top segments · ${number(thickness)} mm joint depth · Bottom: ${bottomFingers} fingers per edge, ${number(Number(bottomPitch.toFixed(3)))} mm wide, ${number(bottomOffset)} mm under / ${number(bottomOver)} mm over · ${number(cordDiameter)} mm cord notch`,
    filename: `assembly-${kumikoPattern.value}${pattern.combination ? `-${document.querySelector('#kumiko-second-pattern').value}-${pattern.combination.layout === 'bands' ? `${number(pattern.combination.share)}pct` : pattern.combination.layout}` : ''}-${number(panelWidth)}x${number(totalHeight)}mm-total-${number(legHeight)}mm-legs-${number(thickness)}mm-material.svg`,
    description: `Box: ${number(panelWidth)} × ${number(panelWidth)} × ${number(totalHeight)} mm (including legs)`,
    label: `${panels.length} box panels: ${panelNames.join(', ')}. ${pattern.patternName} pattern with ${wallOpeningCount} cutouts across the side walls and ${topOpenings.length} in the top.${wrapInterlocking ? ' The river continues around Front, Right, Back, Left and closes at the front seam.' : ''} Bottom fingers fit ${4 * bottomFingers} closed wall windows. A ${number(cordDiameter)} millimeter cord notch opens from the center of one bottom edge. Two ${legWidth} millimeter wide, ${legHeight} millimeter high legs per wall. Outside size ${panelWidth} by ${panelWidth} by ${totalHeight} millimeters including legs. Pattern panel height ${panelHeight} millimeters. Wall body height ${bodyHeight} millimeters.`,
    hint: `${panels.length} panel outlines + ${wallOpeningCount + topOpenings.length} pattern cutouts + ${4 * bottomFingers} windows · kerf compensated · millimeter units` };
}

function matingPath(points, matingEdges, x, y) {
  return points.map((point, index) => {
    if (!matingEdges[index]) return '';
    const next = points[(index + 1) % points.length];
    return `M${number(point[0] + x)} ${number(point[1] + y)} L${number(next[0] + x)} ${number(next[1] + y)}`;
  }).join(' ');
}

function previewContent(drawing) {
  if (drawing.preview) return drawing.preview;
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

function updateBoxPreview(drawing) {
  const revision = ++boxPreviewRevision;
  const loading = document.querySelector('#box-loading');
  const stage = document.querySelector('#box-canvas');
  document.querySelector('#box-error').textContent = '';
  document.querySelector('#box-dimensions').textContent = drawing.description;
  document.querySelector('#box-material').textContent = `${savedMaterials.find(material => material.id === selectedMaterialId).name} · ${number(drawing.model.thickness)} mm`;
  const details = patternDetails[kumikoPattern.value];
  document.querySelector('#box-pattern-name').textContent = drawing.patternName || details.name;
  document.querySelector('#box-pattern-description').textContent = document.querySelector('#kumiko-combine').checked
    ? document.querySelector('#kumiko-combination-layout').value === 'bands'
      ? `Two pattern bands joined by a solid divider. ${details.name} above; ${patternDetails[document.querySelector('#kumiko-second-pattern').value].name} below.`
      : `${details.name} and ${patternDetails[document.querySelector('#kumiko-second-pattern').value].name} share one triangular lattice, with ${document.querySelector('#kumiko-combination-layout').value === 'islands' ? 'hexagonal motif islands' : 'a river of simpler cells flowing around all four walls'}.`
    : details.description;
  stage.setAttribute('aria-label', `Assembled 3D box. ${drawing.label}`);
  loading.hidden = false;
  stage.hidden = true;
  if (!boxViewerPromise) {
    boxViewerPromise = import('./preview3d.js?v=44').then(module => {
      boxViewer = module.createBoxViewer(stage);
      boxViewer.setVisible(mode === 'preview');
      return boxViewer;
    });
  }
  boxViewerPromise.then(viewer => {
    if (mode !== 'preview' || revision !== boxPreviewRevision) return;
    stage.hidden = false;
    viewer.update(drawing);
    syncEnvironmentLight();
    viewer.setPaperEnabled(document.querySelector('#box-paper').checked);
    viewer.setLampEnabled(document.querySelector('#box-lamp').checked);
    loading.hidden = true;
  }).catch(() => {
    boxViewer = null;
    boxViewerPromise = null;
    if (mode !== 'preview' || revision !== boxPreviewRevision) return;
    loading.hidden = true;
    stage.hidden = true;
    document.querySelector('#box-error').textContent = 'The 3D preview could not start. Enable WebGL in your browser and reopen Preview.';
  });
}
document.querySelector('#box-reset').addEventListener('click', () => boxViewer?.reset());
document.querySelector('#box-paper').addEventListener('change', event => boxViewer?.setPaperEnabled(event.target.checked));
function syncEnvironmentLight() {
  const input = document.querySelector('#box-environment');
  const percent = numericValue(input);
  document.querySelector('#box-environment-value').textContent = `${percent}%`;
  input.setAttribute('aria-valuetext', `${percent}%`);
  boxViewer?.setEnvironmentLight(percent);
  syncPreviewTheme();
}
document.querySelector('#box-environment').addEventListener('input', syncEnvironmentLight);
function syncPreviewTheme() {
  const dark = mode === 'preview' && numericValue(document.querySelector('#box-environment')) < 15;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
function syncLampMode() {
  const enabled = mode === 'preview' && document.querySelector('#box-lamp').checked;
  boxViewer?.setLampEnabled(enabled);
}
let lampAudioContext = null;
const lampClickBuffers = new Map();
function switchClickSamples(sampleRate, enabled) {
  const samples = new Float32Array(Math.ceil(sampleRate * 0.075));
  const pitch = enabled ? 1 : 0.86;
  for (let index = 0; index < samples.length; index++) {
    const time = index / sampleRate;
    const contactTime = time - 0.014;
    // A sharp snap, a low housing knock, then the switch contact settling.
    const snap = (Math.random() * 2 - 1) * 0.42 * Math.exp(-time / 0.0035);
    const knock = Math.sin(2 * Math.PI * 185 * pitch * time) * 0.28 * Math.exp(-time / 0.010);
    const spring = Math.sin(2 * Math.PI * 1450 * pitch * time) * 0.10 * Math.exp(-time / 0.005);
    const contact = contactTime >= 0
      ? (Math.random() * 2 - 1) * 0.30 * Math.exp(-contactTime / 0.003)
        + Math.sin(2 * Math.PI * 520 * pitch * contactTime) * 0.16 * Math.exp(-contactTime / 0.007)
      : 0;
    const attack = Math.min(1, time / 0.0003);
    samples[index] = (snap + knock + spring + contact) * attack;
  }
  return samples;
}
function playLampSwitchClick(enabled) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    lampAudioContext ||= new AudioContext();
    const context = lampAudioContext;
    const play = () => {
      if (!lampClickBuffers.has(enabled)) {
        const samples = switchClickSamples(context.sampleRate, enabled);
        const buffer = context.createBuffer(1, samples.length, context.sampleRate);
        buffer.copyToChannel(samples, 0);
        lampClickBuffers.set(enabled, buffer);
      }
      const source = context.createBufferSource();
      source.buffer = lampClickBuffers.get(enabled);
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 3600;
      filter.Q.value = 0.7;
      const volume = context.createGain();
      volume.gain.value = 0.55;
      source.connect(filter).connect(volume).connect(context.destination);
      source.onended = () => { source.disconnect(); filter.disconnect(); volume.disconnect(); };
      source.start();
    };
    if (context.state === 'suspended') context.resume().then(play).catch(() => {});
    else if (context.state === 'running') play();
  } catch {
    // The lamp still works if audio is unavailable or blocked by the browser.
  }
}
document.querySelector('#box-lamp').addEventListener('change', event => {
  syncLampMode();
  playLampSwitchClick(event.target.checked);
});

function updatePreview() {
  document.querySelector('#kumiko-pattern-description').textContent = patternDetails[kumikoPattern.value].description;
  try {
    if (mode === 'material') {
      currentDrawing = kerfDrawing(readKerfs());
    } else if (mode === 'kumiko') {
      currentDrawing = kumikoDrawing();
    } else {
      currentDrawing = assemblyDrawing();
    }
    if (currentDrawing.model) {
      const size = currentDrawing.model;
      for (const prefix of ['assembly', 'box']) {
        document.querySelector(`#${prefix}-total-width`).textContent = `${number(size.panelWidth)} mm`;
        document.querySelector(`#${prefix}-total-depth`).textContent = `${number(size.panelWidth)} mm`;
        document.querySelector(`#${prefix}-total-height`).textContent = `${number(size.totalHeight)} mm`;
      }
    }
    error.textContent = '';
    downloadButton.disabled = false;
    if (mode === 'preview') {
      updateBoxPreview(currentDrawing);
      return;
    }
    dimensions.textContent = currentDrawing.description;
    preview.setAttribute('aria-label', currentDrawing.label);
    document.querySelector('#download-hint').hidden = false;
    document.querySelector('#download-hint').textContent = mode === 'assembly'
      ? `${number(currentDrawing.width)} × ${number(currentDrawing.height)} mm`
      : currentDrawing.hint;
    document.querySelector('#kumiko-cell-dimensions').textContent = currentDrawing.cellDimensions || '';
    document.querySelector('#assembly-preview-note').textContent = currentDrawing.previewNote || '';
    // Preview overlays and optional exaggeration never enter the downloaded SVG.
    preview.innerHTML = `<svg viewBox="0 0 ${currentDrawing.width} ${currentDrawing.height}" aria-hidden="true" fill="none" stroke="#000000" stroke-width="0.09">${previewContent(currentDrawing)}</svg>`;
  } catch (issue) {
    currentDrawing = null;
    document.querySelector('#download-hint').textContent = '';
    for (const prefix of ['assembly', 'box']) {
      ['width', 'depth', 'height'].forEach(dimension => { document.querySelector(`#${prefix}-total-${dimension}`).textContent = '—'; });
    }
    if (mode === 'preview') {
      ++boxPreviewRevision;
      document.querySelector('#box-canvas').hidden = true;
      document.querySelector('#box-loading').hidden = true;
      document.querySelector('#box-error').textContent = issue.message;
      document.querySelector('#box-dimensions').textContent = 'Enter valid dimensions in Assembly';
    }
    document.querySelector('#kumiko-cell-dimensions').textContent = '';
    document.querySelector('#assembly-preview-note').textContent = '';
    error.textContent = issue.message;
    downloadButton.disabled = true;
    dimensions.textContent = 'Enter valid dimensions';
    preview.innerHTML = '';
    preview.setAttribute('aria-label', 'Preview unavailable: enter valid dimensions');
  }
  kerfInputs.forEach(input => input.setAttribute('aria-invalid', String(mode === 'material' && !currentDrawing)));
  kumikoInputs.forEach(input => input.setAttribute('aria-invalid', String(mode === 'kumiko' && !currentDrawing)));
  assemblyInputs.forEach(input => input.setAttribute('aria-invalid', String(mode === 'assembly' && !currentDrawing)));
  bottomInputs.forEach(input => input.setAttribute('aria-invalid', String(mode === 'assembly' && !currentDrawing)));
  legInputs.forEach(input => input.setAttribute('aria-invalid', String(mode === 'assembly' && !currentDrawing)));
  const cellCount = numericValue(document.querySelector('#kumiko-cell-count'));
  document.querySelector('#kumiko-decrease').disabled = !Number.isInteger(cellCount) || cellCount <= 1 || cellCount > 100;
  document.querySelector('#kumiko-increase').disabled = !Number.isInteger(cellCount) || cellCount < 1 || cellCount >= 100;
}

function setMode(nextMode) {
  if (!['material', 'kumiko', 'assembly', 'preview'].includes(nextMode)) return;
  mode = nextMode;
  try {
    localStorage.setItem('lamp-maker.active-tab', mode);
  } catch {
    // Tab switching remains available when local storage is unavailable.
  }
  document.body.dataset.mode = mode;
  document.querySelector('.workspace').hidden = mode === 'preview';
  document.querySelector('#box-preview').hidden = mode !== 'preview';
  boxViewer?.setVisible(mode === 'preview');
  syncPreviewTheme();
  syncLampMode();
  document.querySelector('#material-settings').hidden = mode !== 'material';
  document.querySelector('#kerf-test-title').hidden = mode !== 'material';
  document.querySelector('#kerf-controls').hidden = mode !== 'material';
  document.querySelector('#kumiko-controls').hidden = mode !== 'kumiko';
  document.querySelector('#assembly-controls').hidden = mode !== 'assembly';
  document.querySelector('#kerf-legend').hidden = mode !== 'material';
  document.querySelector('#kerf-stroke-details').hidden = mode !== 'material';
  document.querySelector('#assembly-preview-controls').hidden = mode !== 'assembly';
  document.querySelectorAll('[data-mode]').forEach(button => {
    if (button.tagName === 'BUTTON') button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
  });
  const settings = {
    material: ['01', 'Material', 'Kerf test', '20 mm pieces. Compensation only on the mating edges.'],
    kumiko: ['02', 'Pattern', 'Pattern & panel', 'Repeating geometry. A continuous lattice inside a solid frame.'],
    assembly: ['03', 'Assembly', 'Panels & joints', 'Four patterned walls with legs, a patterned top, and a bottom with finger joints.'],
    preview: ['04', 'Preview', 'Assembled box', 'Drag to rotate the assembled box.']
  }[mode];
  const [index, title, controlsTitle, description] = settings;
  document.querySelector('#title').innerHTML = `${title}<span>${index}</span>`;
  document.querySelector('#controls-title').textContent = controlsTitle;
  document.querySelector('#description').textContent = description;
  document.querySelector('#footer-mode').textContent = `${index} — ${title}`;
  updatePreview();
}

const materialNumericInputs = ['thickness', 'speed', 'power', 'kerf'].map(name => document.querySelector(`#material-${name}`));
function validateMaterial() {
  const messages = {
    thickness: 'Thickness must be between 0.5 and 50 mm.',
    speed: 'Cutting speed must be between 0 and 100%.',
    power: 'Cutting power must be between 0 and 100%.',
    kerf: 'Kerf must be between 0 and 1 mm.'
  };
  const issues = [];
  materialNumericInputs.forEach(input => {
    const field = input.id.replace('material-', '');
    const optional = field === 'speed' || field === 'power';
    const valid = (optional && input.value === '' && !input.validity.badInput)
      || (input.value !== '' && input.validity.valid);
    input.setAttribute('aria-invalid', String(!valid));
    if (!valid) issues.push(messages[field]);
  });
  document.querySelector('#material-error').textContent = issues.join(' ');
  return issues.length === 0;
}
materialNumericInputs.forEach(input => input.addEventListener('input', () => {
  validateMaterial();
}));
const materialStorageKey = 'lamp-maker.materials.v1';
const materialFields = ['name', 'thickness', 'speed', 'power', 'kerf'];
const materialName = document.querySelector('#material-name');
const materialSave = document.querySelector('#material-save');
const materialStatus = document.querySelector('#material-status');
const fallbackMaterial = { id: 'fallback-birch', name: 'Fallback Birch', thickness: '3', speed: '2', power: '90', kerf: '0.1' };
let savedMaterials = [{ ...fallbackMaterial }];
let selectedMaterialId = fallbackMaterial.id;

function materialValues() {
  return Object.fromEntries(materialFields.map(field => [field, document.querySelector(`#material-${field}`).value]));
}
function applyMaterial(values) {
  ['thickness', 'kerf'].forEach(field => { document.querySelector(`#assembly-${field}`).value = values[field]; });
  syncMaterialSelectors();
  updatePreview();
}
function materialSummary(material) {
  return `${material.thickness} mm thick · Speed: ${material.speed === '' ? 'unset' : material.speed + '%'} · Power: ${material.power === '' ? 'unset' : material.power + '%'} · Kerf: ${material.kerf} mm`;
}
function syncMaterialSelectors() {
  ['assembly'].forEach(mode => {
    const select = document.querySelector(`#${mode}-material`);
    select.replaceChildren(...savedMaterials.map(material => {
      const option = document.createElement('option');
      option.value = material.id;
      option.textContent = material.name;
      return option;
    }));
    select.value = selectedMaterialId;
  });
  document.querySelectorAll('input[name="selected-material"]').forEach(input => { input.checked = input.value === selectedMaterialId; });
}
function selectMaterial(id) {
  const material = savedMaterials.find(value => value.id === id);
  if (!material) return;
  selectedMaterialId = id;
  applyMaterial(material);
  persistMaterials();
}
document.querySelector('#assembly-material').addEventListener('change', event => selectMaterial(event.target.value));
function clearMaterialForm() {
  materialFields.forEach(field => {
    const input = document.querySelector(`#material-${field}`);
    input.value = '';
    input.setAttribute('aria-invalid', 'false');
  });
  document.querySelector('#material-error').textContent = '';
}
function persistMaterials() {
  try {
    localStorage.setItem(materialStorageKey, JSON.stringify({ materials: savedMaterials, selectedId: selectedMaterialId }));
    return true;
  } catch {
    materialStatus.textContent = 'Local storage is unavailable. Changes will only last while this page is open.';
    return false;
  }
}
function renderMaterials() {
  const list = document.querySelector('#materials-list');
  list.replaceChildren();
  materialSave.textContent = 'Add material';
  savedMaterials.forEach(material => {
    const item = document.createElement('li');
    const details = document.createElement('label');
    details.className = 'material-option';
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'selected-material';
    radio.value = material.id;
    radio.checked = material.id === selectedMaterialId;
    radio.setAttribute('aria-label', material.name);
    radio.addEventListener('change', () => selectMaterial(material.id));
    const text = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = material.name;
    const summary = document.createElement('p');
    summary.className = 'hint';
    summary.textContent = materialSummary(material);
    text.append(name, summary);
    details.append(radio, text);
    const actions = document.createElement('div');
    actions.className = 'material-actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'secondary-button';
    edit.textContent = 'Edit';
    edit.setAttribute('aria-label', `Edit ${material.name}`);
    edit.addEventListener('click', () => {
      modalMaterialId = material.id;
      materialFields.forEach(field => {
        const input = document.querySelector(`#edit-material-${field}`);
        input.value = material[field];
        input.setAttribute('aria-invalid', 'false');
      });
      document.querySelector('#edit-material-error').textContent = '';
      materialDialog.showModal();
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'secondary-button';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove ${material.name}`);
    remove.addEventListener('click', () => {
      if (material.id === fallbackMaterial.id) return;
      savedMaterials = savedMaterials.filter(entry => entry.id !== material.id);
      if (selectedMaterialId === material.id) {
        selectedMaterialId = fallbackMaterial.id;
        applyMaterial(savedMaterials.find(value => value.id === selectedMaterialId));
      }
      renderMaterials();
      if (persistMaterials()) materialStatus.textContent = `${material.name} removed.`;
    });
    item.append(details);
    if (material.id !== fallbackMaterial.id) {
      actions.append(edit, remove);
      item.append(actions);
    }
    list.append(item);
  });
  syncMaterialSelectors();
}
materialName.addEventListener('input', () => {
  materialName.setAttribute('aria-invalid', 'false');
  validateMaterial();
});
materialSave.addEventListener('click', () => {
  const valid = validateMaterial();
  const values = materialValues();
  values.name = values.name.trim();
  if (!values.name) {
    materialName.setAttribute('aria-invalid', 'true');
    document.querySelector('#material-error').textContent = `Enter a material name. ${document.querySelector('#material-error').textContent}`.trim();
    materialName.focus();
    return;
  }
  if (!valid) return;
  materialName.value = values.name;
  savedMaterials.push({ id: crypto.randomUUID(), ...values });
  clearMaterialForm();
  renderMaterials();
  if (persistMaterials()) materialStatus.textContent = `${values.name} added.`;
});
const materialDialog = document.querySelector('#material-dialog');
let modalMaterialId = null;
document.querySelector('#material-edit-cancel').addEventListener('click', () => materialDialog.close());
materialDialog.addEventListener('close', () => { modalMaterialId = null; });
document.querySelector('#material-edit-form').addEventListener('submit', event => {
  event.preventDefault();
  const values = {};
  const issues = [];
  let firstInvalid = null;
  materialFields.forEach(field => {
    const input = document.querySelector(`#edit-material-${field}`);
    values[field] = field === 'name' ? input.value.trim() : input.value;
    const valid = input.validity.valid && (field !== 'name' || values.name !== '');
    input.setAttribute('aria-invalid', String(!valid));
    if (!valid) {
      firstInvalid ||= input;
      issues.push(field === 'name' ? 'Enter a material name.' : `${input.labels[0].textContent} must be between ${input.min} and ${input.max}${field === 'speed' || field === 'power' ? '%' : ' mm'}.`);
    }
  });
  document.querySelector('#edit-material-error').textContent = issues.join(' ');
  if (firstInvalid) {
    firstInvalid.focus();
    return;
  }
  const id = modalMaterialId;
  savedMaterials = savedMaterials.map(material => material.id === id ? { id, ...values } : material);
  if (selectedMaterialId === id) applyMaterial(values);
  materialDialog.close();
  renderMaterials();
  if (persistMaterials()) materialStatus.textContent = `${values.name} updated.`;
  const editButton = [...document.querySelectorAll('#materials-list button')].find(button => button.getAttribute('aria-label') === `Edit ${values.name}`);
  editButton?.focus();
});
try {
  const stored = JSON.parse(localStorage.getItem(materialStorageKey));
  const hasFields = value => value && materialFields.every(field => typeof value[field] === 'string');
  const validRecord = value => hasFields(value) && typeof value.id === 'string' && value.name.trim()
    && [['thickness', 0.5, 50], ['speed', 0, 100], ['power', 0, 100], ['kerf', 0, 1]].every(([field, min, max]) =>
      ((field === 'speed' || field === 'power') && value[field] === '')
      || (value[field].trim() !== '' && Number.isFinite(Number(value[field])) && Number(value[field]) >= min && Number(value[field]) <= max));
  if (stored) {
    const ids = new Set();
    savedMaterials = Array.isArray(stored.materials) ? stored.materials.filter(value => {
      if (!validRecord(value) || ids.has(value.id)) return false;
      ids.add(value.id);
      return true;
    }) : [];
    if (!savedMaterials.some(value => value.id === fallbackMaterial.id)) savedMaterials.unshift({ ...fallbackMaterial });
    else savedMaterials.sort((a, b) => Number(b.id === fallbackMaterial.id) - Number(a.id === fallbackMaterial.id));
    selectedMaterialId = savedMaterials.some(value => value.id === stored.selectedId) ? stored.selectedId : fallbackMaterial.id;
  }
} catch {
  materialStatus.textContent = 'Saved settings could not be loaded. You can still edit materials on this page.';
}
clearMaterialForm();
renderMaterials();
applyMaterial(savedMaterials.find(value => value.id === selectedMaterialId));

const linkedDimensionInputs = ['kumiko', 'assembly'].flatMap(generator =>
  ['width', 'height'].map(dimension => document.querySelector(`#${generator}-${dimension}`))
);
[...kerfInputs, ...kumikoInputs, ...assemblyInputs, ...bottomInputs, ...legInputs]
  .filter(input => !linkedDimensionInputs.includes(input))
  .forEach(input => input.addEventListener('input', updatePreview));
const bottomFingerButtons = [...document.querySelectorAll('[data-bottom-fingers]')];
bottomFingerButtons.forEach(button => button.addEventListener('click', () => {
  document.querySelector('#assembly-bottom-fingers').value = button.dataset.bottomFingers;
  bottomFingerButtons.forEach(option => option.setAttribute('aria-pressed', String(option === button)));
  updatePreview();
}));
const patternPicker = new PatternPicker(kumikoPattern, value => {
  const drawing = kumikoDrawing({ panelWidth: 100, panelHeight: 72, pattern: value, cellCount: 3, strut: 1, frame: 2 });
  return `<svg viewBox="0 0 100 72" aria-hidden="true" focusable="false">${drawing.preview}</svg>`;
});
const secondPatternSelect = document.querySelector('#kumiko-second-pattern');
secondPatternSelect.replaceChildren(...Array.from(kumikoPattern.options, option => option.cloneNode(true)));
secondPatternSelect.value = 'asanoha';
const secondPatternPicker = new PatternPicker(secondPatternSelect, value => {
  const drawing = kumikoDrawing({ panelWidth: 100, panelHeight: 72, pattern: value, cellCount: 3, strut: 1, frame: 2 });
  return `<svg viewBox="0 0 100 72" aria-hidden="true" focusable="false">${drawing.preview}</svg>`;
});
secondPatternSelect.addEventListener('change', () => { secondPatternPicker.sync(); updatePreview(); });
let bandPatternPair = null;
let previousCombinationLayout = 'bands';
function syncCombinationControls() {
  const enabled = document.querySelector('#kumiko-combine').checked;
  const layout = document.querySelector('#kumiko-combination-layout').value;
  if (previousCombinationLayout === 'bands' && layout !== 'bands') bandPatternPair = [kumikoPattern.value, secondPatternSelect.value];
  if (previousCombinationLayout !== 'bands' && layout === 'bands' && bandPatternPair) {
    [kumikoPattern.value, secondPatternSelect.value] = bandPatternPair;
    adjustPatternCellCount();
  }
  previousCombinationLayout = layout;
  const shared = enabled && layout !== 'bands';
  document.querySelector('#kumiko-combine-controls').hidden = !enabled;
  document.querySelector('#kumiko-band-share').hidden = layout !== 'bands';
  document.querySelector('label[for="kumiko-second-pattern-trigger"]').textContent = layout === 'bands' ? 'Bottom pattern' : 'Accent pattern';
  document.querySelector('label[for="kumiko-pattern-trigger"]').textContent = shared ? 'Background pattern' : 'Pattern';
  if (shared && !sharedCellPatterns.includes(kumikoPattern.value)) { kumikoPattern.value = 'triangular'; adjustPatternCellCount(); }
  if (shared && !sharedCellPatterns.includes(secondPatternSelect.value)) secondPatternSelect.value = 'asanoha';
  patternPicker.setAllowedValues(shared ? sharedCellPatterns : null);
  secondPatternPicker.setAllowedValues(shared ? sharedCellPatterns : null);
  patternPicker.sync();
  secondPatternPicker.sync();
  document.querySelector('#kumiko-combine-help').textContent = layout === 'bands'
    ? 'Two bands share a frame and a solid divider matching the lattice width. Walls use both patterns; the top panel uses only the top pattern.'
    : layout === 'interlock'
    ? 'Compatible motifs share one triangular lattice. In Assembly and Preview, the design continues around all four walls and closes at the final corner.'
    : 'Compatible motifs fill whole cells on one triangular lattice, with no extra divider. Applies to walls and top. Inspired by kumiko infill compositions.';
}
document.querySelector('#kumiko-combine').addEventListener('change', () => { syncCombinationControls(); updatePreview(); });
document.querySelector('#kumiko-combination-layout').addEventListener('change', () => { syncCombinationControls(); updatePreview(); });
document.querySelector('#kumiko-split').addEventListener('input', updatePreview);
kumikoPattern.addEventListener('change', () => {
  patternPicker.sync();
  adjustPatternCellCount();
  updatePreview();
});
const goldenRatio = (1 + Math.sqrt(5)) / 2;
let dimensionAnchor = 'width';
let dimensionsLinked = true;
function syncPanelDimensions(generator) {
  const other = generator === 'kumiko' ? 'assembly' : 'kumiko';
  ['width', 'height'].forEach(dimension => {
    document.querySelector(`#${other}-${dimension}`).value = document.querySelector(`#${generator}-${dimension}`).value;
  });
}
function applyPanelRatio(generator) {
  const source = numericValue(document.querySelector(`#${generator}-${dimensionAnchor}`));
  const target = document.querySelector(`#${generator}-${dimensionAnchor === 'width' ? 'height' : 'width'}`);
  // Incomplete edits propagate too, so switching tabs cannot export stale sizes.
  target.value = Number.isFinite(source) && source > 0
    ? String(Math.round(dimensionAnchor === 'width' ? source * goldenRatio : source / goldenRatio))
    : '';
}
['kumiko'].forEach(generator => {
  ['width', 'height'].forEach(dimension => {
    document.querySelector(`#${generator}-${dimension}`).addEventListener('input', () => {
      dimensionAnchor = dimension;
      if (dimensionsLinked) applyPanelRatio(generator);
      syncPanelDimensions(generator);
      updatePreview();
    });
  });
  document.querySelector(`#${generator}-golden-ratio`).addEventListener('click', () => {
    if (!dimensionsLinked) {
      const source = numericValue(document.querySelector(`#${generator}-${dimensionAnchor}`));
      if (!Number.isFinite(source) || source <= 0) {
        error.textContent = `Enter a valid ${dimensionAnchor} before linking the dimensions.`;
        return;
      }
      applyPanelRatio(generator);
      syncPanelDimensions(generator);
    }
    dimensionsLinked = !dimensionsLinked;
    ['kumiko'].forEach(view => {
      const button = document.querySelector(`#${view}-golden-ratio`);
      button.setAttribute('aria-pressed', String(dimensionsLinked));
      document.querySelector(`#${view}-dimensions`).setAttribute('data-linked', String(dimensionsLinked));
      button.title = dimensionsLinked ? 'Unlink dimensions' : 'Link dimensions: height = width × 1.618';
    });
    updatePreview();
  });
});
syncPanelDimensions('kumiko');
[['decrease', -1], ['increase', 1]].forEach(([direction, delta]) => {
  document.querySelector(`#kumiko-${direction}`).addEventListener('click', () => {
    const input = document.querySelector('#kumiko-cell-count');
    const next = numericValue(input) + delta;
    if (!Number.isInteger(next) || next < 1 || next > 100) return;
    input.value = String(next);
    updatePreview();
  });
});
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
document.querySelector('#exaggerate-fingers').addEventListener('change', updatePreview);
let initialMode = 'material';
try {
  const savedMode = localStorage.getItem('lamp-maker.active-tab');
  if (['material', 'kumiko', 'assembly', 'preview'].includes(savedMode)) initialMode = savedMode;
} catch {
  // Use the default tab when local storage is unavailable.
}
setMode(initialMode);
