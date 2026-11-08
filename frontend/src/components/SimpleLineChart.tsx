import { useMemo, useState } from 'react'
import './shared.css'

export type Line = { id: string; label: string; values: (number | null)[]; color: string; dashed?: boolean }

type Props = {
  lines: Line[]; xLabel?: string; yLabel?: string; marker?: number; height?: number
  baseline?: number; ariaLabel: string
}

// Linear axes with human labels. Default reads "Year" and "Relative population (start = 100)".
export default function SimpleLineChart({ lines, xLabel = 'Year', yLabel = 'Relative population (start = 100)', marker, height = 190, baseline = 100, ariaLabel }: Props) {
  const W = 560, H = height, L = 46, R = 14, T = 12, B = 34
  const [hover, setHover] = useState<number | null>(null)
  const n = Math.max(1, ...lines.map((l) => l.values.length))
  const { lo, hi } = useMemo(() => {
    const all = lines.flatMap((l) => l.values.filter((v): v is number => v != null && isFinite(v)))
    if (!all.length) return { lo: 0, hi: 200 }
    let a = Math.min(baseline, ...all), b = Math.max(baseline, ...all)
    const pad = (b - a) * 0.08 || 10
    a = Math.max(0, a - pad); b = b + pad
    return { lo: a, hi: b }
  }, [lines, baseline])
  const x = (i: number) => L + (i / Math.max(1, n - 1)) * (W - L - R)
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B)
  const ticks = niceTicks(lo, hi, 4)
  const xt = niceTicks(0, n - 1, 5).filter((t) => Number.isInteger(t))
  return (
    <figure className="slc">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
          const px = ((e.clientX - r.left) / r.width) * W
          const i = Math.round(((px - L) / (W - L - R)) * (n - 1))
          setHover(i >= 0 && i < n ? i : null)
        }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className={t === baseline ? 'slc-base' : 'slc-grid'} />
            <text x={L - 6} y={y(t) + 3.5} textAnchor="end" className="slc-tick">{Math.round(t)}</text>
          </g>
        ))}
        {xt.map((t) => <text key={t} x={x(t)} y={H - B + 15} textAnchor="middle" className="slc-tick">{t}</text>)}
        <text x={(L + W - R) / 2} y={H - 4} textAnchor="middle" className="slc-axis">{xLabel}</text>
        <text transform={`translate(11 ${(T + H - B) / 2}) rotate(-90)`} textAnchor="middle" className="slc-axis">{yLabel}</text>
        {marker != null && <line x1={x(marker)} x2={x(marker)} y1={T} y2={H - B} className="slc-marker" />}
        {lines.map((l) => {
          const pts = l.values.map((v, i) => (v == null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean)
          return <polyline key={l.id} points={pts.join(' ')} fill="none" stroke={l.color} strokeWidth={2} strokeDasharray={l.dashed ? '5 4' : undefined} strokeLinejoin="round" />
        })}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} className="slc-hover" />}
      </svg>
      <figcaption className="slc-legend">
        {lines.map((l) => {
          const v = l.values[hover ?? marker ?? l.values.length - 1]
          return (
            <span key={l.id}><i style={{ background: l.color, opacity: l.dashed ? 0.6 : 1 }} />{l.label}
              {v != null && <b className="num"> {Math.round(v)}</b>}</span>
          )
        })}
        {hover != null && <span className="dim">year {hover}</span>}
      </figcaption>
    </figure>
  )
}

function niceTicks(lo: number, hi: number, count: number) {
  const span = hi - lo || 1
  const step0 = span / count
  const mag = 10 ** Math.floor(Math.log10(step0))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? mag * 10
  const out: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6))
  return out
}
