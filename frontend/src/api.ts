// Thin typed client for the FastAPI backend (proxied at /api by Vite).

export type Bounds = [number, number, number, number]
export type RegionInput = { bbox?: Bounds; point?: [number, number]; radius_km?: number; geometry?: object }

export type SpeciesSummary = {
  name: string; family: string | null; organism_type: string | null; common_name: string | null
  n_matrices: number; n_studies: number; n_populations: number; median_lambda: number | null
  harvest_study: boolean; phenobs: boolean; habitat_model: boolean; medicinal_sources: string
  n_med_references: number; example_uses: string; matched_via_synonym: boolean; sensitive: boolean
  tier: 'A' | 'B' | 'C'
}

export type TaskStatus = 'enabled' | 'enabled-with-caveats' | 'blocked' | 'unknown'
export type EligibilityTask = { task: string; status: TaskStatus; reasons: string[]; missing: string[]; tier: string | null; answer_status?: string }
export type Eligibility = {
  species: string; in_compadre: boolean; medicinal_documented: boolean; overall_tier: 'A' | 'B' | 'C'
  quota_answer: string; tasks: Record<string, EligibilityTask>; rule_version: string
}

export type SpeciesProfile = Partial<SpeciesSummary> & {
  name: string; in_catalog: boolean; eligibility: Eligibility; tier: 'A' | 'B' | 'C'; note?: string
  compadre_locations?: { lat: number; lon: number }[]
  harvest_studies?: { id: string; design: string; organ: string; citation: string; tier: string }[]
  cases?: string[]
  preset_matrices?: { matrix_id: number; population: string; treatment: string; composite: string; years: string; dim: number; study_id: string; split: boolean }[]
  checklists?: Checklists | null
}

export type Checklists = {
  wcvp: { status: string; name?: string; accepted_name?: string | null; family?: string | null; powo_url?: string | null; lifeform?: string | null; climate?: string | null
    range_text?: string | null; native_l3?: string[]; introduced_l3?: string[]; extinct_l3?: string[]; doubtful_l3?: string[]; matched_via?: string }
  wfo: { status: string; wfo_id?: string; name?: string; role?: string | null; accepted_name?: string | null; url?: string; classification?: string | null; n_candidates?: number }
  agree: boolean | null; name_changed: boolean
}

export type Case = {
  id: string; species: string; title: string; tier: 'A' | 'B' | 'C'; study: string | null
  problem: string; design: string; known: string; limits: string; next: string
  region: RegionInput; camera: [number, number, number]
}

export type Cell = {
  id: string; bounds: Bounds; center: [number, number]; in_region_fraction?: number
  bio1?: number | null; bio12?: number | null; bio15?: number | null; elevation_m?: number | null; fire_detections?: number
}

export type Source = { name: string; url?: string; citation?: string; resolution?: string; licence?: string }
export type Layer = { status: string; reason?: string; source?: Source; [k: string]: unknown }

export type Occurrence = { id: number; lat: number; lon: number; year: number | null; basis: string; uncertainty_m: number | null; country: string; gbif_url: string }

export type Suitability =
  | { status: 'available'; model: string; spatial_cv_auc: number; predictions: { id: string; suitability: number | null; extrapolation: boolean }[] }
  | { status: string; reason?: string }

export type RegionContext = {
  region: { bounds: Bounds; area_km2: number; centroid: [number, number]; issues: string[]; geojson: object }
  grid: Cell[]; grid_resolution_deg: number
  layers: Record<string, Layer>
  suitability?: Suitability
}

export type LayerDef = { id: string; label: string; kind: 'points' | 'grid' | 'wms' | 'xyz' | 'pending'; url?: string; wms_layer?: string; attribution?: string }
export type LayerGroup = { id: string; label: string; layers: LayerDef[] }

export type Health = { status: string; compadre_version: string; matrices: number; medicinal_taxa: number; rule_version: string; providers: Record<string, boolean | string> }

export type Trajectory = { stages: number[][]; total: number[]; index: number[]; proportions: number[][] }
export type MatrixCard = {
  matrix_id: number; species: string; population: string; treatment: string; composite: string
  start_year: string; end_year: string; study_id: string; observations?: string; country: string
  stages: string[]; stage_classes?: string[]; A: number[][]; U: number[][]; F: number[][]; C?: number[][]
  lambda: number; lambda_power_check: number; damping_ratio: number; stable_stage: number[]; reproductive_value: number[]
  elasticity: number[][]; elasticity_by_process: Record<string, number>
  validation: { ok: boolean; errors: string[]; warnings: string[]; irreducible: boolean; primitive: boolean }
  life_table: { R0: number; generation_time: number; life_expectancy: number; first_reproductive_stage: number }
}
export type Study = {
  id: string; species: string; citation: string; organ: string; product: string; site: string; habitat: string
  design: 'experimental' | 'observational'; control_ids: number[]; treatment_ids: number[]; reference_ids?: number[]
  notes: string; tier: string; citation_source: string; synonym_in_paper?: string
}
export type AuditedStudy = { study: Study; control_lambdas: Record<string, number>; treatment_lambdas: Record<string, number>
  delta_mean: number; ltre_by_process: Record<string, Record<string, number>>; dose_response?: { intensity_pct: number; matrix_id: number; lambda: number }[]; id: string }
export type Series = { matrix_id: number; role: 'control' | 'treatment' | 'reference'; label: string; lambda: number; qc_ok: boolean; trajectory: Trajectory; population: string; years: string }
export type SimResult = {
  mode: string; tier: string; run_id?: string; n0_basis?: string; horizon?: number; assumptions?: string[]
  design_caveat?: string; calibration_warning?: string; provenance?: { compadre_version: string; engine: string; computed_ms: number }
  // study
  study?: Study; series?: Series[]; comparison?: { delta_mean: number; ltre_by_process: Record<string, Record<string, number>>; permutation_test?: { p_value: number; observed_difference: number; ci95: [number, number]; n_treatment: number; n_control: number; unit: string } | null }
  // projection / hypothetical
  matrix?: MatrixCard; trajectory?: Trajectory; trajectory_baseline?: Trajectory; trajectory_scenario?: Trajectory
  lambda_baseline?: number; lambda_scenario?: number; stages_removed?: number[]; fraction?: number
  // rotation
  study_id?: string; treatment_id?: number; intensity_pct?: number; rest_years?: number; annualised_lambda?: number
  min_rest_years_lambda_ge_1?: number | null; control_trajectory?: Trajectory; single_harvest_recovery?: { years_to_recover_initial_abundance: number | null; criterion: string }
}
export type QuotaAnswer = { species: string; answer_status: string; status: string; message: string; missing: string[]; reasons: string[]; tier: string; not_a_permit: string }
export type SpeciesImage = {
  status: 'ok' | 'none' | 'error'; id?: string; url?: string; accepted_name?: string; source?: string; photographer?: string | null
  licence?: string; licence_url?: string | null; attribution?: string; attribution_url?: string | null
  taxonomic_confidence?: string; review_status?: string; reason?: string; cache?: string
}
export type SyntheticResult = { mode: 'synthetic'; synthetic: true; stages: string[]; A: number[][]; lambda: number; trajectory: Trajectory; label: string; n0_basis: string }

export type SavedItem = { id: string; kind: string; name: string; body: Record<string, unknown>; created_utc?: string; updated_utc?: string }

export type PlanCell = Cell & { n_records: number; last_record_year: number | null; years_since_record: number | null; suitability: number | null
  cost: number; cost_basis: string; stratum?: number; benefit?: number; reasons?: string[]; reverify_value?: number; reverify_reason?: string }
export type Selection = { selected?: string[]; n_selected: number; strata_covered: number; strata_total: number; total_benefit: number; cost_used?: number
  budget: number; mean_env_distance_to_nearest_selected: number; constraint_satisfied: boolean; method: string; status?: string; objective?: number; reason?: string }
export type SurveyPlan = { optimal: Selection; baselines: Record<string, Selection>; cells: PlanCell[]; solver: string; objective_definition: string
  caveat: string; suitability_status: string; run_id: string; computed_ms: number }
export type ReverifyPlan = { method: string; status: string; selected: string[]; cells: PlanCell[]; objective_definition: string; caveat: string; run_id: string; computed_ms: number }
export type EvidencePlan = { species: string; budget: number; budget_unit: string
  optimal: { items: string[]; unlocks: string[]; value: number; cost: number }; greedy_baseline: { items: string[]; unlocks: string[]; value: number; cost: number }
  items: { id: string; label: string; cost: number; selected: boolean; unlocks_if_complete: string[]; why?: string[] }[]
  decisions: Record<string, { requires: string[]; label: string; value: number; unlocked: boolean; currently: string; why?: string }>
  context?: { growth_form: string | null; organ: string | null; organ_id: string | null; pressure: number; lifespan_factor: number; medicinal: boolean
    n_matrices: number; study_designs: string[]; sensitivity: { share: number; process: string; basis: string; matrices: number } | null
    cites_listed: boolean | null; cites_appendices: string[] | null; lookalikes: string[]; phenobs: boolean; occurrence_count: number | null }
  decision_uncertainty: { status: string; flip_probability?: number; rows?: { intensity: number; lambda_by_variant: Record<string, number>; models_disagree: boolean }[] }
  solver: string; caveat: string; run_id: string; computed_ms: number }

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  if (!r.ok) {
    let msg = r.statusText
    try {
      const j = await r.json()
      msg = typeof j.detail === 'string' ? j.detail : Array.isArray(j.detail) ? j.detail.map((d: { msg: string }) => d.msg).join('; ') : msg
    } catch { /* keep statusText */ }
    throw new ApiError(r.status, msg)
  }
  return r.json() as Promise<T>
}

export const api = {
  health: () => req<Health>('/api/health'),
  species: (q: string) => req<{ results: SpeciesSummary[]; total_catalog: number }>(`/api/species?q=${encodeURIComponent(q)}&limit=30`),
  profile: (name: string) => req<SpeciesProfile>(`/api/species/${encodeURIComponent(name)}`),
  eligibility: (name: string, occurrenceCount: number | null, hasRegion: boolean) =>
    req<Eligibility>(`/api/eligibility/${encodeURIComponent(name)}?has_region=${hasRegion}${occurrenceCount === null ? '' : `&occurrence_count=${occurrenceCount}`}`),
  cases: () => req<{ cases: Case[] }>('/api/cases'),
  layers: () => req<{ groups: LayerGroup[] }>('/api/layers'),
  context: (species: string | null, region: RegionInput) =>
    req<RegionContext>('/api/explore/context', { method: 'POST', body: JSON.stringify({ species, region }) }),
  studies: () => req<{ audited: AuditedStudy[] }>('/api/studies'),
  matrix: (mid: number) => req<MatrixCard>(`/api/matrix/${mid}`),
  simulate: (body: Record<string, unknown>) => req<SimResult>('/api/simulate', { method: 'POST', body: JSON.stringify(body) }),
  quota: (species: string, local_evidence: Record<string, boolean>) =>
    req<QuotaAnswer>('/api/quota', { method: 'POST', body: JSON.stringify({ species, local_evidence }) }),
  items: (kind: string) => req<{ items: SavedItem[] }>(`/api/items/${kind}`),
  saveItem: (kind: string, name: string, body: Record<string, unknown>) =>
    req<SavedItem>(`/api/items/${kind}`, { method: 'POST', body: JSON.stringify({ name, body }) }),
  json: <T,>(path: string, init?: RequestInit) => req<T>(path, init),
  speciesImage: (name: string) => req<SpeciesImage>(`/api/species/${encodeURIComponent(name)}/image`),
  simulateSynthetic: (body: { stage_names: string[]; survival: number[]; growth: number[]; fecundity: number; horizon: number }) =>
    req<SyntheticResult>('/api/simulate/synthetic', { method: 'POST', body: JSON.stringify(body) }),
  sweep: (species: string, region: RegionInput) => req<{ rows: { budget: number; ilp: number; greedy: number; random: number }[] }>(
    '/api/plan/sweep', { method: 'POST', body: JSON.stringify({ species, region }) }),
  plan: <T,>(body: Record<string, unknown>) => req<T>('/api/plan', { method: 'POST', body: JSON.stringify(body) }),
  startRun: (body: { species: string | null; region: RegionInput | null; goal?: string }) =>
    req<{ run_id: string }>('/api/runs', { method: 'POST', body: JSON.stringify(body) }),
}
