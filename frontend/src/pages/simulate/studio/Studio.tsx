import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { api, type SavedItem, type SpeciesSummary } from '../../../api'
import { useSelection } from '../../../store'
import { ASSETS, assetById, defaultArchetype, FOOTPRINT, isHeavy, SPECIES_COLOURS } from '../../../data/archetypes'
import { EVIDENCE, lambdaWords, ORGAN_NOTE, outlook } from '../../../lang'
import SpeciesPhoto from '../../../components/SpeciesPhoto'
import ExpertDrawer from '../../../components/ExpertDrawer'
import StartPassport from '../../../components/StartPassport'
import SimpleLineChart, { type Line } from '../../../components/SimpleLineChart'
import Plot2D from './Plot2D'
import { webglAvailable, type CameraApi, type FieldSpec, type Pick } from './Scene3D'
import {
  allocate, DEFAULT_SYNTHETIC, displayScale, layoutField, loadSlot, MAX_HEAVY_INSTANCES, MAX_INSTANCES, modelledAt, placements, PLOT, relativeSeries,
  spacingFor,
  selectedOption, shortStage, stageLooks, stageOfInstances, type Slot, type SlotData, type SyntheticParams,
} from './model'
import './studio.css'

const Scene3D = lazy(() => import('./Scene3D'))
const MAX_SLOTS = 3
const HORIZONS = [10, 20, 30, 50]
type Wanted = { label?: RegExp }

let keySeq = 0
function newSlot(name: string, organismType: string | null | undefined, index: number, startPop = 500, family?: string | null): Slot {
  const a = defaultArchetype(name, organismType, family)
  return { key: `s${Date.now().toString(36)}${keySeq++}`, name, colour: SPECIES_COLOURS[index % SPECIES_COLOURS.length], assetId: a.id,
    assetBasis: a.basis, startPop, scenarioId: null, studyId: null, synthetic: null }
}
const fetchKey = (s: Slot, horizon: number, d?: SlotData) =>
  [s.name, s.studyId, horizon, JSON.stringify(s.synthetic), d?.kind === 'population-only' ? s.scenarioId : ''].join('|')

export default function Studio() {
  const { species, setSpecies, setScene } = useSelection()
  const [slots, setSlots] = useState<Slot[]>([])
  const [data, setData] = useState<Record<string, SlotData & { fk?: string }>>({})
  const [horizon, setHorizon] = useState(20)
  const [year, setYear] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [active, setActive] = useState<string | null>(null)
  const [pick, setPick] = useState<Pick>(null)
  const reduced = useMemo(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, [])
  const gl = useMemo(webglAvailable, [])
  const [view, setView] = useState<'3d' | '2d'>(gl && window.innerWidth >= 760 ? '3d' : '2d')  // small screens start in 2D; the toggle still works
  const [assetErrors, setAssetErrors] = useState<string[]>([])
  const cameraApi = useRef<CameraApi | null>(null)
  const wanted = useRef<Record<string, Wanted>>({})
  const requested = useRef<Record<string, string>>({})

  // seed from the species chosen elsewhere in the app
  useEffect(() => {
    if (species && slots.length === 0) {
      api.profile(species).then((p) => setSlots((cur) => (cur.length ? cur : [newSlot(species, p.organism_type, 0, 500, p.family)]))).catch(() => {})
    }
  }, [species]) // eslint-disable-line react-hooks/exhaustive-deps

  // fetch evidence + trajectories per slot from the science API (stale responses ignored)
  useEffect(() => {
    slots.forEach((s) => {
      const fk = fetchKey(s, horizon, data[s.key])
      if (data[s.key]?.fk === fk || requested.current[s.key] === fk) return
      requested.current[s.key] = fk
      setData((d) => ({ ...d, [s.key]: { ...(d[s.key] ?? { kind: 'visual-only', options: [], stageNames: {} }), status: 'loading' } }))
      loadSlot(s, horizon)
        .then((r) => {
          if (requested.current[s.key] !== fk) return
          setData((d) => ({ ...d, [s.key]: { ...r, fk } }))
          const w = wanted.current[s.key]
          if (w?.label) {
            const o = r.options.find((x) => w.label!.test(x.label))
            if (o) setSlots((cur) => cur.map((c) => (c.key === s.key ? { ...c, scenarioId: o.id } : c)))
            delete wanted.current[s.key]
          }
        })
        .catch((e: Error) => requested.current[s.key] === fk && setData((d) => ({ ...d, [s.key]: { status: 'error', error: e.message, kind: 'none', options: [], stageNames: {}, fk } })))
    })
  }, [slots, horizon, data])

  useEffect(() => { if (year > horizon) setYear(horizon) }, [horizon, year])
  useEffect(() => {
    if (!playing) return
    const id = window.setInterval(() => setYear((y) => {
      if (y >= horizon) { setPlaying(false); return y }
      return y + 1
    }), 900 / speed)
    return () => window.clearInterval(id)
  }, [playing, speed, horizon])

  const update = (key: string, patch: Partial<Slot>) => setSlots((cur) => cur.map((s) => (s.key === key ? { ...s, ...patch } : s)))
  const addSpecies = async (name: string, organismType?: string | null, opts?: { startPop?: number; want?: Wanted; family?: string | null }) => {
    if (slots.length >= MAX_SLOTS || slots.some((s) => s.name.toLowerCase() === name.toLowerCase())) return
    let ot = organismType, fam = opts?.family
    if (ot === undefined || fam === undefined) {
      const p = await api.profile(name).catch(() => null)
      if (ot === undefined) ot = p?.organism_type ?? null
      if (fam === undefined) fam = p?.family ?? null
    }
    const s = newSlot(name, ot, slots.length, opts?.startPop, fam)
    if (opts?.want) wanted.current[s.key] = opts.want
    setSlots((cur) => (cur.length >= MAX_SLOTS ? cur : [...cur, { ...s, colour: SPECIES_COLOURS.find((c) => !cur.some((x) => x.colour === c)) ?? s.colour }]))
    setActive(s.key)
    if (!species) setSpecies(name)
  }
  const remove = (key: string) => { setSlots((cur) => cur.filter((s) => s.key !== key)); setPick(null) }
  const loadDemo = async () => {
    setSlots([]); setData({}); requested.current = {}; setYear(0)
    const demo: [string, string, number, Wanted?][] = [
      ['Nardostachys jatamansi', 'Herbaceous perennial', 500, { label: /^25%/ }],
      ['Prunus africana', 'Tree', 300],
      ['Sabal yapa', 'Palm', 200, { label: /harvest/i }],
    ]
    const made = demo.map(([n, ot, pop, w], i) => {
      const s = newSlot(n, ot, i, pop)
      if (w) wanted.current[s.key] = w
      return s
    })
    setSlots(made); setActive(made[0].key)
  }

  // ------------------------------------------------------------ display fields (same numbers as inspector and chart)
  // The field is sized from every species' peak instance count, so it stays the same size while the year changes.
  const layout = useMemo(() => {
    const n = Math.max(1, slots.length)
    const needs = slots.map((s) => {
      const opt = selectedOption(s, data[s.key])
      const scale = displayScale(s.startPop, n)
      const maxTotal = opt && opt.trajectory.total[0] > 0 ? Math.max(...opt.trajectory.total) / opt.trajectory.total[0] * s.startPop : s.startPop
      const cap = Math.min(isHeavy(s.assetId) ? MAX_HEAVY_INSTANCES : MAX_INSTANCES, Math.ceil(maxTotal / scale) + 2)
      return { cap, spacing: spacingFor(FOOTPRINT[s.assetId] ?? 1) }
    })
    return { ...layoutField(needs), needs }
  }, [slots, data])
  const plot = slots.length ? layout.plot : PLOT

  const fields: FieldSpec[] = useMemo(() => {
    const n = Math.max(1, slots.length)
    return slots.map((s, i) => {
      const d = data[s.key]
      const opt = selectedOption(s, d)
      const scale = displayScale(s.startPop, n)
      const band = layout.bands[i]
      const { cap, spacing } = layout.needs[i]
      const pos = placements(s.key, band, cap, spacing, layout.plot)
      const m = modelledAt(s, opt, year)
      const names = (opt && d?.stageNames[opt.id]) || ['plants']
      const matched = m.stages.length === names.length
      // size follows each stage's life phase; seeds in the soil and dormant plants are counted but not drawn
      const looks = matched ? stageLooks(names, (opt && d?.stageClasses?.[opt.id]) || []) : [{ scale: 1, drawn: true, group: 'stage' as const }]
      const counts = matched ? m.stages.map((v, k) => (looks[k].drawn ? v : 0)) : [m.total]
      const nActive = Math.max(0, Math.min(cap, Math.round(counts.reduce((a, b) => a + b, 0) / scale)))
      const perStage = allocate(counts, nActive)
      const sizes = looks.map((l) => l.scale)
      return {
        key: s.key, assetId: s.assetId, colour: s.colour, label: s.name, positions: pos, band, spacing,
        stageOf: stageOfInstances(perStage, sizes), stageScales: sizes,
        organ: d?.study?.organ ?? null,
      }
    })
  }, [slots, data, year, layout])

  const lines: Line[] = slots.flatMap((s) => {
    const d = data[s.key]
    const opt = selectedOption(s, d)
    if (!opt) return []
    const out: Line[] = [{ id: s.key, label: `${s.name}: ${opt.role === 'treatment' ? opt.label : opt.role === 'synthetic' ? 'synthetic' : 'no harvest'}`, values: relativeSeries(opt), color: s.colour }]
    if (opt.role === 'treatment' && d?.control) out.push({ id: s.key + 'c', label: `${s.name}: study control (no harvest)`, values: relativeSeries(d.control), color: s.colour, dashed: true })
    return out
  })

  const activeSlot = slots.find((s) => s.key === active) ?? slots[0]
  const pickInfo = (() => {
    if (!pick) return null
    const s = slots.find((x) => x.key === pick.key)
    const f = fields.find((x) => x.key === pick.key)
    if (!s || !f || pick.index >= f.stageOf.length) return null
    const opt = selectedOption(s, data[s.key])
    const names = (opt && data[s.key]?.stageNames[opt.id]) || ['plant']
    return { s, stage: names[f.stageOf[pick.index]] ?? 'plant', scale: displayScale(s.startPop, slots.length) }
  })()

  // ------------------------------------------------------------ saved scenes
  const [saved, setSaved] = useState<SavedItem[]>([])
  const [saveName, setSaveName] = useState('')
  const [compare, setCompare] = useState<string[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const refreshSaved = () => api.items('scene').then((r) => setSaved(r.items)).catch(() => {})
  useEffect(() => { refreshSaved() }, [])
  const saveScene = async () => {
    const summary = slots.map((s) => {
      const d = data[s.key], opt = selectedOption(s, d)
      const end = modelledAt(s, opt, horizon)
      return { name: s.name, colour: s.colour, scenario: opt?.label ?? 'visual only', evidence: d?.kind ?? 'visual-only',
        start: s.startPop, end_modelled: opt ? Math.round(end.total) : null, end_relative: opt ? Math.round(end.relative) : null }
    })
    const it = await api.saveItem('scene', saveName.trim() || `Plot · ${slots.map((s) => s.name.split(' ')[0]).join(', ')}`, { slots, horizon, summary })
    setScene(it.id); setSaveName(''); setMsg(`Saved “${it.name}”`); refreshSaved()
  }
  const openScene = (it: SavedItem) => {
    const b = it.body as { slots: Slot[]; horizon: number }
    setData({}); requested.current = {}; setSlots(b.slots); setHorizon(b.horizon); setYear(0); setActive(b.slots[0]?.key ?? null)
    setScene(it.id); setMsg(`Opened “${it.name}”`)
  }

  return (
    <div className="studio" data-testid="studio">
      <aside className="st-rail scroll" aria-label="Plants on the plot">
        <header className="st-head">
          <p className="label">Simulate</p>
          <h1>Living Ecosystem Studio</h1>
          <p className="small dim">Place up to three medicinal plants on a shared soil plot and watch published population models play out over time.</p>
        </header>
        {slots.map((s) => (
          <SlotCard key={s.key} slot={s} data={data[s.key]} open={activeSlot?.key === s.key} onOpen={() => setActive(s.key)}
            onChange={(p) => update(s.key, p)} onRemove={() => remove(s.key)} />
        ))}
        {slots.length < MAX_SLOTS && <AddPlant onAdd={(n, ot) => addSpecies(n, ot)} />}
        {slots.length === 0 && (
          <div className="st-empty">
            <p className="small">Start with a ready-made plot:</p>
            <button className="btn primary" onClick={loadDemo} data-testid="load-demo">Three-species demo plot</button>
            <p className="tiny dim">Jatamansi (rhizome experiment) · Prunus africana (bark, observational) · Sabal yapa (palm leaves, observational)</p>
          </div>
        )}
        <ScenesPanel saved={saved} saveName={saveName} setSaveName={setSaveName} canSave={slots.length > 0} onSave={saveScene}
          onOpen={openScene} compare={compare} setCompare={setCompare} msg={msg} />
        <a className="btn quiet sm st-science" href="#/simulate/science">Open the detailed science lab →</a>
      </aside>

      <section className="st-view" aria-label="Plot view">
        <div className="st-banner" role="note" data-testid="studio-banner">
          <b>Independent species scenarios.</b> Each plant runs its own published model; there is no interaction model between species.
          Starting counts are your assumption, and nothing here is a harvest quota or permit.
        </div>
        <div className="st-canvas" aria-label="3D soil plot" data-testid="plot">
          {view === '3d' && gl ? (
            <Suspense fallback={<div className="st-loading">Loading 3D scene…</div>}>
              <Scene3D fields={fields} plot={plot} pick={pick} onPick={setPick} cameraApi={cameraApi}
                onAssetError={(k) => setAssetErrors((e) => (e.includes(k) ? e : [...e, k]))} />
            </Suspense>
          ) : <Plot2D fields={fields} plot={plot} pick={pick} onPick={setPick} />}
          <div className="st-tools" role="toolbar" aria-label="View controls">
            {gl && <button className="btn sm" aria-pressed={view === '3d'} onClick={() => setView('3d')}>3D</button>}
            <button className="btn sm" aria-pressed={view === '2d'} onClick={() => setView('2d')}>2D top-down</button>
            {view === '3d' && gl && <>
              <button className="btn sm quiet" onClick={() => cameraApi.current?.reset()}>Reset view</button>
              <button className="btn sm quiet" onClick={() => cameraApi.current?.fit()}>Fit plants</button>
              <button className="btn sm quiet" onClick={() => cameraApi.current?.top()}>From above</button>
            </>}
          </div>
          <div className="st-yearbadge num" aria-live="polite">Year <b>{year}</b></div>
          {slots.length > 0 && <div className="st-plotsize num" title="The field grows with the number of plants it has to show">Field {plot.w} × {plot.d} units</div>}
          <ul className="st-scale" data-testid="scale-legend">
            {slots.map((s, i) => {
              const f = fields[i]
              return <li key={s.key}><i style={{ background: s.colour }} />1 model ≈ {displayScale(s.startPop, slots.length).toLocaleString()} plants · <span className="num">{f?.stageOf.length ?? 0}</span> shown</li>
            })}
            {!gl && <li className="dim">WebGL unavailable: showing the 2D plot</li>}
            {assetErrors.length > 0 && <li className="dim">a model failed to load; a simple stand-in is drawn</li>}
          </ul>
          {pickInfo && (
            <div className="st-pick" role="status" data-testid="pick-info">
              <b className="serif">{pickInfo.s.name}</b> · {shortStage(pickInfo.stage)}<br />
              <span className="dim">one rendered plant ≈ {pickInfo.scale} modelled plants in this stage mix</span>
            </div>
          )}
          {slots.length === 0 && <div className="st-hint">Add a plant on the left, or load the three-species demo.</div>}
        </div>

        <div className="st-timeline" aria-label="Timeline">
          <div className="st-tl-controls">
            <button className="btn" onClick={() => { if (year >= horizon) setYear(0); setPlaying(!playing) }} aria-pressed={playing} disabled={!slots.length} data-testid="play">
              {playing ? 'Pause' : 'Play'}
            </button>
            <label className="st-year">
              <span className="sr-only">Year</span>
              <input type="range" min={0} max={horizon} value={year} onChange={(e) => { setPlaying(false); setYear(+e.target.value) }} data-testid="year" aria-valuetext={`year ${year}`} />
            </label>
            <span className="num st-yr">{year}/{horizon} y</span>
            <label className="small">Speed
              <select className="input sm" value={speed} onChange={(e) => setSpeed(+e.target.value)}>
                <option value={0.5}>slow</option><option value={1}>normal</option><option value={2}>fast</option>
              </select>
            </label>
            <label className="small">Horizon
              <select className="input sm" value={horizon} onChange={(e) => setHorizon(+e.target.value)} data-testid="horizon">
                {HORIZONS.map((h) => <option key={h} value={h}>{h} years</option>)}
              </select>
            </label>
            <button className="btn quiet sm" onClick={() => { setYear(0); setPlaying(false) }}>Reset</button>
            {reduced && <span className="tiny dim">reduced motion: playback steps without animation</span>}
          </div>
          <div className="st-chart" data-testid="studio-chart">
            {lines.length ? <SimpleLineChart lines={lines} marker={year} ariaLabel="Relative population of each plant over the years" height={170} />
              : <p className="small dim">No population model to chart yet.</p>}
          </div>
        </div>
      </section>

      <aside className="st-inspector scroll" aria-label="What the models say">
        <p className="label">What the models say at year {year}</p>
        {slots.map((s) => <Inspector key={s.key} slot={s} data={data[s.key]} year={year} horizon={horizon} />)}
        {slots.length === 0 && <p className="small dim">Plant cards appear here: population outlook, life-stage mix, evidence strength and what is missing locally.</p>}
        {compare.length > 0 && <Compare items={saved.filter((x) => compare.includes(x.id))} />}
      </aside>
    </div>
  )
}

// ---------------------------------------------------------------- left rail
function AddPlant({ onAdd }: { onAdd: (name: string, organismType?: string | null) => void }) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState<SpeciesSummary[]>([])
  useEffect(() => {
    if (q.trim().length < 2) { setRes([]); return }
    const t = window.setTimeout(() => api.species(q).then((r) => setRes(r.results.slice(0, 6))).catch(() => setRes([])), 220)
    return () => window.clearTimeout(t)
  }, [q])
  return (
    <div className="st-add">
      <label className="label" htmlFor="st-add-q">Add a plant</label>
      <input id="st-add-q" className="input" placeholder="Search any plant, e.g. Prunus africana" value={q} onChange={(e) => setQ(e.target.value)} data-testid="add-plant" />
      {res.length > 0 && (
        <ul className="st-results">
          {res.map((r) => (
            <li key={r.name}><button onClick={() => { onAdd(r.name, r.organism_type); setQ('') }}>
              <SpeciesPhoto name={r.name} size="xs" /><span><i className="serif">{r.name}</i><small>{r.common_name ?? r.family} · {r.organism_type}</small></span>
            </button></li>
          ))}
        </ul>
      )}
      {q.trim().length >= 3 && (
        <button className="btn sm quiet" onClick={() => { onAdd(q.trim(), null); setQ('') }} data-testid="add-free">Add “{q.trim()}” (not in the medicinal catalogue)</button>
      )}
    </div>
  )
}

function SlotCard({ slot, data, open, onOpen, onChange, onRemove }: {
  slot: Slot; data?: SlotData; open: boolean; onOpen: () => void; onChange: (p: Partial<Slot>) => void; onRemove: () => void
}) {
  const ev = EVIDENCE[data?.kind ?? 'visual-only']
  const [custom, setCustom] = useState(false)
  return (
    <section className={`st-slot ${open ? 'open' : ''}`} style={{ borderLeftColor: slot.colour }} data-testid="slot">
      <header>
        <SpeciesPhoto name={slot.name} size="sm" />
        <button className="st-slot-head" onClick={onOpen} aria-expanded={open}>
          <span><i className="serif">{slot.name}</i>
            <small>{data?.status === 'loading' ? 'loading evidence…' : data?.status === 'error' ? 'could not load' : ev.short}</small></span>
        </button>
        <button className="btn sm quiet" onClick={onRemove} aria-label={`Remove ${slot.name}`}>✕</button>
      </header>
      {open && (
        <div className="st-slot-body">
          {data?.status === 'error' && <p className="error small">{data.error}</p>}
          <label>How it looks <small className="dim">(3D illustration)</small>
            <select className="input sm" value={slot.assetId} onChange={(e) => onChange({ assetId: e.target.value, assetBasis: 'chosen by you' })} data-testid="archetype">
              <optgroup label="Species models (AI-generated)">
                {ASSETS.filter((a) => a.kind === 'species').map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </optgroup>
              <optgroup label="Generic growth forms">
                {ASSETS.filter((a) => a.kind !== 'species').map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </optgroup>
            </select>
          </label>
          <p className="tiny dim">{slot.assetBasis}</p>
          <ModelCredit id={slot.assetId} />
          <div className="st-row">
            <span className="small">Starting plants <small className="dim">(your assumption)</small></span>
            <div className="st-seg" role="group" aria-label="Starting plants">
              {[100, 500, 1000].map((n) => (
                <button key={n} className="btn sm" aria-pressed={!custom && slot.startPop === n} onClick={() => { setCustom(false); onChange({ startPop: n }) }}>{n.toLocaleString()}</button>
              ))}
              <button className="btn sm" aria-pressed={custom} onClick={() => setCustom(true)}>other</button>
            </div>
            {custom && <input className="input sm" type="number" min={1} max={1000000} value={slot.startPop}
              onChange={(e) => onChange({ startPop: Math.max(1, Math.min(1e6, +e.target.value || 1)) })} aria-label="Custom starting plants" data-testid="start-pop" />}
          </div>
          <label className="st-colour">Colour <input type="color" value={slot.colour} onChange={(e) => onChange({ colour: e.target.value })} /></label>

          {data?.studies && data.studies.length > 1 && (
            <label>Study
              <select className="input sm" value={data.study?.id} onChange={(e) => onChange({ studyId: e.target.value, scenarioId: null })}>
                {data.studies.map((s) => <option key={s.id} value={s.id}>{s.citation.split('(')[0].split(',')[0]} ({s.citation.match(/\((\d{4})\)/)?.[1]}) · {s.organ}</option>)}
              </select>
            </label>
          )}
          {data?.options && data.options.length > 1 && (
            <fieldset className="st-scen">
              <legend className="small">Harvest scenario from the study</legend>
              {data.options.map((o) => (
                <label key={o.id}><input type="radio" name={`sc-${slot.key}`} checked={selectedOption(slot, data)?.id === o.id} onChange={() => onChange({ scenarioId: o.id })} />
                  <span>{o.role === 'control' ? 'No harvest · ' : o.role === 'reference' ? 'Reference · ' : ''}{o.label}</span></label>
              ))}
            </fieldset>
          )}
          {data?.kind === 'population-only' && data.presets && data.presets.length > 1 && (
            <label>Published population
              <select className="input sm" value={selectedOption(slot, data)?.id} onChange={(e) => onChange({ scenarioId: e.target.value })}>
                {data.presets.map((p) => <option key={p.matrix_id} value={p.matrix_id}>{p.population} · {p.years}</option>)}
              </select>
            </label>
          )}
          {data?.kind === 'population-only' && <p className="tiny dim">No harvest study exists for this plant, so only the no-harvest projection is shown.</p>}
          {(data?.kind === 'visual-only' || slot.synthetic) && data?.status !== 'loading' && (
            <SyntheticEditor value={slot.synthetic} onChange={(v) => onChange({ synthetic: v, scenarioId: v ? 'synthetic' : null })} />
          )}
        </div>
      )}
    </section>
  )
}

// CC BY models require attribution wherever they are shown.
function ModelCredit({ id }: { id: string }) {
  const l = assetById(id)?.licence
  if (!l) return null
  return (
    <p className="tiny dim" data-testid="model-credit">
      3D model: {l.author ?? 'unknown author'} · {l.licence}
      {l.source_url && <> · <a href={l.source_url} target="_blank" rel="noreferrer noopener">source</a></>}
    </p>
  )
}

function SyntheticEditor({ value, onChange }: { value: SyntheticParams | null; onChange: (v: SyntheticParams | null) => void }) {
  const v = value ?? DEFAULT_SYNTHETIC
  const set = (p: Partial<SyntheticParams>) => onChange({ ...v, ...p })
  return (
    <div className="st-synth" data-testid="synthetic">
      <label className="st-check"><input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked ? DEFAULT_SYNTHETIC : null)} data-testid="synthetic-toggle" />
        Use a synthetic, educational sandbox (my own rates)</label>
      {value && (
        <>
          <p className="tiny warn">SYNTHETIC: these numbers are yours, not published data. The result predicts nothing about a real population.</p>
          {v.stage_names.map((n, i) => (
            <div key={n} className="st-synth-row">
              <span className="small">{n}</span>
              <label className="tiny">survive<input type="number" step={0.05} min={0} max={1} value={v.survival[i]} onChange={(e) => set({ survival: v.survival.map((x, j) => (j === i ? clamp01(+e.target.value) : x)) })} /></label>
              {i < v.stage_names.length - 1 && <label className="tiny">grow up<input type="number" step={0.05} min={0} max={1} value={v.growth[i]} onChange={(e) => set({ growth: v.growth.map((x, j) => (j === i ? clamp01(+e.target.value) : x)) })} /></label>}
            </div>
          ))}
          <label className="tiny">new seedlings per large plant per year
            <input type="number" step={0.1} min={0} max={50} value={v.fecundity} onChange={(e) => set({ fecundity: Math.max(0, Math.min(50, +e.target.value || 0)) })} /></label>
        </>
      )}
    </div>
  )
}
const clamp01 = (x: number) => Math.max(0, Math.min(1, isFinite(x) ? x : 0))

function ScenesPanel({ saved, saveName, setSaveName, canSave, onSave, onOpen, compare, setCompare, msg }: {
  saved: SavedItem[]; saveName: string; setSaveName: (s: string) => void; canSave: boolean; onSave: () => void
  onOpen: (it: SavedItem) => void; compare: string[]; setCompare: (c: string[]) => void; msg: string | null
}) {
  return (
    <section className="st-scenes">
      <p className="label">Saved plots</p>
      <div className="st-save">
        <input className="input sm" placeholder="Name this plot" value={saveName} onChange={(e) => setSaveName(e.target.value)} />
        <button className="btn sm" disabled={!canSave} onClick={onSave} data-testid="save-scene">Save</button>
      </div>
      {msg && <p className="tiny ok" data-testid="scene-msg">{msg}</p>}
      <ul>
        {saved.slice(0, 8).map((it) => (
          <li key={it.id}>
            <label title="Compare (up to 3)"><input type="checkbox" checked={compare.includes(it.id)} disabled={!compare.includes(it.id) && compare.length >= 3}
              onChange={(e) => setCompare(e.target.checked ? [...compare, it.id] : compare.filter((x) => x !== it.id))} aria-label={`Compare ${it.name}`} /></label>
            <button className="linkish" onClick={() => onOpen(it)}>{it.name}</button>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ---------------------------------------------------------------- inspector
function Inspector({ slot, data, year, horizon }: { slot: Slot; data?: SlotData; year: number; horizon: number }) {
  const opt = selectedOption(slot, data)
  const kind = data?.kind ?? 'visual-only'
  const ev = EVIDENCE[kind]
  const now = modelledAt(slot, opt, year)
  const end = modelledAt(slot, opt, horizon)
  const ol = outlook(opt ? end.total / slot.startPop : null, kind)
  const names = (opt && data?.stageNames[opt.id]) || []
  const mix = names.length === now.stages.length ? now.stages : []
  const looks = stageLooks(names, (opt && data?.stageClasses?.[opt.id]) || [])
  const stageMismatch = !!opt && names.length > 0 && names.length !== now.stages.length
  const scale = displayScale(slot.startPop, 1)
  const missing = data?.profile?.eligibility?.tasks?.local_quota?.missing?.length
  const organ = data?.study?.organ
  return (
    <article className="st-card" style={{ borderTopColor: slot.colour }} data-testid="inspector-card"
      data-start={slot.startPop} data-year={year} data-api-total={opt ? opt.trajectory.total[Math.min(year, opt.trajectory.total.length - 1)] : ''}
      data-api-total0={opt ? opt.trajectory.total[0] : ''} data-scale={'k' in now ? now.k : ''} data-total={Math.round(now.total)} data-display-scale={scale} data-stage-counts={now.stages.map((v) => Math.round(v)).join(',')}>
      <header>
        <SpeciesPhoto name={slot.name} size="md" />
        <div>
          <h3 className="serif"><i>{slot.name}</i></h3>
          <span className={`pill ${ev.tone}`} title={ev.explain}>{ev.label}</span>
        </div>
      </header>
      {data?.status === 'loading' ? <p className="small dim">Calculating…</p> : (
        <>
          <div className="st-kpis">
            <div><span className="label">Outlook by year {horizon}</span><span className={`pill ${ol.tone}`} data-testid="outlook">{ol.word}</span></div>
            <div><span className="label">Plants now (modelled)</span><b className="num" data-testid="plants-now">{opt ? Math.round(now.total).toLocaleString() : slot.startPop.toLocaleString()}</b>
              <small className="dim"> of {slot.startPop.toLocaleString()} at start</small></div>
            <div><span className="label">Change since start</span><b className="num">{opt ? `${now.relative >= 100 ? '+' : ''}${Math.round(now.relative - 100)}%` : 'not modelled'}</b></div>
          </div>
          {'empty' in now && now.empty && <p className="small warn" data-testid="no-start-pop">This model has no plants at the start, so it cannot be scaled.</p>}
          {stageMismatch && <p className="tiny warn" data-testid="stage-mismatch">Stage names don't match this model, so only the total is shown.</p>}
          {opt && <Sparkline values={relativeSeries(opt)} year={year} colour={slot.colour} />}
          {mix.length > 0 && (
            <div className="st-mix" aria-label="Life-stage mix">
              <span className="label">Life-stage mix now</span>
              <div className="st-mixbar">
                {mix.map((v, i) => <i key={i} style={{ flexGrow: Math.max(v, 0.0001), opacity: looks[i].drawn ? 0.3 + 0.65 * Math.min(1, looks[i].scale) : 0.15, background: slot.colour }} title={`${names[i]}: ${Math.round(v).toLocaleString()}`} />)}
              </div>
              <div className="st-mixlab tiny dim"><span>{shortStage(names[0])}</span><span>{shortStage(names[names.length - 1])}</span></div>
              <StageKey names={names} looks={looks} counts={mix} colour={slot.colour} />
            </div>
          )}
          <dl className="st-facts">
            {opt && <><dt>Scenario</dt><dd>{opt.role === 'control' ? 'No harvest (study control)' : opt.label}</dd></>}
            <dt>Evidence</dt><dd>{ev.explain}</dd>
            {organ && <><dt>Harvested part</dt><dd>{organ}. <span className="dim">{ORGAN_NOTE[organ] ?? ''} (general note)</span></dd></>}
            <dt>Missing locally</dt><dd>{missing != null ? `${missing} of 6 site measurements (stage counts, yield, recovery, identity, rights, expert threshold)` : 'site measurements not assessed'}</dd>
          </dl>
          {kind === 'synthetic' && <p className="tiny warn">{data?.syntheticLabel}</p>}
          {kind !== 'synthetic' && <StartPassport species={slot.name} organ={organ} />}
          <ExpertDrawer>
            {opt?.lambda != null && <p>Long-term growth rate λ = <b className="num">{opt.lambda.toFixed(3)}</b>: {lambdaWords(opt.lambda)}.</p>}
            {opt?.matrixId && <p>COMPADRE matrix <span className="num">{opt.matrixId}</span>{names.length ? `, ${names.length} stages: ${names.map(shortStage).join(' → ')}` : ''}.</p>}
            {data?.study && <p>{data.study.citation}</p>}
            {data?.study?.caveat && <p className="warn">{data.study.caveat}</p>}
            {data?.n0Basis && <p className="dim">Starting stage mix: {data.n0Basis}.</p>}
            <p className="dim">Plant size in the 3D plot is read from each stage's name in the study: seedlings small, saplings and juveniles medium, adults and flowering plants large. Seeds in the soil and dormant plants are counted but not drawn. A display convention, not measured size or age.</p>
          </ExpertDrawer>
        </>
      )}
    </article>
  )
}

function Sparkline({ values, year, colour }: { values: number[]; year: number; colour: string }) {
  const W = 220, H = 40
  const lo = Math.min(...values, 100), hi = Math.max(...values, 100)
  const x = (i: number) => (i / Math.max(1, values.length - 1)) * W
  const y = (v: number) => H - 3 - ((v - lo) / Math.max(1e-6, hi - lo)) * (H - 6)
  return (
    <svg className="st-spark" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <line x1={0} x2={W} y1={y(100)} y2={y(100)} stroke="var(--text-3)" strokeDasharray="2 3" />
      <polyline points={values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke={colour} strokeWidth={1.8} />
      <circle cx={x(Math.min(year, values.length - 1))} cy={y(values[Math.min(year, values.length - 1)])} r={3} fill="var(--amber)" />
    </svg>
  )
}

function Compare({ items }: { items: SavedItem[] }) {
  return (
    <section className="st-compare" data-testid="compare">
      <p className="label">Comparing saved plots</p>
      {items.map((it) => {
        const b = it.body as { horizon: number; summary: { name: string; colour: string; scenario: string; evidence: string; start: number; end_modelled: number | null; end_relative: number | null }[] }
        return (
          <div key={it.id} className="st-cmp">
            <b className="serif">{it.name}</b> <span className="tiny dim">after {b.horizon} years</span>
            {b.summary?.map((s) => (
              <p key={s.name} className="small"><i className="dot" style={{ background: s.colour }} /><i className="serif">{s.name}</i>: {s.scenario} →{' '}
                <b className="num">{s.end_relative == null ? 'not modelled' : `${s.end_relative} (start 100)`}</b></p>
            ))}
          </div>
        )
      })}
    </section>
  )
}

export { assetById }

const GROUP_WORD = { seed: 'seed in soil · not drawn', dormant: 'dormant · not drawn', seedling: 'seedling', young: 'young', adult: 'adult', stage: 'in between' } as const

/** Size key: how big each life stage is drawn in the plot, with how many plants are in it now (modelled). */
function StageKey({ names, looks, counts, colour }: { names: string[]; looks: ReturnType<typeof stageLooks>; counts: number[]; colour: string }) {
  return (
    <ul className="st-stagekey" aria-label="Plant size by life stage" data-testid="stage-key">
      {names.map((n, i) => (
        <li key={i} className={looks[i].drawn ? `g-${looks[i].group}` : 'off'} title={n}>
          <span className="st-sk-dot" aria-hidden>
            {looks[i].drawn ? <i style={{ width: `${8 + 18 * looks[i].scale}px`, height: `${8 + 18 * looks[i].scale}px`, background: colour }} /> : <i className="ghost" />}
          </span>
          <span className="st-sk-name">{shortStage(n)}<small>{GROUP_WORD[looks[i].group]}</small></span>
          <span className="st-sk-n num">{Math.round(counts[i]).toLocaleString()}</span>
        </li>
      ))}
    </ul>
  )
}
