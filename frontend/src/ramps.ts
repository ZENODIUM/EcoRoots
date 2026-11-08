// Sequential ramps built from the observatory palette. Each ramp is used both for the
// globe cells and for the legend gradient so the two can never disagree.

export type Ramp = { stops: string[]; label: string; unit: string; domain?: [number, number] }

export const RAMPS: Record<string, Ramp> = {
  suitability: { stops: ['#123b30', '#3d7058', '#7fae86', '#c9cf8f', '#d9b56a'], label: 'Climatic suitability', unit: 'relative · not abundance', domain: [0, 1] },
  bio1: { stops: ['#3d5f8c', '#437f95', '#77b5bd', '#d8c9a0', '#b7855f', '#80573e'], label: 'Mean annual temperature', unit: '°C' },
  bio12: { stops: ['#3a2f22', '#80573e', '#a39070', '#77b5bd', '#437f95', '#2c4f6e'], label: 'Annual precipitation', unit: 'mm' },
  fire_detections: { stops: ['#1a2a24', '#5a3a2a', '#a35a34', '#e0874e', '#f2c17a'], label: 'Active-fire detections per cell', unit: 'last 5 days (count)' },
  elevation_m: { stops: ['#173a2c', '#4f7a5c', '#a39bc7', '#d8d3e6', '#f4f1ea'], label: 'Elevation', unit: 'm' },
}

function hex(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function sample(stops: string[], t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t)) * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(x))
  const f = x - i
  const a = hex(stops[i]), b = hex(stops[i + 1])
  return [0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * f)) as [number, number, number]
}

export function gradientCss(stops: string[]) {
  return `linear-gradient(90deg, ${stops.join(', ')})`
}

/** Domain for a variable over the visible cells (ignores missing values; never treats them as 0). */
export function domainOf(values: (number | null | undefined)[], fixed?: [number, number]): [number, number] | null {
  if (fixed) return fixed
  const v = values.filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
  if (!v.length) return null
  let lo = Math.min(...v), hi = Math.max(...v)
  if (hi - lo < 1e-9) { lo -= 1; hi += 1 }
  return [lo, hi]
}
