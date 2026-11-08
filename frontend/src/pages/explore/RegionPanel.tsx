import { useEffect, useState } from 'react'
import type { Layer, LayerGroup, RegionContext, RegionInput } from '../../api'

export type GridLayerId = 'suitability' | 'bio1' | 'bio12' | 'elevation_m' | 'fire_detections' | 'gaps' | 'extrapolation' | 'none'

type Props = {
  ctx: RegionContext | null; region: RegionInput | null; groups: LayerGroup[]; loadingSince: number | null
  error: string | null; species: string | null
  gridLayer: GridLayerId; setGridLayer: (g: GridLayerId) => void
  showOcc: boolean; setShowOcc: (b: boolean) => void; showPops: boolean; setShowPops: (b: boolean) => void; hasPops: boolean
  showFire: boolean; setShowFire: (b: boolean) => void
  showRange: boolean; setShowRange: (b: boolean) => void
  overlayIds: string[]; setOverlayIds: (ids: string[]) => void
  selectedCell: string | null; occPerCell: Map<string, number>
  suitMap: Map<string, { suitability: number | null; extrapolation: boolean }>
  runState: { busy: boolean; error?: string }; lastRunId: string | null; onRun: () => void
}

const GRID_IDS = new Set(['suitability', 'bio1', 'bio12', 'elevation', 'gaps', 'extrapolation'])
const gridIdOf = (id: string): GridLayerId => (id === 'elevation' ? 'elevation_m' : id) as GridLayerId

/** Status shown for each layer, taken from the backend context, never inferred client-side. */
function layerStatus(id: string, ctx: RegionContext | null, hasPops: boolean, species: string | null): { status: string; reason?: string } {
  if (!ctx) return { status: 'unknown', reason: 'select a region' }
  const L = ctx.layers
  const s = (k: string) => ({ status: (L[k] as Layer)?.status ?? 'unknown', reason: (L[k] as Layer)?.reason })
  switch (id) {
    case 'occurrences': case 'gaps': return species ? s('occurrences') : { status: 'unknown', reason: 'choose a species' }
    case 'compadre_pops': return hasPops ? { status: 'available' } : { status: 'unknown', reason: 'no study population for this species' }
    case 'suitability': case 'extrapolation': {
      const su = ctx.suitability as { status: string; reason?: string } | undefined
      return su ? { status: su.status, reason: su.reason } : { status: 'unknown', reason: 'choose a species' }
    }
    case 'worldcover': return s('land_cover')
    case 'treeloss': return s('tree_cover_loss')
    case 'bio1': case 'bio12': return s('climate_normals')
    case 'elevation': return s('elevation')
    case 'soil': return { ...s('soil'), reason: L.soil?.status === 'available' ? 'point sample at region centre (readout below), not mapped per cell' : (L.soil as Layer)?.reason }
    case 'wdpa': return s('protected_areas')
    case 'fire': return s('fire')
    case 'native_range': return species ? s('native_range') : { status: 'unknown', reason: 'choose a species' }
    default: return { status: 'unknown' }
  }
}

const chipClass = (s: string) => (s.startsWith('withheld') ? 'st-withheld' : s === 'no species' ? 'st-unknown' : `st-${s}`)
const chipText = (s: string) => (s.startsWith('withheld') ? 'withheld' : s)

export default function RegionPanel(p: Props) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!p.loadingSince) return
    const t = setInterval(() => setElapsed(Math.round((Date.now() - p.loadingSince!) / 1000)), 500)
    return () => { clearInterval(t); setElapsed(0) }
  }, [p.loadingSince])

  const ctx = p.ctx
  const toggleOverlay = (id: string) => p.setOverlayIds(p.overlayIds.includes(id) ? p.overlayIds.filter((x) => x !== id) : [...p.overlayIds, id])

  return (
    <div className="region" data-testid="region-panel">
      <div className="rail-sec">
        <p className="label">Region</p>
        {!p.region && !p.loadingSince && (
          <p className="empty-region">Open a case, or use <b>Draw box</b> / <b>Point + radius</b> on the globe. Any land region up to 2.5 million km² is analysed live.</p>
        )}
        {p.loadingSince && (
          <div className="loading" data-testid="ctx-loading" role="status">
            <p className="num">Querying providers · {elapsed}s</p>
            <p className="small dim">WorldClim 2.1 (local) · GBIF · Open-Meteo DEM · NASA POWER · SoilGrids · Species+. First requests take 10–40 s; repeats come from the cache.</p>
          </div>
        )}
        {p.error && <p className="error" role="alert" data-testid="ctx-error">{p.error}</p>}
        {ctx && !p.loadingSince && (
          <>
            <dl className="facts num" data-testid="region-facts">
              <div><dt>area</dt><dd>{Math.round(ctx.region.area_km2).toLocaleString()} km²</dd></div>
              <div><dt>cells</dt><dd>{ctx.grid.length}</dd></div>
              <div><dt>cell size</dt><dd>{(ctx.grid_resolution_deg * 60).toFixed(0)}′</dd></div>
              <div><dt>centre</dt><dd>{ctx.region.centroid[1].toFixed(2)}, {ctx.region.centroid[0].toFixed(2)}</dd></div>
            </dl>
            {ctx.region.issues.map((i) => <p key={i} className="note">{i}</p>)}
          </>
        )}
        <div className="run-row">
          <button className="btn primary" disabled={(!p.species && !p.region) || p.runState.busy} onClick={p.onRun} data-testid="run-btn">
            {p.runState.busy ? 'Starting…' : 'Run full assessment'}
          </button>
          {p.lastRunId && <a href={`#/evidence?run=${p.lastRunId}`} className="small" data-testid="run-link">Watch {p.lastRunId.slice(-6)} live →</a>}
        </div>
        {p.runState.error && <p className="error">{p.runState.error}</p>}
      </div>

      <div className="rail-sec">
        <p className="label">Layers · status reported by each source</p>
        {!ctx && <p className="small dim">Each layer reports available, display-only, withheld, pending or unsupported once a region is analysed.</p>}
        {p.groups.map((g) => (
          <fieldset key={g.id} className="lgroup">
            <legend>{g.label}</legend>
            {g.layers.map((l) => {
              const st = layerStatus(l.id, ctx, p.hasPops, p.species)
              const isGrid = GRID_IDS.has(l.id)
              const usable = st.status === 'available' || st.status === 'display-only'
              let control = null
              if (isGrid) control = <input type="radio" name="grid" checked={p.gridLayer === gridIdOf(l.id)} disabled={!ctx} onChange={() => p.setGridLayer(gridIdOf(l.id))} />
              else if (l.id === 'occurrences') control = <input type="checkbox" checked={p.showOcc} onChange={(e) => p.setShowOcc(e.target.checked)} />
              else if (l.id === 'compadre_pops') control = <input type="checkbox" checked={p.showPops} onChange={(e) => p.setShowPops(e.target.checked)} />
              else if (l.id === 'native_range') control = <input type="checkbox" checked={p.showRange} disabled={!p.species} onChange={(e) => p.setShowRange(e.target.checked)} aria-label="Show native range" />
              else if (l.id === 'fire') control = <input type="checkbox" checked={p.showFire} disabled={!usable} onChange={(e) => p.setShowFire(e.target.checked)} aria-label="Show fire detections" />
              else if (l.kind === 'wms' || l.kind === 'xyz') control = <input type="checkbox" checked={p.overlayIds.includes(l.id)} onChange={() => toggleOverlay(l.id)} />
              else control = <input type="checkbox" disabled aria-label="not available" />
              return (
                <label key={l.id} className={`lrow ${usable ? '' : 'off'}`} data-layer={l.id}>
                  {control}
                  <span className="lname">{l.label}</span>
                  {ctx ? <span className={`chip ${chipClass(st.status)}`}>{chipText(st.status)}</span> : <span />}
                  {ctx && st.reason && !usable && <span className="lreason">{st.reason}</span>}
                  {st.reason && l.id === 'soil' && usable && <span className="lreason">{st.reason}</span>}
                  {l.id === 'fire' && usable && ctx && (
                    <span className="lreason">
                      <button type="button" className="linkish" aria-pressed={p.gridLayer === 'fire_detections'} onClick={() => p.setGridLayer(p.gridLayer === 'fire_detections' ? 'suitability' : 'fire_detections')}>
                        {p.gridLayer === 'fire_detections' ? 'showing count per cell' : 'colour cells by detection count'}
                      </button>
                    </span>
                  )}
                </label>
              )
            })}
          </fieldset>
        ))}
        <label className="lrow">
          <input type="radio" name="grid" checked={p.gridLayer === 'none'} onChange={() => p.setGridLayer('none')} />
          <span className="lname">No grid colouring</span>
        </label>
      </div>

      {ctx && p.selectedCell && <CellInspector ctx={ctx} id={p.selectedCell} occ={p.occPerCell.get(p.selectedCell) ?? 0} suit={p.suitMap.get(p.selectedCell)} />}
      {ctx && !p.loadingSince && <Readouts ctx={ctx} species={p.species} />}
      <p className="disclaimer">Suitability is relative climatic similarity to known records. It is not abundance, stock or a harvestable area, and no layer on this page estimates how much can be harvested.</p>
    </div>
  )
}

function CellInspector({ ctx, id, occ, suit }: { ctx: RegionContext; id: string; occ: number; suit?: { suitability: number | null; extrapolation: boolean } }) {
  const c = ctx.grid.find((g) => g.id === id)
  if (!c) return null
  const row = (k: string, v: string) => <div><dt>{k}</dt><dd>{v}</dd></div>
  const n = (x: number | null | undefined, d = 1, u = '') => (typeof x === 'number' ? `${x.toFixed(d)}${u}` : 'no data')
  return (
    <div className="rail-sec inspector" data-testid="cell-inspector">
      <p className="label">Cell {id} · {c.bounds.map((b) => b.toFixed(2)).join(', ')}</p>
      <dl className="kv num">
        {row('suitability', suit ? (suit.suitability === null ? 'no data' : `${suit.suitability.toFixed(2)}${suit.extrapolation ? ' · extrapolated' : ''}`) : 'not modelled')}
        {row('mean temp', n(c.bio1, 1, ' °C'))}
        {row('precipitation', n(c.bio12, 0, ' mm'))}
        {row('precip. seasonality', n(c.bio15, 0, ' CV'))}
        {row('elevation (centre)', n(c.elevation_m, 0, ' m'))}
        {row('GBIF records', String(occ))}
        {row('fire detections (5 d)', typeof c.fire_detections === 'number' ? String(c.fire_detections) : 'no data')}
        {row('inside region', `${Math.round((c.in_region_fraction ?? 1) * 100)}%`)}
      </dl>
    </div>
  )
}

type Clim = { status: string; source?: { name: string; citation?: string; url?: string }; variables?: Record<string, { label: string; unit: string; status: string; mean: number; p10: number; p90: number }> }
type Monthly = { status: string; monthly?: Record<string, number[]>; source?: { name: string } }
type Occ = { status: string; total_in_gbif?: number; fetched?: number; clean_count?: number; excluded?: Record<string, number>; reason?: string }
type Soil = { status: string; data?: { properties: { layers: { name: string; unit_measure: { d_factor: number; target_units: string }; depths: { label: string; values: { mean: number | null } }[] }[] } } }

function Readouts({ ctx, species }: { ctx: RegionContext; species: string | null }) {
  const clim = ctx.layers.climate_normals as Clim
  const mon = ctx.layers.monthly_climatology as Monthly
  const occ = ctx.layers.occurrences as Occ | undefined
  const soil = ctx.layers.soil as Soil
  const fire = ctx.layers.fire as { status: string; count?: number; days?: number; truncated?: boolean; caveat?: string; reason?: string; sources_queried?: string[] }
  const nr = ctx?.layers.native_range as { status: string; verdict?: string; note?: string; regions?: { code: string; name: string; listed: string }[] } | undefined
  const elev = ctx.layers.elevation as { status: string; summary?: { min: number; max: number; mean: number } }
  return (
    <>
      {clim?.status === 'available' && clim.variables && (
        <div className="rail-sec" data-testid="climate-readout">
          <p className="label">Climate normals 1970–2000 · p10–p90 across cells</p>
          <table className="clim num">
            <tbody>
              {Object.entries(clim.variables).map(([k, v]) => (
                <tr key={k}><th>{v.label}</th><td>{fmt(v.mean)}</td><td className="dim">{fmt(v.p10)}–{fmt(v.p90)} {v.unit}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="src">{clim.source?.citation}</p>
        </div>
      )}
      {clim?.status === 'unsupported' && <div className="rail-sec"><p className="label">Climate</p><p className="note">Unsupported here: {(clim as Layer).reason}</p></div>}
      {mon?.status === 'available' && mon.monthly && <MonthlyChart m={mon.monthly} src={mon.source?.name} />}
      {elev?.status === 'available' && elev.summary && (
        <div className="rail-sec"><p className="label">Terrain</p>
          <p className="num small">{Math.round(elev.summary.min).toLocaleString()}–{Math.round(elev.summary.max).toLocaleString()} m · mean {Math.round(elev.summary.mean).toLocaleString()} m (cell centres)</p></div>
      )}
      {soil?.status === 'available' && soil.data && (
        <div className="rail-sec"><p className="label">Topsoil at region centre · SoilGrids 2.0</p>
          <dl className="kv num">
            {soil.data.properties.layers.map((l) => {
              const d = l.depths[0]
              const v = d?.values.mean
              return <div key={l.name}><dt>{l.name} {d?.label}</dt><dd>{v === null || v === undefined ? 'no data' : `${(v / l.unit_measure.d_factor).toFixed(1)} ${l.unit_measure.target_units}`}</dd></div>
            })}
          </dl>
        </div>
      )}
      {fire && (
        <div className="rail-sec" data-testid="fire-readout"><p className="label">Active fire · NASA FIRMS VIIRS</p>
          {fire.status === 'available' ? (
            <>
              <p className="num small"><b>{fire.count?.toLocaleString()}</b> detections in the last {fire.days} days{fire.truncated ? ' (first 2,000 drawn; cell counts use all)' : ''}</p>
              <p className="small dim">{fire.caveat}</p>
              <p className="src">{fire.sources_queried?.join(' · ')}</p>
            </>
          ) : <p className="note">{fire.status}: {fire.reason}</p>}
        </div>
      )}
      {species && nr?.status === 'available' && (
        <div className="rail-sec" data-testid="range-readout"><p className="label">Native range · WCVP (Kew, data behind POWO)</p>
          <p className="small">This region is <b>{nr.verdict === 'native' ? 'inside the native range' : nr.verdict === 'introduced' ? 'in the introduced range only' : nr.verdict}</b> for this species
            {nr.regions?.length ? <> ({nr.regions.map((r) => `${r.name}: ${r.listed}`).join('; ')})</> : null}.</p>
          <p className="small dim">{nr.note}</p>
        </div>
      )}
      {species && occ && (
        <div className="rail-sec" data-testid="occ-readout"><p className="label">Occurrence records · GBIF</p>
          {occ.status === 'available' ? (
            <>
              <p className="num small"><b>{occ.clean_count}</b> kept of {occ.fetched} fetched ({occ.total_in_gbif} in GBIF for this region)</p>
              <ul className="excl num">
                {Object.entries(occ.excluded ?? {}).filter(([, n]) => n > 0).map(([k, n]) => <li key={k}><span>{k.replace(/_/g, ' ')}</span><span>−{n}</span></li>)}
              </ul>
              {occ.clean_count === 0 && <p className="note">No cleaned records here. This is a survey gap, not evidence of absence.</p>}
            </>
          ) : <p className="note">{occ.status}: {occ.reason}</p>}
        </div>
      )}
    </>
  )
}

function MonthlyChart({ m, src }: { m: Record<string, number[]>; src?: string }) {
  const t = m.T2M ?? [], pr = m.PRECTOTCORR ?? []
  const W = 280, H = 84, pad = 4
  const tMin = Math.min(...t), tMax = Math.max(...t), pMax = Math.max(...pr, 0.1)
  const x = (i: number) => pad + (i + 0.5) * ((W - pad * 2) / 12)
  const yT = (v: number) => H - 14 - ((v - tMin) / Math.max(tMax - tMin, 1)) * (H - 28)
  return (
    <div className="rail-sec"><p className="label">Monthly climatology · bars precipitation, line temperature</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="monthly" role="img" aria-label="Monthly temperature and precipitation">
        {pr.map((v, i) => { const h = (v / pMax) * (H - 28); return <rect key={i} x={x(i) - 8} y={H - 14 - h} width={16} height={h} fill="#437F95" opacity={0.7} /> })}
        <polyline points={t.map((v, i) => `${x(i)},${yT(v)}`).join(' ')} fill="none" stroke="#B7855F" strokeWidth={1.6} />
        {t.map((v, i) => <circle key={i} cx={x(i)} cy={yT(v)} r={1.8} fill="#B7855F" />)}
        {'JFMAMJJASOND'.split('').map((c, i) => <text key={i} x={x(i)} y={H - 2} textAnchor="middle">{c}</text>)}
      </svg>
      <p className="num small dim">{tMin.toFixed(1)}–{tMax.toFixed(1)} °C · precip. peak {pMax.toFixed(1)} mm/day</p>
      <p className="src">{src}</p>
    </div>
  )
}

const fmt = (x: number) => (Math.abs(x) >= 100 ? Math.round(x).toLocaleString() : x.toFixed(1))
