import { useEffect, useState } from 'react'
import { api, type Bounds, type EvidencePlan, type PlanCell, type RegionInput, type ReverifyPlan, type SurveyPlan } from '../api'
import { Card, Meter, Stat, Table } from '../ui/kit'
import { G, T } from '../ui/terms'
import { useSelection } from '../store'
import './plan.css'

type Intent = 'survey' | 'reverify' | 'evidence'
const INTENTS: { id: Intent; label: string; q: string }[] = [
  { id: 'survey', label: 'Survey design', q: 'Which cells cover the most environmental strata within budget?' },
  { id: 'reverify', label: 'Re-verify records', q: 'Which known populations are most overdue for a field check?' },
  { id: 'evidence', label: 'Evidence to collect', q: 'Which measurements unlock the most decisions per person-day?' },
]
const STRATA = ['#8FB89A', '#77B5BD', '#B7855F', '#A39BC7', '#d9b56a', '#608F73', '#437F95', '#c98f7a', '#9fb4c9', '#80573E']
const DEFAULT = { species: 'Khaya senegalensis', region: { bbox: [1.4, 9.0, 3.2, 11.8] as Bounds } }
const ITEMS_IN_HAND = ['local_stage_counts', 'harvest_yield', 'post_harvest_recovery', 'identity_verified', 'site_rights', 'expert_threshold', 'occurrence_survey', 'phenology_monitoring', 'matched_harvest_experiment']

export default function Plan() {
  const sel = useSelection()
  const species = sel.species ?? DEFAULT.species
  const region: RegionInput | null = sel.region ?? (sel.species ? null : DEFAULT.region)
  const [intent, setIntent] = useState<Intent>('survey')
  const [budget, setBudget] = useState(12)
  const [have, setHave] = useState<Record<string, boolean>>({})
  const [survey, setSurvey] = useState<SurveyPlan | null>(null)
  const [reverify, setReverify] = useState<ReverifyPlan | null>(null)
  const [evidence, setEvidence] = useState<EvidencePlan | null>(null)
  const [sweep, setSweep] = useState<{ b: number; ilp: number; greedy: number; random: number }[]>([])
  const [overlay, setOverlay] = useState<'greedy' | 'none'>('greedy')
  const [hover, setHover] = useState<PlanCell | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)

  useEffect(() => { setBudget(intent === 'evidence' ? 40 : 12) }, [intent])

  useEffect(() => {
    setErr(null)
    if (intent !== 'evidence' && !region) return
    let live = true
    setBusy(true)
    const t = setTimeout(() => {
      const body = { intent, species, region: intent === 'evidence' ? null : region, budget, have }
      const p = intent === 'survey' ? api.plan<SurveyPlan>(body).then((r) => live && setSurvey(r))
        : intent === 'reverify' ? api.plan<ReverifyPlan>(body).then((r) => live && setReverify(r))
          : api.plan<EvidencePlan>(body).then((r) => live && setEvidence(r))
      p.catch((e: Error) => live && setErr(e.message)).finally(() => live && setBusy(false))
    }, 250)
    return () => { live = false; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent, species, JSON.stringify(region), budget, JSON.stringify(have)])

  // budget sweep: ILP vs baselines across budgets (live re-solve, cf. E12)
  useEffect(() => {
    setSweep([])
    if (intent !== 'survey' || !region) return
    let live = true
    // one server-side sweep: the region context is built once and costs one rate-limit unit
    api.sweep(species, region)
      .then((r) => live && setSweep(r.rows.map((x) => ({ b: x.budget, ilp: x.ilp, greedy: x.greedy, random: x.random })))).catch(() => {})
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent, species, JSON.stringify(region)])

  const save = async () => {
    const run = intent === 'survey' ? survey?.run_id : intent === 'reverify' ? reverify?.run_id : evidence?.run_id
    const it = await api.saveItem('plan', `${species} · ${intent} · budget ${budget}`, { species, region, intent, budget, have, run_id: run })
    setSavedMsg(`Saved as ${it.id}`)
  }

  return (
    <div className="plan">
      <aside className="rail left scroll" aria-label="Plan setup">
        <div className="rail-sec">
          <p className="label">Species and region</p>
          <h2 className="sp-name"><i>{species}</i></h2>
          <p className="small dim">{region ? describeRegion(region) : 'No region selected.'} {!sel.species && '(default case; choose your own on Explore)'}</p>
          {!region && intent !== 'evidence' && <a className="btn sm" href="#/explore">Choose a region on the globe →</a>}
        </div>
        <div className="rail-sec">
          <p className="label">Planning question</p>
          <div className="modes" role="radiogroup" aria-label="Planning question">
            {INTENTS.map((i) => (
              <button key={i.id} role="radio" aria-checked={intent === i.id} className="mode" onClick={() => setIntent(i.id)} data-testid={`intent-${i.id}`}>
                <span className="mode-h"><b>{i.label}</b></span><span className="mode-b">{i.q}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="rail-sec controls">
          <label><span>Budget <b className="num">{budget}</b> {intent === 'evidence' ? 'person-days (assumed)' : 'cost units (assumed)'}</span>
            <input type="range" min={intent === 'evidence' ? 5 : 1} max={intent === 'evidence' ? 150 : 40} value={budget} onChange={(e) => setBudget(+e.target.value)} data-testid="budget" />
          </label>
          {intent === 'evidence' && (
            <fieldset className="evidence">
              <legend className="small dim">Already in hand (removed from the plan)</legend>
              {ITEMS_IN_HAND.map((k) => (
                <label key={k}><input type="checkbox" checked={Boolean(have[k])} onChange={(e) => setHave({ ...have, [k]: e.target.checked })} />{k.replace(/_/g, ' ')}</label>
              ))}
            </fieldset>
          )}
          {intent !== 'evidence' && <p className="small dim">Cell cost = 1 + 0.6 × (elevation − 1500 m) / 1000: an assumed access penalty, not observed logistics.</p>}
        </div>
        <div className="rail-sec">
          <button className="btn" onClick={save} disabled={busy} data-testid="save-plan">Save plan</button>
          {savedMsg && <p className="small dim" data-testid="saved-msg">{savedMsg}</p>}
        </div>
      </aside>

      <section className="plan-center scroll">
        {err && <p className="error" role="alert">{err}</p>}
        {intent === 'survey' && survey && (
          <>
            <div className="plate-head">
              <p className="serif">Survey plate: {survey.optimal.n_selected} cells chosen, {survey.optimal.strata_covered}/{survey.optimal.strata_total} environmental strata covered</p>
              <label className="small"><input type="checkbox" checked={overlay === 'greedy'} onChange={(e) => setOverlay(e.target.checked ? 'greedy' : 'none')} /> overlay greedy baseline</label>
            </div>
            <Plate cells={survey.cells} selected={survey.optimal.selected ?? []} other={overlay === 'greedy' ? survey.baselines.greedy.selected ?? [] : []}
              color={(c) => STRATA[(c.stratum ?? 0) % STRATA.length]} onHover={setHover} legend={<StrataLegend n={survey.optimal.strata_total} />} />
            <Compare plan={survey} />
            {sweep.length > 0 && <Sweep data={sweep} />}
          </>
        )}
        {intent === 'reverify' && reverify && (
          <>
            <div className="plate-head"><p className="serif" data-testid="reverify-head">Re-verification plate: {reverify.selected.length} stale record cells selected ({reverify.status})</p></div>
            <Plate cells={reverify.cells} selected={reverify.selected} other={[]} onHover={setHover}
              color={(c) => (c.n_records ? `rgba(183,133,95,${0.25 + 0.75 * Math.min(1, c.reverify_value ?? 0)})` : '#08160f')}
              legend={<p className="small dim">Fill = staleness (years since last record ÷ 15). Dark cells have no record and cannot be re-verified.</p>} />
          </>
        )}
        {intent === 'evidence' && evidence && <EvidenceGraph plan={evidence} />}
        {busy && <p className="busy num">solving…</p>}
      </section>

      <aside className="rail right scroll" aria-label="Plan details">
        {hover && intent !== 'evidence' ? (
          <div className="rail-sec inspector" data-testid="plan-cell">
            <p className="label">Cell {hover.id}</p>
            <dl className="kv num">
              <div><dt>GBIF records</dt><dd>{hover.n_records}</dd></div>
              <div><dt>last record</dt><dd>{hover.last_record_year ?? 'none'}</dd></div>
              <div><dt>cost (assumed)</dt><dd>{hover.cost.toFixed(2)}</dd></div>
              {hover.stratum !== undefined && <div><dt>stratum</dt><dd>{hover.stratum + 1}</dd></div>}
              {hover.benefit !== undefined && <div><dt>survey benefit</dt><dd>{hover.benefit}</dd></div>}
              <div><dt>suitability</dt><dd>{hover.suitability ?? 'not modelled'}</dd></div>
              <div><dt>elevation</dt><dd>{hover.elevation_m ?? '—'} m</dd></div>
            </dl>
            {(hover.reasons ?? [hover.reverify_reason]).filter(Boolean).map((r) => <p key={r} className="small dim">{r}</p>)}
          </div>
        ) : (
          <div className="rail-sec"><p className="label">Cell detail</p><p className="small dim">Hover a cell on the plate.</p></div>
        )}
        <PlanMeta intent={intent} survey={survey} reverify={reverify} evidence={evidence} />
      </aside>
    </div>
  )
}

function Plate({ cells, selected, other, color, onHover, legend }: { cells: PlanCell[]; selected: string[]; other: string[]; color: (c: PlanCell) => string; onHover: (c: PlanCell | null) => void; legend: React.ReactNode }) {
  const b = cells.reduce((a, c) => [Math.min(a[0], c.bounds[0]), Math.min(a[1], c.bounds[1]), Math.max(a[2], c.bounds[2]), Math.max(a[3], c.bounds[3])], [180, 90, -180, -90])
  const W = 720, scale = W / (b[2] - b[0]), H = (b[3] - b[1]) * scale
  const sel = new Set(selected), oth = new Set(other)
  return (
    <figure className="plate" data-testid="plate">
      <svg viewBox={`-30 -10 ${W + 40} ${H + 34}`} role="img" aria-label="Planning grid">
        {cells.map((c) => {
          const x = (c.bounds[0] - b[0]) * scale, y = (b[3] - c.bounds[3]) * scale
          const w = (c.bounds[2] - c.bounds[0]) * scale, h = (c.bounds[3] - c.bounds[1]) * scale
          return (
            <g key={c.id} onMouseEnter={() => onHover(c)} data-selected={sel.has(c.id) || undefined}>
              <rect x={x + 1} y={y + 1} width={w - 2} height={h - 2} fill={color(c)} opacity={sel.has(c.id) ? 0.95 : 0.32} />
              {sel.has(c.id) && <rect x={x + 3} y={y + 3} width={w - 6} height={h - 6} fill="none" stroke="#ECF0E7" strokeWidth={2} />}
              {oth.has(c.id) && <circle cx={x + w / 2} cy={y + h / 2} r={Math.min(w, h) * 0.12} fill="none" stroke="#050F0B" strokeWidth={2.4} />}
              {oth.has(c.id) && <circle cx={x + w / 2} cy={y + h / 2} r={Math.min(w, h) * 0.12} fill="none" stroke="#ECF0E7" strokeWidth={1} />}
              {c.n_records > 0 && <circle cx={x + w - 7} cy={y + 7} r={2.2} fill="#050F0B" />}
            </g>
          )
        })}
        <text x={0} y={H + 16} className="ax">{b[0].toFixed(2)}°</text>
        <text x={W} y={H + 16} className="ax" textAnchor="end">{b[2].toFixed(2)}°</text>
        <text x={-6} y={8} className="ax" textAnchor="end">{b[3].toFixed(2)}°</text>
        <text x={-6} y={H} className="ax" textAnchor="end">{b[1].toFixed(2)}°</text>
      </svg>
      <figcaption>
        <span className="sw"><i style={{ outline: '2px solid #ECF0E7', background: 'transparent' }} /> chosen by the optimiser</span>
        {other.length > 0 && <span className="sw"><i style={{ borderRadius: '50%', border: '1px solid #ECF0E7' }} /> chosen by greedy</span>}
        <span className="sw"><i style={{ width: 5, height: 5, borderRadius: '50%', background: '#050F0B', outline: '1px solid #A9B7A9' }} /> has a GBIF record</span>
        {legend}
      </figcaption>
    </figure>
  )
}

function StrataLegend({ n }: { n: number }) {
  return <span className="strata">{Array.from({ length: n }, (_, k) => <i key={k} style={{ background: STRATA[k % STRATA.length] }} title={`stratum ${k + 1}`} />)} <span className="small dim">environmental strata (k-means on climate + elevation)</span></span>
}

const obj = (s: { strata_covered: number; total_benefit: number; status?: string }) => (s.status === 'unavailable' ? NaN : 10 * s.strata_covered + s.total_benefit)

function Compare({ plan }: { plan: SurveyPlan }) {
  const rows: [string, (typeof plan.optimal)][] = [['Optimal (ILP)', plan.optimal], ...Object.entries(plan.baselines).map(([k, v]) => [k.replace('_', ' '), v] as [string, typeof v])]
  return (
    <table className="cmp num" data-testid="plan-compare">
      <thead><tr><th>method</th><th>strata</th><th>benefit</th><th>objective</th><th>cost</th><th>env. distance ↓</th></tr></thead>
      <tbody>
        {rows.map(([name, s]) => s.status === 'unavailable' ? (
          <tr key={name} className="na"><td>{name}</td><td colSpan={5}>unavailable: {s.reason}</td></tr>
        ) : (
          <tr key={name} className={name.startsWith('Optimal') ? 'opt' : ''}>
            <td>{name}</td><td>{fmt(s.strata_covered)}/{s.strata_total}</td><td>{fmt(s.total_benefit)}</td><td>{fmt(obj(s))}</td>
            <td>{s.cost_used !== undefined ? fmt(s.cost_used) : '—'}/{s.budget}</td><td>{s.mean_env_distance_to_nearest_selected.toFixed(3)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Sweep({ data }: { data: { b: number; ilp: number; greedy: number; random: number }[] }) {
  const W = 720, H = 150, L = 40, R = 90, T = 10, B = 24
  const max = Math.max(...data.flatMap((d) => [d.ilp, d.greedy, d.random]).filter(Number.isFinite))
  const bmax = data[data.length - 1].b
  const x = (b: number) => L + (b / bmax) * (W - L - R), y = (v: number) => T + (1 - v / max) * (H - T - B)
  const series: [keyof (typeof data)[0], string, string][] = [['ilp', '#ECF0E7', 'ILP'], ['greedy', '#77B5BD', 'greedy'], ['random', '#B7855F', 'random (mean)']]
  return (
    <figure className="sweep" data-testid="sweep">
      <figcaption className="serif">Objective vs budget: each point is a fresh solve</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`}>
        {[0, 0.5, 1].map((f) => <g key={f}><line x1={L} x2={W - R} y1={y(max * f)} y2={y(max * f)} stroke="#1c3a2f" /><text x={L - 6} y={y(max * f) + 3} className="ax" textAnchor="end">{Math.round(max * f)}</text></g>)}
        {data.map((d) => <text key={d.b} x={x(d.b)} y={H - 6} className="ax" textAnchor="middle">{d.b}</text>)}
        {series.map(([k, c]) => (
          <polyline key={k} fill="none" stroke={c} strokeWidth={k === 'ilp' ? 2 : 1.4} strokeDasharray={k === 'random' ? '4 3' : k === 'greedy' ? '1 3' : undefined} points={data.map((d) => `${x(d.b)},${y(d[k] as number)}`).join(' ')} />
        ))}
        {endLabels(series.map(([k, c, l]) => ({ c, l, y: y(data[data.length - 1][k] as number) + 3 }))).map((e) => (
          <text key={e.l} x={W - R + 6} y={e.y} className="endlabel" fill={e.c}>{e.l}</text>
        ))}
      </svg>
      <p className="src">ILP ≥ greedy at every budget is checked by the backend test suite (E12: median gain over greedy 0.1%, over random 28.6%). Gains are in the modelled objective, not field outcomes.</p>
    </figure>
  )
}

/** Push end-of-line labels apart so coincident lines stay readable. */
function endLabels<T extends { y: number }>(ls: T[]): T[] {
  const out = [...ls].sort((a, b) => a.y - b.y)
  for (let k = 1; k < out.length; k++) if (out[k].y - out[k - 1].y < 12) out[k] = { ...out[k], y: out[k - 1].y + 12 }
  return out
}

function EvidenceGraph({ plan }: { plan: EvidencePlan }) {
  const items = plan.items
  const decisions = Object.entries(plan.decisions)
  const W = 760, rowI = 34, rowD = 52, H = Math.max(items.length * rowI, decisions.length * rowD) + 20
  const yi = (k: number) => 20 + k * rowI, yd = (k: number) => 20 + k * rowD + (H - decisions.length * rowD) / 2 - 10
  const sel = new Set(plan.optimal.items), greedy = new Set(plan.greedy_baseline.items)
  return (
    <div className="evgraph" data-testid="evidence-graph">
      <p className="serif plate-head">Evidence plan: {plan.optimal.items.length} items, {plan.optimal.cost} of {plan.budget} {plan.budget_unit}, unlocking {plan.optimal.unlocks.length ? plan.optimal.unlocks.map((u) => plan.decisions[u]?.label ?? u).join(' and ') : 'nothing new'}</p>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Evidence items and the decisions they unlock">
        {decisions.map(([d, info], k) => info.requires.map((r) => {
          const i = items.findIndex((it) => it.id === r)
          if (i < 0) return null
          const on = sel.has(r) && info.unlocked
          return <path key={d + r} d={`M 300 ${yi(i)} C 400 ${yi(i)}, 430 ${yd(k)}, 520 ${yd(k)}`} fill="none" stroke={on ? '#8FB89A' : '#2a4d40'} strokeWidth={on ? 1.8 : 1} />
        }))}
        {items.map((it, k) => (
          <g key={it.id} className={sel.has(it.id) ? 'on' : ''}>
            <rect x={0} y={yi(k) - 11} width={300} height={22} rx={3} fill={sel.has(it.id) ? '#1d4a3b' : '#0B1C16'} stroke={sel.has(it.id) ? '#8FB89A' : '#1c3a2f'} />
            <text x={8} y={yi(k) + 4} className="it">{it.label.length > 44 ? it.label.slice(0, 43) + '…' : it.label}<title>{it.label}</title></text>
            <text x={292} y={yi(k) + 4} className="cost" textAnchor="end">{it.cost}d{greedy.has(it.id) ? ' · g' : ''}</text>
          </g>
        ))}
        {decisions.map(([d, info], k) => (
          <g key={d}>
            <rect x={520} y={yd(k) - 18} width={238} height={36} rx={3} fill={info.unlocked ? '#2a4f3f' : '#0B1C16'} stroke={info.unlocked ? '#8FB89A' : '#1c3a2f'} />
            <text x={530} y={yd(k) - 2} className="it">{info.label.length > 36 ? info.label.slice(0, 35) + '…' : info.label}<title>{info.label}</title></text>
            <text x={530} y={yd(k) + 12} className="cost">{info.unlocked ? 'unlocked by this plan' : `currently ${info.currently}`} · weight {info.value}</text>
          </g>
        ))}
      </svg>
      <table className="cmp num">
        <thead><tr><th>method</th><th>items</th><th>cost</th><th>decision value</th><th>unlocks</th></tr></thead>
        <tbody>
          <tr className="opt"><td><T sci="Optimal (ILP)" plain="Best plan (exact optimiser, ILP)" /></td><td>{plan.optimal.items.length}</td><td>{plan.optimal.cost}</td><td>{plan.optimal.value}</td><td>{plan.optimal.unlocks.join(', ') || '—'}</td></tr>
          <tr><td><T sci="item greedy (g)" plain="Quick rule of thumb (item greedy, g)" /></td><td>{plan.greedy_baseline.items.length}</td><td>{plan.greedy_baseline.cost}</td><td>{plan.greedy_baseline.value}</td><td>{plan.greedy_baseline.unlocks.join(', ') || '—'}</td></tr>
        </tbody>
      </table>
      <p className="src">A decision unlocks only when all of its required items are collected, which is why item-by-item greedy can spend budget without unlocking anything (E13).</p>
      <WhyThisPlan plan={plan} />
    </div>
  )
}

/** Why the plan differs by species: the species context, each chosen item's reasons and each decision's weight. */
function WhyThisPlan({ plan }: { plan: EvidencePlan }) {
  const c = plan.context
  const sel = new Set(plan.optimal.items)
  const chosen = plan.items.filter((i) => sel.has(i.id))
  const decisions = Object.entries(plan.decisions).map(([id, d]) => ({ id, ...d })).sort((a, b) => b.value - a.value)
  return (
    <section className="why-plan" data-testid="why-plan" aria-label="Why this plan">
      <h3 className="serif">Why this plan for <i>{plan.species}</i></h3>
      {c && (
        <div className="stat-row">
          <Stat tone="green" shape="leaf" value={c.growth_form ?? 'unknown'} label="growth form" hint={c.lifespan_factor > 1 ? `field work costs ×${c.lifespan_factor} (long-lived)` : 'standard field costs'} />
          <Stat tone="gold" shape="round" value={c.organ ?? 'unknown'} label="part harvested" hint={`harvest pressure ${Math.round(c.pressure * 100)}%`} />
          {c.sensitivity && <Stat tone="rose" shape="hex" value={`${Math.round(c.sensitivity.share * 100)}%`} label={<G k="elasticity">of growth rests on {c.sensitivity.process}</G>} hint={`${c.sensitivity.matrices} matrices · ${c.sensitivity.basis}`} />}
          <Stat tone="sky" shape="square" value={c.cites_listed == null ? 'unknown' : c.cites_listed ? `App. ${c.cites_appendices?.join(', ')}` : 'not listed'} label={<G k="cites">CITES</G>} />
          <Stat tone="plum" shape="round" value={c.lookalikes.length || 'none'} label="look-alikes to rule out" hint={c.lookalikes.join(', ') || undefined} />
        </div>
      )}
      <div className="why-cols">
        <Card title={`Chosen items (${chosen.length})`} tone="green">
          <Table rowKey={(r) => r.id} rows={chosen} cols={[
            { key: 'label', label: 'Item' },
            { key: 'cost', label: 'Days', num: true },
            { key: 'why', label: 'Why for this species', render: (r) => <ul className="why-list">{(r.why ?? []).map((w) => <li key={w}>{w}</li>)}</ul>, sort: (r) => (r.why ?? []).length },
          ]} />
        </Card>
        <Card title="Decisions and their weight" tone="gold">
          <ul className="why-dec">
            {decisions.map((d) => (
              <li key={d.id} className={d.unlocked ? 'on' : d.value === 0 ? 'zero' : ''}>
                <div><b>{d.label}</b> {d.unlocked && <span className="tchip t-green">unlocked</span>}</div>
                <Meter value={Math.min(1, d.value / 5)} tone={d.value === 0 ? 'grey' : d.unlocked ? 'green' : 'gold'} label={`weight ${d.value}`} text={d.value.toFixed(1)} />
                {d.why && <p className="tiny dim">{d.why}</p>}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </section>
  )
}

function PlanMeta({ intent, survey, reverify, evidence }: { intent: Intent; survey: SurveyPlan | null; reverify: ReverifyPlan | null; evidence: EvidencePlan | null }) {
  const p = intent === 'survey' ? survey : intent === 'reverify' ? reverify : evidence
  if (!p) return null
  const def = 'objective_definition' in p ? p.objective_definition : 'maximise the summed weight of decisions whose required evidence is fully collected, within budget'
  return (
    <>
      <div className="rail-sec">
        <p className="label">What is optimised</p>
        <p className="small">{def}</p>
        <p className="note warn">{p.caveat}</p>
        {intent === 'survey' && survey && <p className="small dim">Habitat suitability: {survey.suitability_status}. When withheld, survey benefit uses record gaps and environmental coverage only.</p>}
        {intent === 'evidence' && evidence?.decision_uncertainty.status === 'ok' && (
          <p className="small dim">Generic removal models disagree on whether harvest keeps λ ≥ 1 in {Math.round((evidence.decision_uncertainty.flip_probability ?? 0) * 100)}% of tested intensities. That uncertainty is why local evidence carries the largest weight.</p>
        )}
      </div>
      <div className="rail-sec">
        <p className="src">{'solver' in p ? p.solver : 'PuLP / CBC'} · {p.computed_ms} ms · {p.run_id}</p>
        <p className="small dim">A plan is a research design under stated assumptions. It is not a harvest permit, quota or guarantee of field results.</p>
      </div>
    </>
  )
}

function describeRegion(r: RegionInput) {
  if (r.bbox) return `Box ${r.bbox.map((v) => v.toFixed(2)).join(', ')}`
  if (r.point) return `${r.radius_km} km around ${r.point[1].toFixed(2)}, ${r.point[0].toFixed(2)}`
  return 'Custom polygon'
}
const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1))
