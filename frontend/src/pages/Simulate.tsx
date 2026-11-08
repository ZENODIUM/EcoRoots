import { useEffect, useMemo, useState } from 'react'
import { api, type AuditedStudy, type MatrixCard, type QuotaAnswer, type SavedItem, type SimResult, type SpeciesProfile } from '../api'
import { G, T } from '../ui/terms'
import { useSelection } from '../store'
import LifeCycleBoard, { PROCESS_COLOR, shortStage } from './simulate/LifeCycleBoard'
import TrajectoryChart, { type Line } from './simulate/TrajectoryChart'
import './simulate.css'

type Mode = 'study' | 'rotation' | 'hypothetical' | 'projection'
const MODES: { id: Mode; label: string; tier: string; blurb: string }[] = [
  { id: 'study', label: 'Harvest study', tier: 'A', blurb: 'Harvested vs control matrices from an audited study' },
  { id: 'rotation', label: 'Rotation', tier: 'A·x', blurb: 'Repeat the experimental harvest every r years (extrapolation)' },
  { id: 'hypothetical', label: 'Hypothetical removal', tier: 'B', blurb: 'Remove a fraction of chosen stages each year (sensitivity only)' },
  { id: 'projection', label: 'Baseline projection', tier: '—', blurb: 'Project a published matrix without harvest' },
]
const LOCAL_ITEMS: [string, string][] = [
  ['local_stage_counts', 'Stage counts of the local population'],
  ['harvest_yield', 'Measured organ yield at the site'],
  ['post_harvest_recovery', 'Monitored post-harvest recovery with controls'],
  ['identity_verified', 'Voucher-verified species identity'],
  ['site_rights', 'Collection rights, permits and FPIC'],
  ['expert_threshold', 'Expert-agreed threshold and monitoring interval'],
]
const TREAT = ['#d9b56a', '#B7855F', '#a8664a', '#80573E', '#5e3f2e', '#c9a27d']
const PUBLISHED_RECOVERY = 'Ghimire et al. (2008) report 5–33 years using year-specific post-harvest matrices; COMPADRE holds only 1999–2002 means, which bias recovery short (E06).'

export default function Simulate() {
  const { species: selSpecies, setSpecies } = useSelection()
  const species = selSpecies ?? 'Nardostachys jatamansi'
  const [profile, setProfile] = useState<SpeciesProfile | null>(null)
  const [audited, setAudited] = useState<AuditedStudy[]>([])
  const [mode, setMode] = useState<Mode>('study')
  const [studyId, setStudyId] = useState<string | null>(null)
  const [treatmentId, setTreatmentId] = useState<number | null>(null)
  const [restYears, setRestYears] = useState(5)
  const [horizon, setHorizon] = useState(30)
  const [matrixId, setMatrixId] = useState<number | null>(null)
  const [removeStages, setRemoveStages] = useState<number[]>([])
  const [fraction, setFraction] = useState(0.2)
  const [studyRes, setStudyRes] = useState<SimResult | null>(null)
  const [res, setRes] = useState<SimResult | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [focus, setFocus] = useState<number | null>(null)
  const [focusCard, setFocusCard] = useState<MatrixCard | null>(null)
  const [controlCard, setControlCard] = useState<MatrixCard | null>(null)
  const [showDelta, setShowDelta] = useState(true)
  const [evidence, setEvidence] = useState<Record<string, boolean>>({})
  const [quota, setQuota] = useState<QuotaAnswer | null>(null)
  const [saved, setSaved] = useState<SavedItem[]>([])
  const [saveName, setSaveName] = useState('')

  useEffect(() => { api.studies().then((r) => setAudited(r.audited)).catch(() => {}) }, [])
  useEffect(() => { api.items('scenario').then((r) => setSaved(r.items)).catch(() => {}) }, [])
  useEffect(() => {
    setProfile(null); setMatrixId(null); setStudyId(null); setRemoveStages([])
    api.profile(species).then(setProfile).catch(() => {})
  }, [species])

  const studies = useMemo(() => audited.filter((a) => a.study.species === species), [audited, species])
  const study = studies.find((s) => s.study.id === studyId)?.study ?? null
  const presets = profile?.preset_matrices ?? []

  // sensible defaults once data arrive
  useEffect(() => {
    if (!studyId && studies.length) setStudyId(studies[0].study.id)
    // only re-pick the mode once both the study list and the profile are known, and only if the current one is unavailable
    if (!audited.length || !profile) return
    if (!modeAllowed(mode)) setMode((['study', 'rotation', 'hypothetical', 'projection'] as Mode[]).find(modeAllowed) ?? 'study')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studies, profile, audited])
  useEffect(() => { if (!matrixId && presets.length) setMatrixId(presets[0].matrix_id) }, [presets, matrixId])
  useEffect(() => { if (study) setTreatmentId(study.treatment_ids[Math.min(1, study.treatment_ids.length - 1)]) }, [study])

  // study comparison always loaded for a study species (powers labels and the board)
  useEffect(() => {
    setStudyRes(null)
    if (!studyId) return
    api.simulate({ mode: 'study', study_id: studyId, horizon }).then((r) => { setStudyRes(r); setFocus((f) => f ?? r.series?.[1]?.matrix_id ?? null) }).catch(() => {})
  }, [studyId, horizon])

  // main scenario (debounced so sliders feel immediate without flooding the API)
  useEffect(() => {
    setErr(null)
    let body: Record<string, unknown> | null = null
    if (mode === 'study' && studyId) body = { mode, study_id: studyId, horizon }
    if (mode === 'rotation' && studyId && treatmentId) body = { mode, study_id: studyId, treatment_id: treatmentId, rest_years: restYears, horizon }
    if (mode === 'hypothetical' && matrixId) body = { mode, matrix_id: matrixId, stages: removeStages, fraction, horizon }
    if (mode === 'projection' && matrixId) body = { mode, matrix_id: matrixId, horizon }
    if (!body) { setRes(null); return }
    let live = true
    setBusy(true)
    const t = setTimeout(() => {
      api.simulate(body!).then((r) => { if (live) setRes(r) }).catch((e: Error) => { if (live) { setRes(null); setErr(e.message) } }).finally(() => live && setBusy(false))
    }, 220)
    return () => { live = false; clearTimeout(t) }
  }, [mode, studyId, treatmentId, restYears, horizon, matrixId, removeStages, fraction])

  useEffect(() => {
    // ignore out-of-order responses so a stale verdict can never overwrite the current one
    let live = true
    api.quota(species, evidence).then((q) => { if (live) setQuota(q) }).catch(() => {})
    return () => { live = false }
  }, [species, evidence])

  // board matrices
  const boardId = mode === 'study' || mode === 'rotation' ? (mode === 'rotation' ? treatmentId : focus) : null
  useEffect(() => { setFocusCard(null); if (boardId) api.matrix(boardId).then(setFocusCard).catch(() => {}) }, [boardId])
  useEffect(() => { setControlCard(null); if (study) api.matrix(study.control_ids[0]).then(setControlCard).catch(() => {}) }, [study])
  const boardMatrix: MatrixCard | null = mode === 'study' || mode === 'rotation' ? focusCard : (res?.matrix ?? null)

  const lines: Line[] = useMemo(() => {
    if (!res) return []
    if (res.mode === 'study' && res.series) {
      let k = 0
      return res.series.map((s) => ({
        id: String(s.matrix_id), label: `${trimLabel(s.label).split(' · ')[0].replace(' rhizome harvest', '').replace(' (control subplots)', ' control').slice(0, 16)}  ${s.lambda.toFixed(3)}`, values: s.trajectory.index,
        color: s.role === 'control' ? '#8FB89A' : s.role === 'reference' ? '#77B5BD' : TREAT[k++ % TREAT.length],
        dashed: s.role === 'reference', emphasis: s.matrix_id === focus,
      }))
    }
    if (res.mode === 'rotation') return [
      { id: 'ctl', label: 'control (no harvest)', values: res.control_trajectory!.index, color: '#8FB89A' },
      { id: 'rot', label: `harvest every ${res.rest_years} y · λ̄ ${res.annualised_lambda!.toFixed(3)}`, values: res.trajectory!.index, color: '#B7855F', emphasis: true },
    ]
    if (res.mode === 'hypothetical') return [
      { id: 'b', label: `no removal · λ ${res.lambda_baseline!.toFixed(3)}`, values: res.trajectory_baseline!.index, color: '#8FB89A' },
      { id: 's', label: `removal · λ ${res.lambda_scenario!.toFixed(3)}`, values: res.trajectory_scenario!.index, color: '#A39BC7', emphasis: true, dashed: true },
    ]
    return [{ id: 'p', label: `λ ${res.matrix!.lambda.toFixed(3)}`, values: res.trajectory!.index, color: '#8FB89A', emphasis: true }]
  }, [res, focus])

  const harvestYears = res?.mode === 'rotation' && res.rest_years ? Array.from({ length: Math.floor(horizon / res.rest_years) + 1 }, (_, k) => k * res.rest_years!) : undefined

  const save = async () => {
    const body = { species, mode, study_id: studyId, treatment_id: treatmentId, rest_years: restYears, horizon, matrix_id: matrixId, stages: removeStages, fraction,
      result_summary: summary(res), run_id: res?.run_id }
    const it = await api.saveItem('scenario', saveName || `${species} · ${mode}`, body)
    setSaved((s) => [it, ...s]); setSaveName('')
  }
  const load = (it: SavedItem) => {
    const b = it.body as Record<string, never>
    if (b.species && b.species !== species) setSpecies(b.species)
    setMode(b.mode); setStudyId(b.study_id); setTreatmentId(b.treatment_id); setRestYears(b.rest_years ?? 5)
    setHorizon(b.horizon ?? 30); setMatrixId(b.matrix_id); setRemoveStages(b.stages ?? []); setFraction(b.fraction ?? 0.2)
  }

  const modeAllowed = (m: Mode) => (m === 'study' ? studies.length > 0 : m === 'rotation' ? studies.some((s) => s.study.design === 'experimental')
    : presets.length > 0)
  const blockedWhy = (m: Mode) => {
    const t = profile?.eligibility.tasks
    const key = { study: 'harvest_comparison', rotation: 'rotation_extrapolation', hypothetical: 'hypothetical_harvest', projection: 'demographic_projection' }[m]
    return t?.[key]?.reasons?.[0] ?? 'not available for this species'
  }
  const stages = (res?.matrix?.stages ?? focusCard?.stages ?? [])

  return (
    <div className="simulate">
      <aside className="rail left scroll" aria-label="Scenario setup">
        <div className="rail-sec">
          <p className="label">Species</p>
          <h2 className="sp-name"><i>{species}</i></h2>
          <p className="small dim">{selSpecies ? 'Carried over from Explore.' : 'Default flagship study. Choose another species on Explore.'}</p>
          <div className="quick">
            {['Nardostachys jatamansi', 'Khaya senegalensis', 'Prunus africana', 'Echinacea angustifolia', 'Panax quinquefolius'].map((s) => (
              <button key={s} className="btn sm quiet" aria-pressed={s === species} onClick={() => setSpecies(s)}><i>{s.split(' ')[0]}</i></button>
            ))}
          </div>
        </div>

        <div className="rail-sec">
          <p className="label">Scenario type</p>
          <div className="modes" role="radiogroup" aria-label="Scenario type">
            {MODES.map((m) => {
              const ok = modeAllowed(m.id)
              return (
                <button key={m.id} role="radio" aria-checked={mode === m.id} className="mode" disabled={!ok} onClick={() => setMode(m.id)} data-testid={`mode-${m.id}`}>
                  <span className="mode-h"><b>{m.label}</b><span className="mono">tier {m.tier}</span></span>
                  <span className="mode-b">{ok ? m.blurb : blockedWhy(m.id)}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="rail-sec controls">
          {(mode === 'study' || mode === 'rotation') && studies.length > 0 && (
            <label>Study
              <select className="input" value={studyId ?? ''} onChange={(e) => { setStudyId(e.target.value); setFocus(null) }}>
                {studies.map((s) => <option key={s.study.id} value={s.study.id}>{s.study.citation.split('(')[0].split(',')[0]} et al. ({s.study.citation.match(/\((\d{4})\)/)?.[1]}) · {s.study.design}</option>)}
              </select>
            </label>
          )}
          {mode === 'rotation' && studyRes?.series && (
            <>
              <label>Harvest treatment
                <select className="input" value={treatmentId ?? ''} onChange={(e) => setTreatmentId(+e.target.value)} data-testid="treatment">
                  {studyRes.series.filter((s) => s.role === 'treatment').map((s) => <option key={s.matrix_id} value={s.matrix_id}>{trimLabel(s.label)}</option>)}
                </select>
              </label>
              <label><span>Harvest every <b className="num">{restYears}</b> years</span>
                <input type="range" min={1} max={20} value={restYears} onChange={(e) => setRestYears(+e.target.value)} data-testid="rest-years" />
              </label>
            </>
          )}
          {(mode === 'hypothetical' || mode === 'projection') && presets.length > 0 && (
            <label><T sci="Published matrix (QC-passing)" plain="Published life-cycle table (passed quality checks)" />
              <select className="input" value={matrixId ?? ''} onChange={(e) => { setMatrixId(+e.target.value); setRemoveStages([]) }}>
                {presets.map((p) => <option key={p.matrix_id} value={p.matrix_id}>{p.matrix_id} · {p.population} · {p.treatment} · {p.years}</option>)}
              </select>
            </label>
          )}
          {mode === 'hypothetical' && stages.length > 0 && (
            <>
              <fieldset className="stagepick">
                <legend>Stages removed</legend>
                {stages.map((s, k) => (
                  <label key={k}><input type="checkbox" checked={removeStages.includes(k)}
                    onChange={(e) => setRemoveStages(e.target.checked ? [...removeStages, k].sort() : removeStages.filter((x) => x !== k))} />{shortStage(s)}</label>
                ))}
              </fieldset>
              <label><span>Fraction removed per year <b className="num">{Math.round(fraction * 100)}%</b></span>
                <input type="range" min={0} max={0.9} step={0.05} value={fraction} onChange={(e) => setFraction(+e.target.value)} />
              </label>
            </>
          )}
          <label><span>Horizon <b className="num">{horizon} years</b></span>
            <input type="range" min={5} max={100} step={5} value={horizon} onChange={(e) => setHorizon(+e.target.value)} />
          </label>
        </div>

        <div className="rail-sec">
          <p className="label">Saved scenarios</p>
          <div className="saverow">
            <input className="input" placeholder="Name this scenario" value={saveName} onChange={(e) => setSaveName(e.target.value)} />
            <button className="btn sm" disabled={!res} onClick={save} data-testid="save-scenario">Save</button>
          </div>
          <ul className="saved">
            {saved.slice(0, 8).map((s) => (
              <li key={s.id}><button onClick={() => load(s)}>{s.name}<span className="mono dim">{String((s.body as { result_summary?: string }).result_summary ?? '')}</span></button></li>
            ))}
            {!saved.length && <li className="small dim">None yet.</li>}
          </ul>
        </div>
      </aside>

      <section className="sim-center scroll">
        {err && <p className="error" role="alert">{err}</p>}
        {boardMatrix ? (
          <>
            {mode === 'study' && studyRes?.series && (
              <div className="series-pick" role="group" aria-label="Matrix shown on the board">
                {studyRes.series.map((s) => (
                  <button key={s.matrix_id} aria-pressed={focus === s.matrix_id} onClick={() => setFocus(s.matrix_id)}>
                    <span className={`dot ${s.role}`} />{trimLabel(s.label)}<span className="num">{s.lambda.toFixed(3)}</span>
                  </button>
                ))}
                <label className="delta-toggle"><input type="checkbox" checked={showDelta} onChange={(e) => setShowDelta(e.target.checked)} /> show change vs control</label>
              </div>
            )}
            <LifeCycleBoard matrix={boardMatrix} compare={(mode === 'study' || mode === 'rotation') && showDelta ? controlCard : null}
              title={mode === 'hypothetical' ? 'Life cycle (before removal)' : mode === 'projection' ? 'Life cycle' : 'Life cycle of the selected matrix'} />
          </>
        ) : <div className="board-empty">{busy ? 'Computing…' : 'Choose a scenario.'}</div>}
        {lines.length > 0 && <TrajectoryChart lines={lines} markers={harvestYears} caption="Population index N(t) / N(0), log scale · starts from the stable stage structure, not a local stock" />}
      </section>

      <aside className="rail right scroll" aria-label="Results">
        <Results res={res} busy={busy} />
        <div className="rail-sec quota" data-testid="sim-quota">
          <p className="label">Can a safe local harvest rate be estimated?</p>
          <p className="quota-answer serif">{quota?.answer_status ?? '…'}</p>
          <p className="quota-why">{quota?.message}</p>
          <fieldset className="evidence">
            <legend className="small dim">Local evidence declared for a site (all six are required)</legend>
            {LOCAL_ITEMS.map(([k, l]) => (
              <label key={k}><input type="checkbox" checked={Boolean(evidence[k])} onChange={(e) => setEvidence({ ...evidence, [k]: e.target.checked })} />{l}</label>
            ))}
          </fieldset>
          <p className="small dim">{quota?.not_a_permit}</p>
        </div>
      </aside>
    </div>
  )
}

const pct = (l: number) => { const v = (l - 1) * 100; return Math.abs(v) < 0.5 ? 'about stable' : v > 0 ? `grows about ${v.toFixed(1)}% a year` : `shrinks about ${Math.abs(v).toFixed(1)}% a year` }
const PROCESS_PLAIN: Record<string, string> = { stasis: 'staying the same size', progression: 'growing to a bigger stage', retrogression: 'shrinking back a stage', fecundity: 'new seedlings', survival: 'survival', growth: 'growth' }

function Results({ res, busy }: { res: SimResult | null; busy: boolean }) {
  if (!res) return <div className="rail-sec"><p className="label">Result</p><p className="small dim">{busy ? 'Computing…' : 'No scenario yet.'}</p></div>
  const tierText: Record<string, string> = {
    A: 'Study-backed: matrices estimated from harvested and control plants', 'A-extrapolated': 'Study-matrix extrapolation, not a permitted rotation',
    B: 'Hypothetical: mathematical assumption, not an observed harvest response', 'published-model': 'Published matrix projected without harvest',
  }
  return (
    <div className={`rail-sec sim-results ${busy ? 'stale' : ''}`} data-testid="sim-result">
      <p className="label">Result</p>
      <div className="tier-line"><span className={`tier tier-${res.tier[0] === 'p' ? 'B' : res.tier[0]}`}>{res.tier === 'published-model' ? 'P' : res.tier[0]}</span><p>{tierText[res.tier] ?? res.tier}</p></div>

      {res.mode === 'study' && res.series && res.comparison && (
        <>
          <table className="lam num">
            <thead><tr><th><T sci="series" plain="plot group" /></th><th><G k="lambda"><T sci="λ" plain="yearly growth" /></G></th></tr></thead>
            <tbody>{res.series.map((s) => <tr key={s.matrix_id} className={s.role}><td>{trimLabel(s.label)}</td><td>{s.lambda.toFixed(3)}</td></tr>)}</tbody>
          </table>
          <p className="big num"><T sci="Δλ" plain="Difference" /> <b>{res.comparison.delta_mean >= 0 ? '+' : ''}{res.comparison.delta_mean.toFixed(3)}</b><span className="small dim"> <T sci="harvested − control (means)" plain="harvested minus untouched plots" /></span></p>
          <p className="plain-line">In plain words: harvested plots {res.comparison.delta_mean < -0.005 ? 'grew more slowly' : res.comparison.delta_mean > 0.005 ? 'grew faster' : 'grew about the same'} than untouched ones at this study site (a difference of {Math.abs(res.comparison.delta_mean * 100).toFixed(1)} percentage points of yearly growth).</p>
          {res.comparison.permutation_test && (
            <p className="small">Permutation test p = <b className="num">{res.comparison.permutation_test.p_value.toFixed(2)}</b> · 95% CI {res.comparison.permutation_test.ci95.map((v) => v.toFixed(3)).join(' to ')}
              {' '}({res.comparison.permutation_test.n_treatment} vs {res.comparison.permutation_test.n_control} {res.comparison.permutation_test.unit}s)</p>
          )}
          <Ltre ltre={res.comparison.ltre_by_process} labels={Object.fromEntries(res.series.map((s) => [String(s.matrix_id), trimLabel(s.label)]))} />
          {res.design_caveat && <p className="note">{res.design_caveat}</p>}
        </>
      )}

      {res.mode === 'rotation' && (
        <>
          <p className="big num"><T sci="λ̄" plain="Yearly growth" /> <b>{res.annualised_lambda!.toFixed(3)}</b><span className="small dim"> <T sci="annualised" plain="averaged per year" />, {res.intensity_pct}% harvest every {res.rest_years} y</span></p>
          <p className="plain-line">In plain words: with this cycle the modelled population {pct(res.annualised_lambda!)}.</p>
          <dl className="kv num">
            <div><dt><T sci="shortest interval with λ̄ ≥ 1" plain="fewest rest years that keep it from shrinking" /></dt><dd>{res.min_rest_years_lambda_ge_1 ?? 'none ≤ 60 y'} y</dd></div>
            <div><dt>recovery after one harvest</dt><dd>{res.single_harvest_recovery?.years_to_recover_initial_abundance ?? '—'} y</dd></div>
          </dl>
          <p className="note warn">{PUBLISHED_RECOVERY}</p>
        </>
      )}

      {res.mode === 'hypothetical' && (
        <>
          <p className="big num"><T sci="λ" plain="Yearly growth" /> <b>{res.lambda_baseline!.toFixed(3)} → {res.lambda_scenario!.toFixed(3)}</b></p>
          <p className="plain-line">In plain words: without removal it {pct(res.lambda_baseline!)}; with this removal it {pct(res.lambda_scenario!)}. A mathematical what-if, not an observed harvest.</p>
          <p className="note warn" data-testid="calibration-warning">{res.calibration_warning}</p>
        </>
      )}

      {res.mode === 'projection' && res.matrix && (
        <>
          <p className="big num"><T sci="λ" plain="Yearly growth" /> <b>{res.matrix.lambda.toFixed(3)}</b><span className="small dim"> <T sci={`damping ratio ${res.matrix.damping_ratio.toFixed(2)}`} plain={`settles ${res.matrix.damping_ratio > 1.5 ? 'quickly' : 'slowly'} into its long-run pattern`} /></span></p>
          <p className="plain-line">In plain words: left alone, this population {pct(res.matrix.lambda)} in the long run.</p>
          <dl className="kv num">
            <div><dt><T sci="net reproductive rate R₀" plain="offspring per plant over its life" /></dt><dd>{res.matrix.life_table.R0.toFixed(2)}</dd></div>
            <div><dt><T sci="generation time" plain="average age of parents" /></dt><dd>{res.matrix.life_table.generation_time.toFixed(1)} y</dd></div>
            <div><dt>life expectancy</dt><dd>{res.matrix.life_table.life_expectancy.toFixed(1)} y</dd></div>
          </dl>
        </>
      )}

      {res.matrix?.elasticity_by_process && <ProcessBar e={res.matrix.elasticity_by_process} />}

      {(res.assumptions?.length ?? 0) > 0 && (
        <details><summary>Assumptions ({res.assumptions!.length})</summary><ul className="assume">{res.assumptions!.map((a) => <li key={a}>{a}</li>)}</ul></details>
      )}
      <p className="src">{res.n0_basis}</p>
      <p className="src">{res.provenance ? `COMPADRE ${res.provenance.compadre_version} · ${res.provenance.engine} · ${res.provenance.computed_ms} ms` : ''}{res.run_id ? ` · ${res.run_id}` : ''}</p>
    </div>
  )
}

function Ltre({ ltre, labels }: { ltre: Record<string, Record<string, number>>; labels: Record<string, string> }) {
  const rows = Object.entries(ltre)
  if (!rows.length) return null
  const max = Math.max(...rows.flatMap(([, r]) => [Object.values(r).filter((v) => v < 0).reduce((a, v) => a - v, 0), Object.values(r).filter((v) => v > 0).reduce((a, v) => a + v, 0)]), 1e-9)
  return (
    <div className="ltre" data-testid="ltre">
      <p className="small"><T sci="Where the change in λ comes from (LTRE by process)" plain="Which life process explains the difference" /> <G k="ltre" icon /></p>
      {rows.map(([mid, r]) => {
        let neg = 0, pos = 0
        return (
          <div key={mid} className="ltre-row">
            <span className="small">{labels[mid] ?? mid}</span>
            <svg viewBox="0 0 200 12" preserveAspectRatio="none">
              <line x1="100" x2="100" y1="0" y2="12" stroke="#A9B7A9" strokeWidth="0.6" />
              {Object.entries(r).map(([p, v]) => {
                const w = (Math.abs(v) / max) * 100
                const xx = v < 0 ? 100 - (neg += w) : 100 + (pos += w) - w
                return <rect key={p} x={xx} y={1} width={w} height={10} fill={PROCESS_COLOR[p as keyof typeof PROCESS_COLOR]}><title>{`${p}: ${v >= 0 ? '+' : ''}${v.toFixed(3)}`}</title></rect>
              })}
            </svg>
          </div>
        )
      })}
      <p className="src"><T sci="left of the line lowers λ, right raises it · colours = process" plain="bars left of the line pull growth down, right push it up · colours = life process" /></p>
    </div>
  )
}

function ProcessBar({ e }: { e: Record<string, number> }) {
  const entries = Object.entries(e).filter(([, v]) => v > 0)
  return (
    <div className="pbar">
      <p className="small"><T sci="Elasticity of λ by process" plain="How much long-run growth depends on each life process" /> <G k="elasticity" icon /></p>
      <div className="pbar-track">{entries.map(([k, v]) => <i key={k} style={{ width: `${v * 100}%`, background: PROCESS_COLOR[k as keyof typeof PROCESS_COLOR] }} title={`${k} ${(v * 100).toFixed(0)}%`} />)}</div>
      <p className="src">{entries.map(([k, v]) => <span key={k} className="pbar-k"><i style={{ background: PROCESS_COLOR[k as keyof typeof PROCESS_COLOR] }} /><T sci={k} plain={PROCESS_PLAIN[k] ?? k} /> {(v * 100).toFixed(0)}%</span>)}</p>
    </div>
  )
}

function trimLabel(s: string) { return s.replace('Unmanipulated', 'Control').replace(/\s*·\s*/g, ' · ').slice(0, 40) }
function summary(r: SimResult | null) {
  if (!r) return ''
  if (r.mode === 'study') return `Δλ ${r.comparison?.delta_mean.toFixed(3)}`
  if (r.mode === 'rotation') return `λ̄ ${r.annualised_lambda?.toFixed(3)}`
  if (r.mode === 'hypothetical') return `λ ${r.lambda_baseline?.toFixed(3)}→${r.lambda_scenario?.toFixed(3)}`
  return `λ ${r.matrix?.lambda.toFixed(3)}`
}
