import { api, type SpeciesProfile, type Trajectory } from '../../../api'
import type { EvidenceKind } from '../../../lang'

// One plant species placed on the plot. Each runs its own model; there is no interaction between species.
export type Slot = {
  key: string
  name: string
  colour: string
  assetId: string
  assetBasis: string
  startPop: number
  scenarioId: string | null // series matrix id (study), preset matrix id (population-only), 'synthetic', or null
  studyId: string | null
  synthetic: SyntheticParams | null
}

export type SyntheticParams = { stage_names: string[]; survival: number[]; growth: number[]; fecundity: number }
export const DEFAULT_SYNTHETIC: SyntheticParams = {
  stage_names: ['small', 'medium', 'large'], survival: [0.5, 0.8, 0.9], growth: [0.3, 0.2], fecundity: 1.2,
}

export type ScenarioOption = {
  id: string; label: string; role: 'control' | 'treatment' | 'reference' | 'baseline' | 'synthetic'
  matrixId: number | null; lambda: number | null; trajectory: Trajectory
}

export type SlotData = {
  status: 'loading' | 'ready' | 'error'
  error?: string
  profile?: SpeciesProfile
  kind: EvidenceKind
  study?: { id: string; citation: string; organ: string; design: string; caveat?: string }
  studies?: { id: string; design: string; organ: string; citation: string }[]
  options: ScenarioOption[]
  control?: ScenarioOption
  presets?: { matrix_id: number; population: string; treatment: string; years: string }[]
  stageNames: Record<string, string[]>
  stageClasses?: Record<string, string[]>  // COMPADRE organ class per stage: prop (seeds), active, dorm (dormant)
  syntheticLabel?: string
  n0Basis?: string
}

const stageCache = new Map<number, Promise<{ stages: string[]; classes: string[] }>>()
function stageInfo(mid: number) {
  if (!stageCache.has(mid)) stageCache.set(mid, api.matrix(mid).then((m) => ({ stages: m.stages, classes: m.stage_classes ?? [] })).catch(() => ({ stages: [], classes: [] })))
  return stageCache.get(mid)!
}
export const stageNames = (mid: number) => stageInfo(mid).then((i) => i.stages)
export const stageClasses = (mid: number) => stageInfo(mid).then((i) => i.classes)

/** Fetch the evidence and the projected trajectories for one slot from the existing science API. */
export async function loadSlot(slot: Slot, horizon: number): Promise<SlotData> {
  const profile = await api.profile(slot.name)
  const studies = profile.harvest_studies ?? []
  const base: SlotData = { status: 'ready', profile, kind: 'visual-only', options: [], stageNames: {}, studies }

  if (slot.synthetic) {
    const r = await api.simulateSynthetic({ ...slot.synthetic, horizon })
    const opt: ScenarioOption = { id: 'synthetic', label: 'Synthetic rates (yours)', role: 'synthetic', matrixId: null, lambda: r.lambda, trajectory: r.trajectory }
    return { ...base, kind: 'synthetic', options: [opt], stageNames: { synthetic: r.stages }, syntheticLabel: r.label, n0Basis: r.n0_basis }
  }

  if (studies.length) {
    const pick = studies.find((s) => s.id === slot.studyId) ?? studies.find((s) => s.design === 'experimental') ?? studies[0]
    const r = await api.simulate({ mode: 'study', study_id: pick.id, horizon })
    const options: ScenarioOption[] = (r.series ?? []).map((s) => ({
      id: String(s.matrix_id), label: s.label, role: s.role, matrixId: s.matrix_id, lambda: s.lambda, trajectory: s.trajectory,
    }))
    const names: Record<string, string[]> = {}
    const classes: Record<string, string[]> = {}
    await Promise.all(options.map(async (o) => { names[o.id] = await stageNames(o.matrixId!); classes[o.id] = await stageClasses(o.matrixId!) }))
    return {
      ...base, kind: pick.design === 'experimental' ? 'experiment' : 'observational', options, stageNames: names, stageClasses: classes,
      control: options.find((o) => o.role === 'control'),
      study: { id: pick.id, citation: pick.citation, organ: pick.organ, design: pick.design, caveat: r.design_caveat },
      n0Basis: r.n0_basis,
    }
  }

  const presets = profile.preset_matrices ?? []
  if (presets.length) {
    const mid = Number(slot.scenarioId) && presets.some((p) => p.matrix_id === Number(slot.scenarioId)) ? Number(slot.scenarioId) : presets[0].matrix_id
    const r = await api.simulate({ mode: 'projection', matrix_id: mid, horizon })
    const p = presets.find((x) => x.matrix_id === mid)!
    const opt: ScenarioOption = {
      id: String(mid), label: `No harvest · ${p.population} (${p.years})`, role: 'baseline', matrixId: mid,
      lambda: r.matrix?.lambda ?? null, trajectory: r.trajectory!,
    }
    return { ...base, kind: 'population-only', options: [opt], presets, stageNames: { [opt.id]: r.matrix?.stages ?? await stageNames(mid) }, stageClasses: { [opt.id]: await stageClasses(mid) }, n0Basis: r.n0_basis }
  }
  return base
}

export function selectedOption(slot: Slot, d: SlotData | undefined): ScenarioOption | undefined {
  if (!d?.options.length) return undefined
  return d.options.find((o) => o.id === slot.scenarioId) ?? d.options.find((o) => o.role === 'control' || o.role === 'baseline') ?? d.options[0]
}

/** Modelled plants at year t, scaled from the user's starting count. Same numbers feed meshes, inspector and chart. */
export function modelledAt(slot: Slot, opt: ScenarioOption | undefined, year: number) {
  if (!opt) return { total: slot.startPop, stages: [slot.startPop], relative: 100, static: true }
  const tr = opt.trajectory
  const t = Math.min(year, tr.total.length - 1)
  const t0 = tr.total[0]
  if (!(t0 > 0) || t < 0) return { total: 0, stages: tr.stages[0]?.map(() => 0) ?? [0], relative: 0, static: true, empty: true }
  const k = slot.startPop / t0
  const total = Math.max(0, tr.total[t] * k)
  return { total, stages: tr.stages[t].map((v) => Math.max(0, v * k)), relative: (tr.total[t] / t0) * 100, static: false, k }
}

export function relativeSeries(opt: ScenarioOption | undefined) {
  if (!opt) return []
  const t0 = opt.trajectory.total[0]
  if (!(t0 > 0)) return []  // no population at the start: nothing meaningful to plot
  return opt.trajectory.total.map((v) => Math.min(1000, Math.max(0, (v / t0) * 100)))
}

// ---------------------------------------------------------------- display mapping
/** Plants per drawn model. More starting plants draw more models (growing with the square root), so the field grows
 * with the population while three heavy species stay interactive. */
export function displayScale(startPop: number, nSlots: number) {
  const share = nSlots <= 1 ? 1 : nSlots === 2 ? 0.8 : 0.65
  const target = Math.min(150, Math.round((30 + 5 * Math.sqrt(Math.max(0, startPop))) * share))
  return Math.max(1, Math.ceil(startPop / target))
}
export const MAX_INSTANCES = 220

/** Split n display instances across stages with the largest-remainder method (no stage silently vanishes). */
export function allocate(stageCounts: number[], n: number): number[] {
  const tot = stageCounts.reduce((a, b) => a + b, 0)
  if (tot <= 0 || n <= 0) return stageCounts.map(() => 0)
  const raw = stageCounts.map((c) => (c / tot) * n)
  const out = raw.map(Math.floor)
  let left = n - out.reduce((a, b) => a + b, 0)
  raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { out[i]++; left-- } })
  return out
}

export function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7)

export type Plot = { w: number; d: number }
export const PLOT: Plot = { w: 24, d: 15 }  // smallest field
const PLOT_MAX_W = 64, PLOT_ASPECT = 1.6
export const MAX_HEAVY_INSTANCES = 160

/** Spacing between plant centres for a model with this ground footprint (scene units). */
export const spacingFor = (footprint: number) => Math.max(0.42, footprint * 0.62)

/** The field grows with what it has to hold: area = sum of (instances x spacing^2 x 1.5), within limits.
 * Bands are as wide as each species needs, so a stand of trees no longer shares space equally with a herb. */
export function layoutField(needs: { cap: number; spacing: number }[]): { plot: Plot; bands: { x0: number; x1: number }[] } {
  const raw = needs.map((n) => Math.max(1, n.cap) * n.spacing ** 2 * 1.5)
  const rawTotal = raw.reduce((a, b) => a + b, 0)
  // every species keeps a readable strip (at least ~22% of the width), even a low herb next to a stand of trees
  const minShare = needs.length > 1 ? 0.22 : 1
  const share = raw.map((a) => Math.max(a / Math.max(rawTotal, 1e-9), minShare))
  const area = share.map((sh) => (sh / share.reduce((a, b) => a + b, 0)) * rawTotal)
  const total = rawTotal
  const w = Math.min(PLOT_MAX_W, Math.max(PLOT.w, Math.sqrt(total * PLOT_ASPECT)))
  const plot = { w: Math.round(w * 10) / 10, d: Math.round((w / PLOT_ASPECT) * 10) / 10 }
  let x = -plot.w / 2
  const bands = area.map((a) => {
    const b = { x0: x, x1: x + (plot.w * a) / Math.max(total, 1e-9) }
    x = b.x1
    return b
  })
  return { plot, bands }
}

/** Deterministic jittered placement inside the slot's band of the plot (positions never move between years). */
export function placements(key: string, band: { x0: number; x1: number }, n: number, minDist: number, plot: Plot = PLOT) {
  const rnd = mulberry32(hash(key))
  const pts: { x: number; z: number; rot: number; jitter: number }[] = []
  const margin = 0.6
  let tries = 0
  while (pts.length < n && tries < n * 60) {
    tries++
    const x = band.x0 + margin + rnd() * (band.x1 - band.x0 - 2 * margin)
    const z = -plot.d / 2 + margin + rnd() * (plot.d - 2 * margin)
    const d = tries < n * 30 ? minDist : minDist * 0.5
    if (pts.every((p) => (p.x - x) ** 2 + (p.z - z) ** 2 > d * d)) pts.push({ x, z, rot: rnd() * Math.PI * 2, jitter: 0.85 + rnd() * 0.3 })
  }
  while (pts.length < n) pts.push({ x: band.x0 + rnd() * (band.x1 - band.x0), z: (rnd() - 0.5) * plot.d, rot: rnd() * 6.28, jitter: 1 })
  return pts
}

/** Stage of each active instance; bigger-drawn stages first so established plants keep their place as years change. */
export function stageOfInstances(perStage: number[], sizes?: number[]) {
  const order = perStage.map((_, s) => s).sort((a, b) => (sizes ? sizes[b] - sizes[a] : 0) || b - a)
  const out: number[] = []
  for (const s of order) for (let i = 0; i < perStage[s]; i++) out.push(s)
  return out
}

/** How a matrix stage is drawn. Size is read from the study's own stage name and class (a display convention,
 *  not a measured size); seeds in the soil and dormant plants are counted but have nothing above ground to draw. */
export type StageLook = { scale: number; drawn: boolean; group: 'seed' | 'dormant' | 'seedling' | 'young' | 'adult' | 'stage' }
const BANDS = { seedling: [0.24, 0.3], young: [0.42, 0.64], adult: [0.82, 1.05] } as const

export function stageGroup(name: string, cls?: string): StageLook['group'] {
  const n = name.toLowerCase()
  if (cls === 'prop' || (/seed ?bank|^\s*\d+ month seeds|^seeds?\b/.test(n) && !/seedl/.test(n))) return 'seed'
  if (cls === 'dorm' || /dorman/.test(n)) return 'dormant'
  if (/seed(l)?ing|sprout|\bsdl\b/.test(n)) return 'seedling'
  if (/sapling|juvenile|\bjuv\b|\bsap\b|non-reproductive/.test(n)) return 'young'
  if (/adult|reproductive|flowering|generative|mature|\bad ?\d|\blarge\b|\bxl\b/.test(n)) return 'adult'
  if (/small|medium|middle|vegetative|\b[lbij]\d\b/.test(n)) return 'young'
  return 'stage'
}

export function stageLooks(names: string[], classes: string[] = []): StageLook[] {
  const groups = names.map((n, i) => stageGroup(n, classes[i]))
  const scale: (number | null)[] = groups.map(() => null)
  for (const g of ['seedling', 'young', 'adult'] as const) {
    const idx = groups.flatMap((x, i) => (x === g ? [i] : []))
    const [lo, hi] = BANDS[g]
    idx.forEach((i, k) => { scale[i] = idx.length === 1 ? (g === 'adult' ? 1 : (lo + hi) / 2) : lo + ((hi - lo) * k) / (idx.length - 1) })
  }
  // stages the name does not place (e.g. "2 leaves", "1 year") sit between their placed neighbours
  const live = groups.flatMap((g, i) => (g === 'seed' || g === 'dormant' ? [] : [i]))
  const pos = live.map((i) => scale[i])
  if (pos.length === 1 && pos[0] == null) pos[0] = 1
  if (pos.length > 1) { pos[0] ??= 0.26; pos[pos.length - 1] ??= 1 }
  for (let j = 0; j < pos.length; j++) {
    if (pos[j] != null) continue
    let b = j + 1
    while (pos[b] == null) b++
    pos[j] = pos[j - 1]! + ((pos[b]! - pos[j - 1]!) * 1) / (b - j + 1)
  }
  live.forEach((i, j) => { scale[i] = pos[j] })
  return groups.map((g, i) => ({ group: g, drawn: g !== 'seed' && g !== 'dormant', scale: scale[i] ?? 0 }))
}

export function shortStage(name: string) {
  const head = name.split(':')[0].trim()
  return head.length > 22 ? head.slice(0, 21) + '…' : head
}
