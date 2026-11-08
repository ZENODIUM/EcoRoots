import { useEffect, useMemo, useRef, useState } from 'react'
import { api, ApiError, type Case, type Cell, type LayerDef, type LayerGroup, type Occurrence, type RegionContext,
  type RegionInput, type SpeciesProfile, type SpeciesSummary } from '../api'
import Globe, { type CameraTarget, type CellPaint, type DrawMode, type GlobePoint } from '../components/Globe'
import { RAMPS, domainOf, gradientCss, sample } from '../ramps'
import { useSelection } from '../store'
import SpeciesDossier from './explore/SpeciesDossier'
import RegionPanel, { type GridLayerId } from './explore/RegionPanel'
import './explore.css'

const DEFAULT_SPECIES_VIEW = 2_600_000

function regionKey(r: RegionInput | null) { return r ? JSON.stringify(r) : '' }

export default function Explore() {
  const { species, region, setSpecies, setRegion, setLastRun, lastRunId } = useSelection()
  const [cases, setCases] = useState<Case[]>([])
  const [groups, setGroups] = useState<LayerGroup[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SpeciesSummary[]>([])
  const [profile, setProfile] = useState<SpeciesProfile | null>(null)
  const [ctx, setCtx] = useState<RegionContext | null>(null)
  const [loadingSince, setLoadingSince] = useState<number | null>(null)
  const [ctxError, setCtxError] = useState<string | null>(null)
  const [gridLayer, setGridLayer] = useState<GridLayerId>('suitability')
  const [showOcc, setShowOcc] = useState(true)
  const [showPops, setShowPops] = useState(true)
  const [showFire, setShowFire] = useState(false)
  const [showRange, setShowRange] = useState(true)
  const [overlayIds, setOverlayIds] = useState<string[]>([])
  const [drawMode, setDrawMode] = useState<DrawMode>('none')
  const [radiusKm, setRadiusKm] = useState(25)
  const [selectedCell, setSelectedCell] = useState<string | null>(null)
  const [camera, setCamera] = useState<CameraTarget | null>(null)
  const [runState, setRunState] = useState<{ busy: boolean; error?: string }>({ busy: false })
  const camKey = useRef(0)

  const fly = (lon: number, lat: number, height: number) => setCamera({ lon, lat, height, key: ++camKey.current })

  useEffect(() => {
    api.cases().then((r) => setCases(r.cases)).catch(() => {})
    api.layers().then((r) => setGroups(r.groups)).catch(() => {})
  }, [])

  // species search (debounced)
  useEffect(() => {
    const t = setTimeout(() => { api.species(query).then((r) => setResults(r.results)).catch(() => setResults([])) }, 160)
    return () => clearTimeout(t)
  }, [query])

  // profile for the selected species
  useEffect(() => {
    setProfile(null)
    if (!species) return
    let live = true
    api.profile(species).then((p) => { if (live) setProfile(p) }).catch(() => {})
    return () => { live = false }
  }, [species])

  // region context (re-queried when species or region changes)
  const rk = regionKey(region)
  useEffect(() => {
    setSelectedCell(null)
    if (!region) { setCtx(null); return }
    let live = true
    setCtxError(null)
    setLoadingSince(Date.now())
    api.context(species, region)
      .then((c) => { if (live) setCtx(c) })
      .catch((e: ApiError) => { if (live) { setCtx(null); setCtxError(e.message) } })
      .finally(() => { if (live) setLoadingSince(null) })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [species, rk])

  // once the region is known, ask the rule engine again with the region's cleaned occurrence count
  // (the client never decides eligibility itself)
  useEffect(() => {
    if (!species || !ctx || !profile) return
    const occ = ctx.layers.occurrences as { status: string; clean_count?: number } | undefined
    const n = occ?.status === 'available' && typeof occ.clean_count === 'number' ? occ.clean_count : null
    let live = true
    api.eligibility(species, n, true).then((e) => { if (live) setProfile((p) => (p && p.name === profile.name ? { ...p, eligibility: e } : p)) }).catch(() => {})
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, profile?.name])

  const openCase = (c: Case) => {
    setSpecies(c.species)
    setRegion(c.region)
    fly(c.camera[0], c.camera[1], c.camera[2])
    setGridLayer('suitability')
  }

  const pickSpecies = (name: string) => {
    setSpecies(name)
    setQuery('')
  }

  // when a species is chosen without a region, frame its study populations
  useEffect(() => {
    if (!profile || region) return
    const locs = profile.compadre_locations ?? []
    if (!locs.length) return
    const lon = locs.reduce((a, l) => a + l.lon, 0) / locs.length
    const lat = locs.reduce((a, l) => a + l.lat, 0) / locs.length
    fly(lon, lat, DEFAULT_SPECIES_VIEW)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile])

  const onDraw = (r: RegionInput) => {
    setDrawMode('none')
    setRegion(r)
    if (r.bbox) {
      const [w, s, e, n] = r.bbox
      const span = Math.max(e - w, n - s)
      fly((w + e) / 2, (s + n) / 2, Math.max(60_000, span * 111_000 * 1.6))
    } else if (r.point) fly(r.point[0], r.point[1], Math.max(50_000, (r.radius_km ?? 25) * 5_000))
  }

  // ---------- derived paint for the globe
  const occurrences: Occurrence[] = useMemo(() => {
    const o = ctx?.layers.occurrences as { records?: Occurrence[] } | undefined
    return o?.records ?? []
  }, [ctx])

  const occPerCell = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of ctx?.grid ?? []) {
      const [w, s, e, n] = c.bounds
      m.set(c.id, occurrences.filter((o) => o.lon >= w && o.lon < e && o.lat >= s && o.lat < n).length)
    }
    return m
  }, [ctx, occurrences])

  const suit = ctx?.suitability
  const suitMap = useMemo(() => {
    const m = new Map<string, { suitability: number | null; extrapolation: boolean }>()
    if (suit && suit.status === 'available' && 'predictions' in suit) for (const p of suit.predictions) m.set(p.id, p)
    return m
  }, [suit])

  const gridDomain = useMemo(() => {
    if (!ctx) return null
    if (gridLayer === 'suitability') return [0, 1] as [number, number]
    if (gridLayer === 'bio1' || gridLayer === 'bio12' || gridLayer === 'elevation_m')
      return domainOf(ctx.grid.map((c) => c[gridLayer] as number | null | undefined))
    if (gridLayer === 'fire_detections') {
      const v = ctx.grid.map((c) => c.fire_detections).filter((x): x is number => typeof x === 'number')
      return v.length ? [0, Math.max(1, ...v)] as [number, number] : null
    }
    return null
  }, [ctx, gridLayer])

  const cells: CellPaint[] = useMemo(() => {
    if (!ctx) return []
    return ctx.grid.map((c: Cell) => {
      const base = { id: c.id, bounds: c.bounds, hatch: false, dim: (c.in_region_fraction ?? 1) < 0.5 }
      if (gridLayer === 'none') return { ...base, rgb: null, dim: true }
      if (gridLayer === 'gaps') {
        const n = occPerCell.get(c.id) ?? 0
        return { ...base, rgb: n > 0 ? [96, 143, 115] as [number, number, number] : [183, 133, 95] as [number, number, number] }
      }
      if (gridLayer === 'suitability' || gridLayer === 'extrapolation') {
        const p = suitMap.get(c.id)
        if (!p || p.suitability === null) return { ...base, rgb: null }
        if (gridLayer === 'extrapolation') return { ...base, rgb: p.extrapolation ? [163, 155, 199] as [number, number, number] : null }
        return { ...base, rgb: sample(RAMPS.suitability.stops, p.suitability), hatch: p.extrapolation }
      }
      const v = c[gridLayer]
      if (typeof v !== 'number' || !gridDomain) return { ...base, rgb: null }
      // fire counts: sqrt scale so a few hot cells do not flatten the rest; 0 detections is a real (dark) value
      if (gridLayer === 'fire_detections') return { ...base, rgb: sample(RAMPS.fire_detections.stops, Math.sqrt(v / gridDomain[1])) }
      return { ...base, rgb: sample(RAMPS[gridLayer].stops, (v - gridDomain[0]) / (gridDomain[1] - gridDomain[0])) }
    })
  }, [ctx, gridLayer, suitMap, occPerCell, gridDomain])

  const points: GlobePoint[] = useMemo(() => {
    const pts: GlobePoint[] = []
    if (showOcc) for (const o of occurrences) pts.push({ id: `occ-${o.id}`, lon: o.lon, lat: o.lat, kind: 'occurrence' })
    if (showPops) (profile?.compadre_locations ?? []).forEach((l, i) => pts.push({ id: `pop-${i}`, lon: l.lon, lat: l.lat, kind: 'population' }))
    const fire = ctx?.layers.fire as { status: string; detections?: { lat: number; lon: number }[] } | undefined
    if (showFire && fire?.status === 'available') fire.detections!.forEach((f, i) => pts.push({ id: `fire-${i}`, lon: f.lon, lat: f.lat, kind: 'fire' }))
    return pts
  }, [occurrences, profile, showOcc, showPops, showFire, ctx])

  const nativeRange = useMemo(() => {
    const w = profile?.checklists?.wcvp
    return w?.native_l3 ? { native: w.native_l3, introduced: w.introduced_l3 ?? [] } : null
  }, [profile])
  const range = species && showRange ? nativeRange : null
  const overlays: LayerDef[] = useMemo(
    () => groups.flatMap((g) => g.layers).filter((l) => (l.kind === 'wms' || l.kind === 'xyz') && overlayIds.includes(l.id)),
    [groups, overlayIds],
  )

  const regionBounds = ctx?.region.bounds ?? (region?.bbox ?? null)
  const regionCircle = region?.point ? { center: region.point, radiusKm: region.radius_km ?? 25 } : null

  const startRun = async () => {
    setRunState({ busy: true })
    try {
      const r = await api.startRun({ species, region, goal: 'assess' })
      setLastRun(r.run_id)
      setRunState({ busy: false })
    } catch (e) {
      setRunState({ busy: false, error: (e as Error).message })
    }
  }

  const clearAll = () => { setSpecies(null); setRegion(null); setCtx(null); setCtxError(null); fly(45, 18, 1.6e7) }

  return (
    <div className="explore">
      <aside className="rail left scroll" aria-label="Species and cases">
        <div className="rail-sec">
          <label className="label" htmlFor="species-q">Species · 200 medicinal taxa in COMPADRE</label>
          <input id="species-q" className="input" placeholder="Search Latin name, common name or family" value={query}
            onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
          {query && (
            <ul className="results" data-testid="species-results">
              {results.length === 0 && <li className="empty">No medicinal COMPADRE taxon matches “{query}”.
                <button className="btn sm quiet" onClick={() => pickSpecies(query.trim())}>Use as free name (tier C)</button></li>}
              {results.map((r) => (
                <li key={r.name}>
                  <button onClick={() => pickSpecies(r.name)}>
                    <span className={`tier tier-${r.tier}`}>{r.tier}</span>
                    <span className="nm"><i className="serif">{r.name}</i><small>{r.family} · {r.n_matrices} matrices</small></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {species ? (
          <SpeciesDossier name={species} profile={profile} ctx={ctx} onClear={clearAll} />
        ) : (<>
          <div className="rail-sec">
            <p className="label">What do you want to do?</p>
            <div className="entry-cards" data-testid="entry-cards">
              <button className="entry" onClick={() => document.querySelector<HTMLInputElement>('.rail.left input')?.focus()}>
                <b>Explore a medicinal plant</b><span>Search a species or open a case below: evidence, habitat, trade listing.</span></button>
              <a className="entry" href="#/simulate"><b>Run a harvesting scenario</b><span>3D studio: watch a plot change under published harvest treatments.</span></a>
              <a className="entry" href="#/plan/ops?new=1"><b>Start a Harvest Passport</b><span>Prefilled evidence, tasks, documents and stock for one collection.</span></a>
              <a className="entry" href="#/plan/ops"><b>Review a batch</b><span>Work queue, lots on hold, document checks and lab results.</span></a>
            </div>
          </div>
          <div className="rail-sec">
            <p className="label">Case library · verified study sites</p>
            <ol className="cases" data-testid="cases">
              {cases.map((c, i) => (
                <li key={c.id}>
                  <button onClick={() => openCase(c)} data-testid={`case-${c.id}`}>
                    <span className="case-n mono">{String(i + 1).padStart(2, '0')}</span>
                    <span className="case-body">
                      <span className="case-h"><span className={`tier tier-${c.tier}`}>{c.tier}</span><i className="serif">{c.species}</i></span>
                      <span className="case-t">{c.title}</span>
                      <span className="case-k">{c.known}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
            <div className="tier-key">
              <p><span className="tier tier-A">A</span> audited harvest-treatment matrices</p>
              <p><span className="tier tier-B">B</span> published demographic model; no medicinal harvest study (an analogue may be shown)</p>
              <p><span className="tier tier-C">C</span> insufficient for population modelling</p>
            </div>
          </div>
        </>)}
      </aside>

      <section className="globe-wrap">
        <Globe cells={cells} points={points} regionBounds={regionBounds} regionCircle={regionCircle} overlays={overlays}
          drawMode={drawMode} radiusKm={radiusKm} selectedCell={selectedCell} camera={camera} range={range}
          onDraw={onDraw} onPickCell={setSelectedCell} onPickPoint={() => {}} />

        <div className="toolbar" role="toolbar" aria-label="Region tools">
          <button className="btn" aria-pressed={drawMode === 'bbox'} onClick={() => setDrawMode(drawMode === 'bbox' ? 'none' : 'bbox')}>
            <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden><rect x="1.5" y="1.5" width="10" height="10" fill="none" stroke="currentColor" strokeDasharray="2 1.5" /></svg>
            Draw box
          </button>
          <button className="btn" aria-pressed={drawMode === 'point'} onClick={() => setDrawMode(drawMode === 'point' ? 'none' : 'point')}>
            <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden><circle cx="6.5" cy="6.5" r="5" fill="none" stroke="currentColor" /><circle cx="6.5" cy="6.5" r="1.4" fill="currentColor" /></svg>
            Point + radius
          </button>
          {drawMode === 'point' && (
            <label className="radius mono">
              <input type="range" min={5} max={150} step={5} value={radiusKm} onChange={(e) => setRadiusKm(+e.target.value)} aria-label="Radius in km" />
              {radiusKm} km
            </label>
          )}
          {nativeRange && (
            <button className="btn" aria-pressed={showRange} onClick={() => setShowRange(!showRange)} data-testid="range-toggle"
              title="Native (green) and introduced (amber) range from the World Checklist of Vascular Plants (Kew, data behind POWO), by TDWG botanical country">
              <i className="range-sw" aria-hidden /> Native range{nativeRange.introduced.length ? ' · introduced' : ''}
            </button>
          )}
          {drawMode !== 'none' && (
            <span className="hint">{drawMode === 'bbox' ? 'Click two opposite corners · right-click cancels' : 'Click the globe to centre the circle'}</span>
          )}
        </div>

        {ctx && <Legend layer={gridLayer} domain={gridDomain} suitStatus={suit?.status} />}
      </section>

      <aside className="rail right scroll" aria-label="Region analysis">
        <RegionPanel ctx={ctx} region={region} groups={groups} loadingSince={loadingSince} error={ctxError} species={species}
          gridLayer={gridLayer} setGridLayer={setGridLayer} showOcc={showOcc} setShowOcc={setShowOcc}
          showPops={showPops} setShowPops={setShowPops} showFire={showFire} setShowFire={setShowFire} showRange={showRange} setShowRange={setShowRange} hasPops={Boolean(profile?.compadre_locations?.length)}
          overlayIds={overlayIds} setOverlayIds={setOverlayIds} selectedCell={selectedCell} occPerCell={occPerCell}
          suitMap={suitMap} runState={runState} lastRunId={lastRunId} onRun={startRun} />
      </aside>
    </div>
  )
}

function Legend({ layer, domain, suitStatus }: { layer: GridLayerId; domain: [number, number] | null; suitStatus?: string }) {
  if (layer === 'none') return null
  if (layer === 'gaps') return (
    <div className="legend" data-testid="legend">
      <p className="label">Survey gaps</p>
      <p className="sw"><i style={{ background: '#608F73' }} /> cell has ≥1 cleaned GBIF record</p>
      <p className="sw"><i style={{ background: '#B7855F' }} /> no record (gap, not absence)</p>
    </div>
  )
  if (layer === 'extrapolation') return (
    <div className="legend" data-testid="legend">
      <p className="label">Model extrapolation</p>
      <p className="sw"><i style={{ background: '#A39BC7' }} /> climate outside the training envelope</p>
    </div>
  )
  const ramp = RAMPS[layer]
  const unavailable = layer === 'suitability' && suitStatus !== 'available'
  return (
    <div className="legend" data-testid="legend">
      <p className="label">{ramp.label}</p>
      {unavailable ? (
        <p className="withheld">Not drawn: {suitStatus ?? 'no species selected'}. Empty cells are not zero suitability.</p>
      ) : (
        <>
          <div className="ramp" style={{ background: gradientCss(ramp.stops) }} />
          <div className="ramp-ax num"><span>{domain ? fmt(domain[0]) : '—'}</span><span>{ramp.unit}</span><span>{domain ? fmt(domain[1]) : '—'}</span></div>
          {layer === 'suitability' && <p className="sw"><i className="hatch" /> extrapolated (outside training climate)</p>}
        </>
      )}
      <p className="sw"><i className="nodata" /> no data (not zero)</p>
      <p className="sw"><i className="pt" style={{ background: '#77B5BD' }} /> GBIF occurrence (cleaned)</p>
      <p className="sw"><i className="pt" style={{ background: '#B7855F', outline: '1.5px solid #ECF0E7' }} /> COMPADRE study population</p>
      <p className="sw"><i className="pt" style={{ background: '#E8874E', width: 6, height: 6 }} /> VIIRS fire detection (when shown)</p>
    </div>
  )
}

const fmt = (x: number) => (Number.isInteger(x) || Math.abs(x) >= 100 ? Math.round(x).toLocaleString() : x.toFixed(Math.abs(x) < 1 ? 2 : 1))
