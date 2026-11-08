import type { MatrixCard } from '../../api'

type Process = 'stasis' | 'progression' | 'retrogression' | 'fecundity' | 'clonality'
type Edge = { i: number; j: number; value: number; elas: number; process: Process; delta: number | null }

export const PROCESS_COLOR: Record<Process, string> = {
  stasis: '#77B5BD', progression: '#8FB89A', retrogression: '#B7855F', fecundity: '#A39BC7', clonality: '#d9c58a',
}

export const shortStage = (s: string) => {
  const head = s.split(':')[0].trim()
  return head.length > 16 ? head.slice(0, 15) + '…' : head
}

/** Classify every non-zero transition a_ij (to stage i from stage j) by the U/F/C split. */
function edgesOf(m: MatrixCard, cmp: MatrixCard | null): Edge[] {
  const n = m.A.length
  const out: Edge[] = []
  const E = m.elasticity
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const parts: [Process, number][] = []
    const u = m.U?.[i]?.[j] ?? 0, f = m.F?.[i]?.[j] ?? 0, c = m.C?.[i]?.[j] ?? 0
    if (u > 0) parts.push([i === j ? 'stasis' : i > j ? 'progression' : 'retrogression', u])
    if (f > 0) parts.push(['fecundity', f])
    if (c > 0) parts.push(['clonality', c])
    if (!parts.length && m.A[i][j] > 0) parts.push([i === j ? 'stasis' : i > j ? 'progression' : 'retrogression', m.A[i][j]])
    const tot = parts.reduce((a, p) => a + p[1], 0)
    for (const [process, value] of parts) {
      const share = tot > 0 ? value / tot : 0
      const delta = cmp && cmp.A.length === n ? m.A[i][j] - cmp.A[i][j] : null
      out.push({ i, j, value, elas: (E?.[i]?.[j] ?? 0) * share, process, delta })
    }
  }
  return out
}

export default function LifeCycleBoard({ matrix, compare, title }: { matrix: MatrixCard; compare: MatrixCard | null; title: string }) {
  const n = matrix.A.length
  if (n > 12) return <MatrixHeat matrix={matrix} title={title} />
  const W = 760, H = 330, padX = 60
  const cy = 165
  const x = (k: number) => padX + (n === 1 ? 0 : (k * (W - padX * 2)) / (n - 1))
  const ss = matrix.stable_stage
  const rad = (k: number) => 9 + 17 * Math.sqrt(Math.max(0, ss[k] ?? 0))
  const edges = edgesOf(matrix, compare)
  const maxE = Math.max(...edges.map((e) => e.elas), 1e-9)
  const maxD = Math.max(...edges.map((e) => Math.abs(e.delta ?? 0)), 1e-9)
  const comparing = Boolean(compare && compare.matrix_id !== matrix.matrix_id && compare.A.length === n)

  const path = (e: Edge) => {
    const x1 = x(e.j), x2 = x(e.i)
    if (e.process === 'stasis') {
      const r = rad(e.j)
      return `M ${x1 - 8} ${cy - r} C ${x1 - 34} ${cy - r - 52}, ${x1 + 34} ${cy - r - 52}, ${x1 + 8} ${cy - r}`
    }
    const span = Math.abs(e.i - e.j)
    const below = e.process === 'retrogression' || e.process === 'fecundity' || e.process === 'clonality'
    const lift = (below ? 1 : -1) * (26 + span * 24)
    const y = cy + (below ? rad(e.j) * 0.6 : -rad(e.j) * 0.6)
    const y2 = cy + (below ? rad(e.i) * 0.6 : -rad(e.i) * 0.6)
    return `M ${x1} ${y} C ${x1} ${y + lift}, ${x2} ${y2 + lift}, ${x2} ${y2}`
  }
  const mid = (e: Edge): [number, number] => {
    if (e.process === 'stasis') return [x(e.j), cy - rad(e.j) - 44]
    const span = Math.abs(e.i - e.j)
    const below = e.process !== 'progression'
    return [(x(e.i) + x(e.j)) / 2, cy + (below ? 1 : -1) * (rad(e.j) * 0.6 + 0.75 * (26 + span * 24))]
  }

  return (
    <figure className="board" data-testid="board">
      <figcaption>
        <span className="serif">{title}</span>
        <span className="mono dim">matrix {matrix.matrix_id} · {matrix.population} · {matrix.start_year}–{matrix.end_year} · λ {matrix.lambda.toFixed(3)}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Life-cycle graph of ${n} stages`}>
        <defs>
          {Object.entries(PROCESS_COLOR).map(([k, c]) => (
            <marker key={k} id={`arr-${k}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
              <path d="M0 0 L8 4 L0 8 z" fill={c} />
            </marker>
          ))}
          <marker id="arr-up" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0 0 L8 4 L0 8 z" fill="#77B5BD" /></marker>
          <marker id="arr-down" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0 0 L8 4 L0 8 z" fill="#B7855F" /></marker>
        </defs>
        <line x1={padX - 30} x2={W - padX + 30} y1={cy} y2={cy} stroke="#1c3a2f" strokeDasharray="2 4" />
        {edges.map((e, k) => {
          const width = comparing ? 1 + 8 * Math.abs(e.delta ?? 0) / maxD : 1 + 8 * (e.elas / maxE)
          const color = comparing ? ((e.delta ?? 0) < -1e-6 ? '#B7855F' : (e.delta ?? 0) > 1e-6 ? '#77B5BD' : '#2a4d40') : PROCESS_COLOR[e.process]
          const marker = comparing ? ((e.delta ?? 0) < -1e-6 ? 'arr-down' : 'arr-up') : `arr-${e.process}`
          const [mx, my] = mid(e)
          const showLabel = comparing ? Math.abs(e.delta ?? 0) > maxD * 0.15 : e.elas > maxE * 0.12
          return (
            <g key={k} className="edge">
              <path d={path(e)} fill="none" stroke={color} strokeWidth={width} strokeOpacity={0.85}
                strokeDasharray={e.process === 'fecundity' ? '5 4' : e.process === 'clonality' ? '2 3' : undefined} markerEnd={`url(#${marker})`}>
                <title>{`${shortStage(matrix.stages[e.j])} → ${shortStage(matrix.stages[e.i])} · ${e.process} · a=${e.value.toFixed(3)} · elasticity ${e.elas.toFixed(3)}${e.delta !== null ? ` · Δ vs control ${e.delta >= 0 ? '+' : ''}${e.delta.toFixed(3)}` : ''}`}</title>
              </path>
              {showLabel && (
                <text x={mx} y={my} className="elabel" textAnchor="middle">
                  {comparing ? `${(e.delta ?? 0) >= 0 ? '+' : ''}${(e.delta ?? 0).toFixed(2)}` : e.value.toFixed(2)}
                </text>
              )}
            </g>
          )
        })}
        {matrix.stages.map((s, k) => (
          <g key={k}>
            <circle cx={x(k)} cy={cy} r={rad(k)} fill="#0B1C16" stroke="#ECF0E7" strokeWidth={1.2} />
            <text x={x(k)} y={cy + 4} textAnchor="middle" className="nnum">{(100 * (ss[k] ?? 0)).toFixed(0)}%</text>
            <text x={x(k)} y={H - 10} textAnchor="middle" className="nlabel">{shortStage(s)}<title>{s}</title></text>
          </g>
        ))}
      </svg>
      <div className="board-key">
        {comparing ? (
          <>
            <span><i style={{ background: '#B7855F' }} /> lower than control</span>
            <span><i style={{ background: '#77B5BD' }} /> higher than control</span>
            <span className="dim">edge width ∝ |a<sub>ij</sub> treatment − control|</span>
          </>
        ) : (
          <>
            {(Object.keys(PROCESS_COLOR) as Process[]).map((p) => <span key={p}><i style={{ background: PROCESS_COLOR[p] }} /> {p}</span>)}
            <span className="dim">edge width ∝ elasticity · node size and % = stable stage share</span>
          </>
        )}
      </div>
    </figure>
  )
}

function MatrixHeat({ matrix, title }: { matrix: MatrixCard; title: string }) {
  const n = matrix.A.length
  const max = Math.max(...matrix.elasticity.flat(), 1e-9)
  const cell = Math.min(26, 560 / n)
  return (
    <figure className="board" data-testid="board">
      <figcaption><span className="serif">{title}</span><span className="mono dim">{n} stages: shown as an elasticity heat map</span></figcaption>
      <svg viewBox={`0 0 ${n * cell + 2} ${n * cell + 2}`} style={{ maxHeight: 330 }}>
        {matrix.elasticity.map((row, i) => row.map((v, j) => (
          <rect key={`${i}-${j}`} x={j * cell + 1} y={i * cell + 1} width={cell - 1} height={cell - 1}
            fill={v > 0 ? `rgba(143,184,154,${0.12 + 0.88 * v / max})` : '#08160f'}><title>{`a${i + 1},${j + 1} = ${matrix.A[i][j].toFixed(3)} · e = ${v.toFixed(3)}`}</title></rect>
        )))}
      </svg>
    </figure>
  )
}
