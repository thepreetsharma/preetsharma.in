// The chart that tells Preet's story. It's generated from a fixed seed, so every visitor sees the same one.

export const CANDLES = 160;

// Story beats as [candle, price]. The line passes near these, with market noise in between.
const ANCHORS = [
  [0, 4.0],
  [18, 4.6],
  [27, 3.1], // electronics, switched out
  [40, 7.6], // economics at 18
  [60, 9.8], // undergrad: economics, history, philosophy
  [66, 9.2],
  [74, 12.6], // grad school at GIPE
  [96, 15.2], // code
  [110, 16.4], // finance
  [122, 16.0],
  [134, 16.6],
  [142, 15.6],
  [159, 22.0], // next
];

// Labels pinned to the chart, in candle order. They appear as the price line reaches them.
export const MILESTONES = [
  { at: 26, title: "Electronics", note: "▼ switched out", dir: "down" },
  { at: 38, title: "Economics", note: "▲ since 18", dir: "up" },
  { at: 56, title: "History + philosophy", note: "▲ for the joy of it", dir: "up" },
  { at: 72, title: "GIPE", note: "▲ geopolitics & geoeconomics", dir: "up" },
  { at: 92, title: "Code", note: "▲ 5+ years", dir: "up" },
  { at: 108, title: "Finance", note: "▲ derivatives · models · quant", dir: "up" },
  { at: 158, title: "Next", note: "▲ ?", dir: "up" },
];

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function basePrice(i) {
  for (let k = 1; k < ANCHORS.length; k++) {
    const [i1, p1] = ANCHORS[k];
    if (i <= i1) {
      const [i0, p0] = ANCHORS[k - 1];
      const t = (i - i0) / (i1 - i0);
      return p0 + (p1 - p0) * t * t * (3 - 2 * t);
    }
  }
  return ANCHORS[ANCHORS.length - 1][1];
}

export function buildChart(seed = 21) {
  const rand = mulberry32(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  const candles = [];
  let drift = 0;
  let previous = basePrice(0);
  for (let i = 0; i < CANDLES; i++) {
    drift = drift * 0.55 + gauss() * (i < 20 ? 0.16 : 0.32); // quieter at the open
    const close = basePrice(i) + drift;
    const open = i === 0 ? close - 0.1 : previous + gauss() * 0.05;
    const wick = Math.abs(gauss()) * 0.22 + 0.06;
    candles.push({
      open,
      close,
      high: Math.max(open, close) + wick * rand() + 0.04,
      low: Math.min(open, close) - wick * rand() - 0.04,
      volume: 0.25 + Math.abs(close - open) * 1.6 + rand() * 0.35,
    });
    previous = close;
  }
  return candles;
}

// Price at a (fractional) candle index, plus % change since the first open
export function quoteAt(candles, index) {
  const i = Math.max(0, Math.min(candles.length - 1, index));
  const a = candles[Math.floor(i)];
  const b = candles[Math.ceil(i)];
  const price = a.close + (b.close - a.close) * (i - Math.floor(i));
  return { price, change: ((price - candles[0].open) / candles[0].open) * 100 };
}

export const formatPrice = (price) =>
  (price * 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Returns a function that draws the first `shown` columns of the chart in box-drawing characters
export function asciiChart(candles, cols = 40, rows = 13) {
  const per = candles.length / cols;
  const groups = Array.from({ length: cols }, (_, c) => {
    const slice = candles.slice(Math.floor(c * per), Math.floor((c + 1) * per));
    return {
      open: slice[0].open,
      close: slice[slice.length - 1].close,
      high: Math.max(...slice.map((k) => k.high)),
      low: Math.min(...slice.map((k) => k.low)),
    };
  });
  const lo = Math.min(...groups.map((g) => g.low));
  const hi = Math.max(...groups.map((g) => g.high));
  const row = (price) => Math.round(((hi - price) / (hi - lo)) * (rows - 1));

  return (shown) => {
    const grid = Array.from({ length: rows }, () => Array(cols).fill(" "));
    for (let c = 0; c < Math.min(shown, cols); c++) {
      const g = groups[c];
      for (let r = row(g.high); r <= row(g.low); r++) grid[r][c] = "│";
      const glyph = g.close >= g.open ? "█" : "░";
      for (let r = row(Math.max(g.open, g.close)); r <= row(Math.min(g.open, g.close)); r++) grid[r][c] = glyph;
    }
    const lines = grid.map((r) => r.join(" "));
    lines.push("─".repeat(cols * 2 - 1));
    return lines.join("\n");
  };
}
