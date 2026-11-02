/**
 * Chart palette — validated for the dark card surface (#181817) with the
 * dataviz palette validator (lightness band, chroma, CVD ΔE ≥ 8, ≥3:1).
 * Fixed order: series 1 → blue, 2 → orange, 3 → aqua. Never cycle.
 * Status colours (red/yellow/green) are NOT series colours.
 */
export const CHART = {
  series: ['#3987e5', '#d95926', '#199e70'] as const,
  blue: '#3987e5',
  orange: '#d95926',
  aqua: '#199e70',
  grid: '#242422',
  axis: '#82827d',
  surface: '#181817',
  font: 'DM Mono, ui-monospace, monospace',
}
