export type Line = { id: string; label: string; values: number[]; color: string; dashed?: boolean; emphasis?: boolean }

/** Population index N(t)/N(0) over years. The y axis is logarithmic so equal ratios look equal. */
export default function TrajectoryChart({ lines, markers, caption }: { lines: Line[]; markers?: number[]; caption: string }) {
  const W = 760, H = 230, L = 46, R = 130, T = 14, B = 26
  const all = lines.flatMap((l) => l.values).filter((v) => v > 0)
  if (!all.length) return null
  const years = Math.max(...lines.map((l) => l.values.length)) - 1
  const lo = Math.log10(Math.min(...all, 1) * 0.92), hi = Math.log10(Math.max(...all, 1) * 1.08)
  const x = (t: number) => L + (t / Math.max(years, 1)) * (W - L - R)
  const y = (v: number) => T + (1 - (Math.log10(Math.max(v, 1e-6)) - lo) / (hi - lo || 1)) * (H - T - B)
  const ticks = niceLogTicks(10 ** lo, 10 ** hi)
  // stagger end labels so they do not overlap
  const ends = lines.map((l) => ({ l, y: y(l.values[l.values.length - 1]) })).sort((a, b) => a.y - b.y)
  for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 12) ends[k].y = ends[k - 1].y + 12

  return (
    <figure className="traj" data-testid="trajectory">
      <figcaption className="serif">{caption}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={caption}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={t === 1 ? '#A9B7A9' : '#1c3a2f'} strokeDasharray={t === 1 ? '4 3' : undefined} />
            <text x={L - 6} y={y(t) + 3} textAnchor="end" className="ax">{t >= 10 ? t.toFixed(0) : t >= 1 ? t.toFixed(1) : String(+t.toPrecision(1))}</text>
          </g>
        ))}
        {(markers ?? []).map((m) => <line key={m} x1={x(m)} x2={x(m)} y1={T} y2={H - B} stroke="#B7855F" strokeOpacity={0.25} />)}
        {Array.from({ length: Math.floor(years / 5) + 1 }, (_, k) => k * 5).map((t) => (
          <text key={t} x={x(t)} y={H - 8} textAnchor="middle" className="ax">{t === 0 ? 'year 0' : t}</text>
        ))}
        {lines.map((l) => (
          <polyline key={l.id} fill="none" stroke={l.color} strokeWidth={l.emphasis ? 2.4 : 1.5} strokeDasharray={l.dashed ? '5 4' : undefined}
            points={l.values.map((v, t) => `${x(t)},${y(v)}`).join(' ')}><title>{l.label}</title></polyline>
        ))}
        {ends.map(({ l, y: yy }) => (
          <text key={l.id} x={W - R + 6} y={yy + 3} className="endlabel" fill={l.color}>{l.label}</text>
        ))}
      </svg>
    </figure>
  )
}

function niceLogTicks(min: number, max: number) {
  const out: number[] = []
  // more than two decades: powers of ten only, otherwise 1-2-5
  const mants = Math.log10(max / min) > 2 ? [1] : [1, 2, 5]
  for (let e = Math.floor(Math.log10(min)); e <= Math.ceil(Math.log10(max)); e++)
    for (const m of mants) { const v = m * 10 ** e; if (v >= min && v <= max) out.push(+v.toPrecision(3)) }
  if (!out.includes(1) && min <= 1 && max >= 1) out.push(1)
  return out.sort((a, b) => a - b)
}
