import { ApiError } from './api'
import type { Role } from './store'

// HarvestOps client. The role and workspace headers are checked on the server for every request.
export type Workspace = 'main' | 'demo'
export type Tagged<T> = { value: T; provenance: 'prefilled-source' | 'ai-extracted' | 'user-supplied' | 'reviewer-verified'; source?: string | null }

export type Task = {
  id: string; passport_id: string | null; lot_id: string | null; title: string; detail: string; kind: string; phase: string
  blocking: number; status: 'open' | 'in-review' | 'resolved' | 'waived'; owner_role: Role; source: string; resolution: string | null; created: number; due?: string | null; overdue?: boolean
}
export type Lot = {
  id: string; code: string; species: string; organ: string; basis: 'fresh' | 'dry'; status: string; storage: string | null
  parent_lot: string | null; on_hand_g: number; reserved_g: number; available_g: number; synthetic: number
}
export type Lineage = { focus: string; root: string; nodes: Lot[]; edges: { from: string; to: string }[]
  processing: { in_lot: string; out_lot: string; in_g: number; out_g: number; moisture_g: number; rejected_g: number; waste_g: number; unexplained_g: number; method: string }[] }
export type Issue = { id: string; rule: string; severity: 'mismatch' | 'missing' | 'jurisdiction' | 'review' | 'consistent'; category: string; message: string; evidence: unknown; status: string }
export type DocumentRow = {
  id: string; filename: string; sha256: string; doc_kind: string; kind_confidence: number; status: string; pages: number; created: number
  synthetic_marked: number; issuer_verification: string; version: number
  extraction?: { fields?: Field[]; reason?: string | null; missing_expected?: string[] } | null
}
export type Field = { id: string; name: string; value: string | null; normalised: string | null; original: string | null; page: number | null; snippet: string | null; confidence: number; method: string; status: string }
export type Caution = {
  id: string; issue: string; why_it_matters: string; evidence_kind: string; applicability: string; uncertainty: string
  recommended_next: string; sources: { title: string; url?: string | null; kind: string; excerpt?: string | null }[]
  organ: string; scope: string; human_review_status: string; not_a_permit: boolean
}

export type Passport = {
  id: string; code: string; species: string; accepted_name: string; organ: string; activity: string | null; region_label: string | null
  jurisdiction: string | null; private_locality: string | null; status: string; status_label: string; prev_status: string | null
  synthetic: number; created: number; updated: number; open_tasks?: number; open_issues?: number
  prefill?: Record<string, Tagged<unknown>> & { in_catalog?: boolean }
  fields?: Record<string, Tagged<unknown>>
}
export type PassportDetail = Passport & {
  flow: { id: string; label: string; state: 'done' | 'current' | 'todo' }[]; allowed_next: string[]
  events: { id: string; ts: number; actor_role: string; kind: string; from_status: string | null; to_status: string | null; note: string | null }[]
  tasks: Task[]; next_actions: Task[]; lots: Lot[]
  harvest_events: { id: string; collector: string; date: string; qty_g: number; qty_original: number; unit_original: string; basis: string; lot_id: string; site_ref: string | null; synthetic: number }[]
  processing: { id: string; in_lot: string; out_lot: string; in_g: number; out_g: number; moisture_g: number; rejected_g: number; waste_g: number; unexplained_g: number; method: string; created: number }[]
  quality_tests: { id: string; lot_id: string; analyte: string; result: number | null; unit: string; criterion: string | null; criterion_source: string | null; outcome: string; source_doc: string | null }[]
  shipments: { id: string; lot_id: string; qty_g: number; destination_country: string; cross_border: number; status: string; checklist: { item: string; ok: boolean; note?: string }[] }[]
  reviews: { id: string; target: string; decision: string; reason: string; role: string; ts: number }[]
  documents: DocumentRow[]; issues: Issue[]; audit_trail: { seq: number; ts: number; actor_role: string; entity: string; action: string; data: Record<string, unknown> }[]
  cautions?: { status: string; cards: Caution[]; run_id?: string; generated?: number }
  not_a_permit: string
}
export type Overview = {
  passports: Passport[]; queue: Task[]; my_tasks: Task[]; inventory: { lots: Lot[]; by_species_organ_basis_status: { species: string; organ: string; basis: string; status: string; on_hand_g: number; available_g: number }[]; note: string }
  recent: { seq: number; ts: number; actor_role: string; entity: string; action: string; data: Record<string, unknown> }[]
  expiries: { value: string; normalised: string; filename: string; passport_id: string }[]
  counts: { active_passports: number; open_tasks: number; blocking: number; lots: number; quarantined_lots: number; overdue?: number; exceptions?: number }
  exceptions?: { kind: string; severity: number; title: string; passport_id: string | null; passport: string | null; ref: string; due?: string | null }[]
}
export type Meta = { workspaces: Record<string, string>; roles: string[]; flow: string[]; stage_labels: Record<string, string>; organs: string[]; not_a_permit: string
  access_model: string; mass_tolerance: { grams: number; percent: number; label: string } }

export function opsClient(role: Role, ws: Workspace) {
  const h = { 'X-EH-Role': role, 'X-EH-Workspace': ws }
  async function req<T>(path: string, init?: RequestInit): Promise<T> {
    const isForm = init?.body instanceof FormData
    const r = await fetch(`/api/ops${path}`, { ...init, headers: { ...(isForm ? {} : { 'content-type': 'application/json' }), ...h, ...(init?.headers || {}) } })
    if (!r.ok) {
      let msg = r.statusText
      try { const j = await r.json(); msg = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail) } catch { /* keep status text */ }
      throw new ApiError(r.status, msg)
    }
    return r.json() as Promise<T>
  }
  const post = <T,>(path: string, body: unknown) => req<T>(path, { method: 'POST', body: JSON.stringify(body) })
  return {
    meta: () => req<Meta>('/meta'),
    overview: () => req<Overview>('/overview'),
    passports: () => req<{ passports: Passport[] }>('/passports'),
    passport: (id: string) => req<PassportDetail>(`/passports/${id}`),
    createPassport: (b: { species: string; organ: string | null; activity: string | null; region_label: string | null; jurisdiction: string | null; private_locality: string | null }) =>
      post<PassportDetail>('/passports', b),
    transition: (id: string, to: string, note?: string) => post<PassportDetail>(`/passports/${id}/transition`, { to, note }),
    harvest: (id: string, b: Record<string, unknown>) => post<Record<string, unknown>>(`/passports/${id}/harvest`, b),
    shipment: (id: string, b: Record<string, unknown>) => post<{ shipment_id: string; checklist: { item: string; ok: boolean }[] }>(`/passports/${id}/shipments`, b),
    review: (id: string, b: Record<string, unknown>) => post<{ id: string; note: string }>(`/passports/${id}/review`, b),
    reconciliation: (id: string) => req<{ per_basis: Record<string, Record<string, number>>; unexplained_total_g: number }>(`/passports/${id}/reconciliation`),
    process: (b: Record<string, unknown>) => post<{ mass_balance: Record<string, number>; reconciliation_flag: { message: string } | null }>('/stock/process', b),
    split: (b: Record<string, unknown>) => post<unknown>('/stock/split', b),
    quarantine: (b: Record<string, unknown>) => post<unknown>('/stock/quarantine', b),
    dispatch: (b: Record<string, unknown>) => post<unknown>('/stock/dispatch', b),
    quality: (b: Record<string, unknown>) => post<{ outcome: string }>('/quality', b),
    lotLedger: (id: string) => req<{ lot: Lot; events: { seq: number; kind: string; qty_g: number; reserved_delta_g: number; running_g: number; ts: number; actor_role: string; reason: string }[] }>(`/lots/${id}/ledger`),
    lineage: (id: string) => req<Lineage>(`/lots/${id}/lineage`),
    traceHold: (id: string, b: { idem: string; reason: string }) => post<{ held: { lot: string; on_hand_g: number }[]; skipped: { lot: string; why: string }[] }>(`/lots/${id}/trace-hold`, b),
    updateTask: (id: string, status: Task['status'], resolution?: string) => req<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ status, resolution }) }),
    upload: (pid: string, f: File) => { const fd = new FormData(); fd.append('file', f); return req<{ document: DocumentRow; issues: Issue[] }>(`/passports/${pid}/documents`, { method: 'POST', body: fd }) },
    correctField: (fid: string, value: string, reason: string) => req<unknown>(`/fields/${fid}`, { method: 'PATCH', body: JSON.stringify({ value, reason }) }),
    cautions: (pid: string, refresh = false) => post<{ status: string; cards: Caution[]; run_id?: string }>(`/passports/${pid}/cautions${refresh ? '?refresh=1' : ''}`, {}),
    samples: () => req<{ packets: { id: string; story: string; expected: string[]; files: string[]; passport: { species: string; organ: string; jurisdiction: string } }[] }>('/samples'),
    loadSample: (pid: string, packet: string) => post<{ loaded: string; issues: Issue[] }>(`/passports/${pid}/samples/${packet}`, {}),
    fileUrl: (did: string) => `/api/ops/documents/${did}/file?role=${encodeURIComponent(role)}&ws=${ws}`,
    exportUrl: (pid: string, kind: string) => `/api/ops/passports/${pid}/export/${kind}?role=${encodeURIComponent(role)}&ws=${ws}`,
  }
}
export type Ops = ReturnType<typeof opsClient>

export const newIdem = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)
export const kg = (g: number) => `${(g / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} kg`
export const PROV_LABEL: Record<string, string> = {
  'prefilled-source': 'from source', 'ai-extracted': 'AI-extracted', 'user-supplied': 'you entered', 'reviewer-verified': 'reviewer verified',
}
