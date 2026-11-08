import type { FieldSpec, Pick } from './Scene3D'
import type { Plot } from './model'

// Top-down 2D view with the same placements and stage assignment as the 3D scene.
// Used when WebGL is unavailable, on request, or for reduced motion.
export default function Plot2D({ fields, plot, pick, onPick }: { fields: FieldSpec[]; plot: Plot; pick: Pick; onPick: (p: Pick) => void }) {
  const s = 720 / plot.w
  const W = plot.w * s, H = plot.d * s
  const X = (x: number) => (x + plot.w / 2) * s, Z = (z: number) => (z + plot.d / 2) * s
  return (
    <svg className="st-2d" viewBox={`-10 -26 ${W + 20} ${H + 36}`} role="img" aria-label="Top-down view of the plot: each dot is a rendered plant" data-testid="plot-2d">
      <rect x={0} y={0} width={W} height={H} rx={6} fill="#5d3d26" stroke="#3e2718" strokeWidth={3} />
      {fields.map((f) => (
        <g key={f.key}>
          <rect x={X(f.band.x0) + 4} y={4} width={(f.band.x1 - f.band.x0) * s - 8} height={H - 8} rx={4} fill="none" stroke={f.colour} strokeOpacity={0.5} strokeDasharray="4 4" />
          <text x={(X(f.band.x0) + X(f.band.x1)) / 2} y={-9} textAnchor="middle" fill={f.colour} fontSize={13} fontStyle="italic" fontFamily="var(--serif)">{f.label}</text>
          {f.stageOf.map((st, i) => {
            const p = f.positions[i]
            const r = Math.max(1.5, (0.2 + 0.8 * f.stageScales[st]) * (f.spacing ?? 0.6) * 0.45 * s)
            const sel = pick?.key === f.key && pick.index === i
            return (
              <circle key={i} cx={X(p.x)} cy={Z(p.z)} r={r} fill={f.colour} fillOpacity={0.35 + 0.6 * f.stageScales[st]}
                stroke={sel ? '#d4b36b' : '#05100b'} strokeWidth={sel ? 2.5 : 0.8} onClick={() => onPick({ key: f.key, index: i })} style={{ cursor: 'pointer' }} />
            )
          })}
        </g>
      ))}
    </svg>
  )
}
