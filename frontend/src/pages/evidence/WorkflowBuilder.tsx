import { useEffect, useMemo, useState, type DragEvent } from 'react'
import { api } from '../../api'
import { useSelection } from '../../store'

// Visual builder for the Harvest Evidence Agent: drag components between the palette and the pipeline canvas.
// The server re-validates every pipeline (normalise_pipeline), so the checks here are a preview, not the authority.

export type Component = { id: string; label: string; stage: Stage; required: boolean; description: string; after: string[]; needs?: string[] }
type Stage = 'context' | 'search' | 'read' | 'check' | 'compute' | 'route' | 'plan'
type Spec = { components: Component[]; default: string[]; fixed: { id: string; label: string }[] }

const STAGES: { id: Stage; label: string; hint: string }[] = [
  { id: 'context', label: 'Context', hint: 'Listings, rules, identity' },
  { id: 'search', label: 'Find papers', hint: 'Where the agent looks' },
  { id: 'read', label: 'Read', hint: 'AI reads abstracts' },
  { id: 'compute', label: 'Compute', hint: 'Population matrices' },
  { id: 'check', label: 'Check', hint: 'Catch errors' },
  { id: 'route', label: 'Route', hint: 'Who reviews' },
  { id: 'plan', label: 'Plan', hint: 'What to measure next' },
]
const ORGANS = ['rhizome', 'root', 'bark', 'leaf', 'flower', 'fruit', 'seed', 'resin (stem tapping)', 'whole plant']
const BUILTIN: Record<string, (all: string[]) => string[]> = {
  'Full agent': (all) => all,
  'Fast': (all) => all.filter((c) => !['search_europepmc', 'stochastic_lambda', 'claim_verify'].includes(c)),
  'Rules only (no JEV)': (all) => all.filter((c) => !c.startsWith('jev_')),
  'Matrices only': () => ['query_plan', 'search_openalex', 'retrieve', 'matrix_sensitivity', 'stochastic_lambda'],
  'Field planning': () => ['query_plan', 'anchor_studies', 'retrieve', 'matrix_sensitivity', 'cites_lookup', 'eligibility_gate', 'harvest_compare',
    'recovery_rotation', 'methods_lookup', 'identity_check', 'evidence_gaps'],
}
const CONTEXT = new Set(['cites_lookup', 'eligibility_gate', 'harvest_compare', 'recovery_rotation', 'methods_lookup', 'identity_check', 'evidence_gaps'])
const PRESET_KEY = 'eh.agentPresets.v1'
const DRAG_TYPE = 'application/x-eh-component'

function loadPresets(): Record<string, string[]> {
  try { return JSON.parse(localStorage.getItem(PRESET_KEY) ?? '{}') } catch { return {} }
}

/** Mirrors evidence_agent.normalise_pipeline so the user sees what the server will run before pressing Run. */
export function preview(comps: Component[], chosen: string[]) {
  const by = Object.fromEntries(comps.map((c) => [c.id, c]))
  const want = new Set(chosen.filter((c) => by[c]))
  comps.filter((c) => c.required).forEach((c) => want.add(c.id))
  const notes: { kind: 'warn' | 'info'; text: string }[] = []
  for (const c of comps) for (const n of c.needs ?? []) {
    if (want.has(c.id) && !want.has(n)) { want.delete(c.id); notes.push({ kind: 'warn', text: `${c.label} will be skipped: it needs ${by[n].label}.` }) }
  }
  if (!['search_openalex', 'search_europepmc', 'anchor_studies'].some((s) => want.has(s))) {
    want.add('search_openalex'); notes.push({ kind: 'warn', text: 'No source left, so Search OpenAlex will be added.' })
  }
  if (!want.has('jev_triage')) notes.push({ kind: 'info', text: 'Without JEV, papers are sorted by keyword rules only.' })
  if (!want.has('extract_claims')) notes.push({ kind: 'info', text: 'No findings will be quoted from papers; only computed results.' })
  if (!want.has('matrix_sensitivity')) notes.push({ kind: 'info', text: 'No population-matrix computation will run.' })
  const pipe = comps.map((c) => c.id).filter((id) => want.has(id))
  const parents: Record<string, string[]> = {}
  for (const id of pipe) { const ps = by[id].after.filter((a) => want.has(a)); parents[id] = ps.length ? ps.slice(0, 3) : ['taxonomy_match'] }
  return { pipe, notes, parents }
}

export default function WorkflowBuilder({ onStarted }: { onStarted: (id: string) => void }) {
  const sel = useSelection()
  const [spec, setSpec] = useState<Spec | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [chosen, setChosen] = useState<string[]>([])
  const [species, setSpecies] = useState(sel.species ?? 'Nardostachys jatamansi')
  const [organ, setOrgan] = useState('rhizome')
  const [country, setCountry] = useState('Nepal')
  const [inject, setInject] = useState<string[]>([])
  const [presets, setPresets] = useState<Record<string, string[]>>(loadPresets)
  const [presetName, setPresetName] = useState('')
  const [over, setOver] = useState<'canvas' | 'palette' | null>(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    api.json<Spec>('/api/evidence-agent/components').then((s) => { setSpec(s); setChosen(s.default) }).catch((e) => setErr((e as Error).message))
  }, [])
  const comps = spec?.components ?? []
  const by = useMemo(() => Object.fromEntries(comps.map((c) => [c.id, c])), [comps])
  const pv = useMemo(() => preview(comps, chosen), [comps, chosen])
  const inPipe = new Set(chosen)
  const add = (id: string) => setChosen((c) => (c.includes(id) ? c : [...c, id]))
  const remove = (id: string) => { if (!by[id]?.required) setChosen((c) => c.filter((x) => x !== id)) }
  const savePresets = (p: Record<string, string[]>) => { setPresets(p); try { localStorage.setItem(PRESET_KEY, JSON.stringify(p)) } catch { /* private mode */ } }

  const onDrag = (e: DragEvent, id: string) => { e.dataTransfer.setData(DRAG_TYPE, id); e.dataTransfer.effectAllowed = 'move' }
  const drop = (target: 'canvas' | 'palette') => (e: DragEvent) => {
    e.preventDefault(); setOver(null)
    const id = e.dataTransfer.getData(DRAG_TYPE)
    if (!id) return
    if (target === 'canvas') add(id); else remove(id)
  }
  const dragOver = (target: 'canvas' | 'palette') => (e: DragEvent) => { if (e.dataTransfer.types.includes(DRAG_TYPE)) { e.preventDefault(); setOver(target) } }

  const run = async () => {
    setErr(null); setBusy(true)
    try {
      const r = await api.json<{ run_id: string }>('/api/evidence-agent', {
        method: 'POST', body: JSON.stringify({ species: species.trim(), organ, jurisdiction: country.trim() || null, inject, pipeline: chosen }),
      })
      onStarted(r.run_id)
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  if (!spec) return <section className="ev-center ev-wide"><p className="small dim">{err ?? 'Loading components…'}</p></section>
  const palette = comps.filter((c) => !inPipe.has(c.id))

  return (
    <section className="ev-center ev-wide scroll wfb" data-testid="workflow-builder">
      <header className="wfb-head">
        <div>
          <p className="serif wfb-title">Build the evidence agent</p>
          <p className="small dim">Drag steps into the pipeline or back out. Locked steps are always needed. The server checks the pipeline again before it runs.</p>
        </div>
        <div className="wfb-run">
          <label className="small">Plant<input className="input" value={species} onChange={(e) => setSpecies(e.target.value)} data-testid="wfb-species" /></label>
          <label className="small">Part harvested
            <select className="input" value={organ} onChange={(e) => setOrgan(e.target.value)} data-testid="wfb-organ">{ORGANS.map((o) => <option key={o}>{o}</option>)}</select>
          </label>
          <label className="small">Country<input className="input" value={country} onChange={(e) => setCountry(e.target.value)} data-testid="wfb-country" /></label>
          <button className="btn primary" onClick={run} disabled={busy || species.trim().length < 3} data-testid="wfb-run">{busy ? 'Starting…' : `Run ${pv.pipe.length + 4} steps`}</button>
        </div>
      </header>
      {err && <p className="error">{err}</p>}

      <div className="wfb-presets" role="group" aria-label="Presets">
        {Object.entries(BUILTIN).map(([name, f]) => (
          <button key={name} className="btn sm" onClick={() => setChosen(f(spec.default))} data-testid={`preset-${name.split(' ')[0].toLowerCase()}`}>{name}</button>
        ))}
        {Object.entries(presets).map(([name, p]) => (
          <span key={name} className="wfb-saved">
            <button className="btn sm" onClick={() => setChosen(p)}>{name}</button>
            <button className="btn sm ghost" aria-label={`Delete preset ${name}`} onClick={() => { const { [name]: _, ...rest } = presets; savePresets(rest) }}>×</button>
          </span>
        ))}
        <input className="input sm" placeholder="Name this pipeline" value={presetName} onChange={(e) => setPresetName(e.target.value)} aria-label="Preset name" />
        <button className="btn sm" disabled={!presetName.trim()} onClick={() => { savePresets({ ...presets, [presetName.trim().slice(0, 30)]: chosen }); setPresetName('') }}>Save</button>
      </div>

      <div className="wfb-grid">
        <aside className={`wfb-palette ${over === 'palette' ? 'over' : ''}`} onDragOver={dragOver('palette')} onDragLeave={() => setOver(null)} onDrop={drop('palette')}
          data-testid="wfb-palette" aria-label="Available steps">
          <p className="label">Available steps ({palette.length})</p>
          {palette.length === 0 && <p className="tiny dim">Every step is in the pipeline. Drag one here to remove it.</p>}
          {palette.map((c) => (
            <div key={c.id} className={`wfb-card wst-${c.stage}`} draggable onDragStart={(e) => onDrag(e, c.id)} data-testid={`palette-${c.id}`}>
              <span className="wfb-dot" /><span className="wfb-l">{c.label}</span>
              <button className="btn sm" onClick={() => add(c.id)} aria-label={`Add ${c.label}`}>Add</button>
              <p className="tiny dim">{c.description}</p>
            </div>
          ))}
        </aside>

        <div className={`wfb-canvas ${over === 'canvas' ? 'over' : ''}`} onDragOver={dragOver('canvas')} onDragLeave={() => setOver(null)} onDrop={drop('canvas')}
          data-testid="wfb-canvas" aria-label="Pipeline">
          <div className="wfb-fixed"><span className="wfb-pill">Start</span><span className="wfb-pill">{spec.fixed[0]?.label}</span></div>
          <div className="wfb-lanes">
            {STAGES.map((s) => {
              const items = comps.filter((c) => c.stage === s.id && inPipe.has(c.id))
              return (
                <div key={s.id} className={`wfb-lane wst-${s.id}`} data-testid={`lane-${s.id}`}>
                  <p className="wfb-lane-h"><b>{s.label}</b><span className="tiny dim">{s.hint}</span></p>
                  {items.length === 0 && <p className="tiny dim wfb-empty">Empty</p>}
                  {items.map((c) => {
                    const skipped = !pv.pipe.includes(c.id)
                    return (
                      <div key={c.id} className={`wfb-card in wst-${c.stage} ${skipped ? 'skipped' : ''} ${c.required ? 'locked' : ''}`} draggable={!c.required}
                        onDragStart={(e) => onDrag(e, c.id)} data-testid={`node-${c.id}`} aria-describedby={`d-${c.id}`}>
                        <span className="wfb-dot" /><span className="wfb-l">{c.label}</span>
                        {c.required ? <span className="tiny dim" title="Always needed">locked</span>
                          : <button className="btn sm ghost" onClick={() => remove(c.id)} aria-label={`Remove ${c.label}`} data-testid={`remove-${c.id}`}>×</button>}
                        <button className="wfb-more tiny" onClick={() => setOpen(open === c.id ? null : c.id)} aria-expanded={open === c.id}>{open === c.id ? 'less' : 'what it does'}</button>
                        {open === c.id && <p id={`d-${c.id}`} className="tiny">{c.description}{c.needs?.length ? ` Needs: ${c.needs.map((n) => by[n]?.label).join(', ')}.` : ''}</p>}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
          <div className="wfb-fixed"><span className="wfb-pill">{spec.fixed[1]?.label}</span><span className="wfb-pill">{spec.fixed[2]?.label}</span></div>
        </div>
      </div>

      <PipelineGraph comps={comps} pipe={pv.pipe} parents={pv.parents} fixed={spec.fixed} />

      <div className="wfb-checks" data-testid="wfb-checks" aria-live="polite">
        <p className="label">Pipeline checks</p>
        {pv.notes.length === 0 ? <p className="small ok">✓ Every step has what it needs.</p>
          : <ul>{pv.notes.map((n) => <li key={n.text} className={`small ${n.kind}`}>{n.kind === 'warn' ? '⚠ ' : 'ℹ '}{n.text}</li>)}</ul>}
        <details className="small"><summary>Test failure handling ({inject.length})</summary>
          {[['jev_unavailable', 'JEV is unreachable'], ['low_jev_confidence', 'JEV is unsure about every paper'], ['groq_unavailable', 'Groq and Gemini are unreachable']].map(([k, l]) => (
            <label key={k}><input type="checkbox" checked={inject.includes(k)} onChange={(e) => setInject(e.target.checked ? [...inject, k] : inject.filter((x) => x !== k))} />{l}</label>
          ))}
        </details>
      </div>
    </section>
  )
}

const lastCore = (pipe: string[]) => ['jev_review_route', 'conflict_check', 'claim_verify', 'extract_claims', 'jev_triage', 'retrieve'].find((n) => pipe.includes(n)) ?? 'retrieve'

/** Layered drawing of the DAG the server will build (same parent rule as evidence_agent.graph_parents). */
function PipelineGraph({ comps, pipe, parents, fixed }: { comps: Component[]; pipe: string[]; parents: Record<string, string[]>; fixed: { id: string; label: string }[] }) {
  const label: Record<string, string> = { trigger: 'Start', agent_report: 'Evidence report', ...Object.fromEntries(fixed.map((f) => [f.id, f.label])), ...Object.fromEntries(comps.map((c) => [c.id, c.label])) }
  const stage: Record<string, string> = Object.fromEntries(comps.map((c) => [c.id, c.stage]))
  const par: Record<string, string[]> = { trigger: [], taxonomy_match: ['trigger'], ...parents, regulation_retrieve: ['taxonomy_match'],
    agent_report: [lastCore(pipe), 'regulation_retrieve', ...(pipe.includes('stochastic_lambda') ? ['stochastic_lambda'] : []), ...pipe.filter((c) => CONTEXT.has(c))] }
  const ids = ['trigger', 'taxonomy_match', ...pipe, 'regulation_retrieve', 'agent_report']
  const depth: Record<string, number> = {}
  for (const id of ids) depth[id] = Math.max(0, ...par[id].filter((p) => p in depth).map((p) => depth[p] + 1))
  const cols: string[][] = []
  for (const id of ids) (cols[depth[id]] ??= []).push(id)
  const W = 132, H = 34, GX = 34, GY = 12
  const pos: Record<string, [number, number]> = {}
  cols.forEach((col, x) => col.forEach((id, y) => { pos[id] = [12 + x * (W + GX), 12 + y * (H + GY)] }))
  const width = 24 + cols.length * (W + GX), height = 24 + Math.max(...cols.map((c) => c.length)) * (H + GY)
  return (
    <figure className="wfb-graph" aria-label="Pipeline graph preview">
      <figcaption className="label">What will run</figcaption>
      <div className="wfb-graph-scroll">
        <svg width={width} height={height} role="img" aria-label={`${ids.length} steps`}>
          {ids.flatMap((id) => par[id].filter((p) => pos[p]).map((p) => {
            const [x1, y1] = pos[p], [x2, y2] = pos[id]
            const a = x1 + W, b = y1 + H / 2, c = x2, d = y2 + H / 2, m = (a + c) / 2
            return <path key={`${p}-${id}`} className="wfb-edge" d={`M${a},${b} C${m},${b} ${m},${d} ${c},${d}`} />
          }))}
          {ids.map((id) => (
            <g key={id} transform={`translate(${pos[id][0]},${pos[id][1]})`} className={`wfb-gn wst-${stage[id] ?? 'fixed'}`} data-testid={`graph-${id}`}>
              <rect width={W} height={H} rx={6} />
              <text x={8} y={H / 2 + 4}>{label[id].length > 20 ? label[id].slice(0, 19) + '…' : label[id]}</text>
              <title>{label[id]}</title>
            </g>
          ))}
        </svg>
      </div>
    </figure>
  )
}
