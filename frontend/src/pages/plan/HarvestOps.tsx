import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useSelection } from '../../store'
import SpeciesPhoto from '../../components/SpeciesPhoto'
import ExpertDrawer from '../../components/ExpertDrawer'
import { kg, newIdem, opsClient, PROV_LABEL, type Caution, type Lineage, type Lot, type Ops, type Overview, type Passport, type PassportDetail, type Task, type Workspace } from '../../ops'
import { StageRing, StatTile } from './ops/ui'
import './ops.css'

type Tab = 'prepare' | 'collect' | 'process' | 'quality' | 'documents' | 'activity'
const TABS: { id: Tab; label: string }[] = [
  { id: 'prepare', label: 'Prepare' }, { id: 'collect', label: 'Collect' }, { id: 'process', label: 'Process & Inventory' },
  { id: 'quality', label: 'Quality & Trade' }, { id: 'documents', label: 'Documents' }, { id: 'activity', label: 'Activity' },
]
const ORGANS = ['rhizome', 'root', 'bark', 'bark + foliage', 'leaf', 'flower', 'fruit', 'seed', 'resin (stem tapping)', 'whole plant']

function loadWs(): Workspace { try { return (localStorage.getItem('eh.ws') as Workspace) || 'demo' } catch { return 'demo' } }

export default function HarvestOps() {
  const { role, species, organ, passportId, setPassport } = useSelection()
  const [ws, setWsState] = useState<Workspace>(loadWs)
  const setWs = (w: Workspace) => { try { localStorage.setItem('eh.ws', w) } catch { /* ignore */ } setWsState(w); setPassport(null) }
  const ops = useMemo(() => opsClient(role, ws), [role, ws])
  const [overview, setOverview] = useState<Overview | null>(null)
  const [detail, setDetail] = useState<PassportDetail | null>(null)
  const [tab, setTab] = useState<Tab>('prepare')
  const [creating, setCreating] = useState(() => window.location.hash.includes('new=1'))
  const [err, setErr] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setErr(null)
    try {
      setOverview(await ops.overview())
      if (passportId) setDetail(await ops.passport(passportId))
      else setDetail(null)
    } catch (e) {
      if ((e as { status?: number }).status === 404) { setPassport(null); setDetail(null) } else setErr((e as Error).message)
    }
  }, [ops, passportId, setPassport])
  useEffect(() => { refresh() }, [refresh])

  const act = useCallback(async (fn: () => Promise<unknown>, ok?: string) => {
    setErr(null)
    try { await fn(); if (ok) { setToast(ok); window.setTimeout(() => setToast(null), 3500) } await refresh(); return true }
    catch (e) { setErr((e as Error).message); return false }
  }, [refresh])

  return (
    <div className="ops" data-testid="harvestops">
      <aside className="ops-rail scroll" aria-label="Harvest Passports">
        <header>
          <p className="label">Plan · HarvestOps</p>
          <h1>Harvest workbench</h1>
          <div className="ops-ws" role="group" aria-label="Workspace">
            <button className="btn sm" aria-pressed={ws === 'demo'} onClick={() => setWs('demo')} data-testid="ws-demo">Demo (synthetic)</button>
            <button className="btn sm" aria-pressed={ws === 'main'} onClick={() => setWs('main')} data-testid="ws-main">My workspace</button>
          </div>
          {ws === 'demo' && <p className="tiny warn">Everything in the demo workspace is SYNTHETIC: fictional collections, documents and lab results.</p>}
          <p className="tiny ops-access" data-testid="demo-access-banner">Demo access model: roles are chosen, not signed in. Not production security; do not store real private documents.</p>
        </header>
        <button className="btn primary" onClick={() => { setCreating(true); setPassport(null) }} data-testid="new-passport">Start a Harvest Passport</button>
        <button className={`ops-pitem ${!passportId ? 'on' : ''}`} onClick={() => { setPassport(null); setCreating(false) }}>Overview &amp; work queue</button>
        <ul className="ops-plist">
          {overview?.passports.map((p) => (
            <li key={p.id}>
              <button className={`ops-pitem ${p.id === passportId ? 'on' : ''}`} onClick={() => { setPassport(p.id); setCreating(false); setTab('prepare') }} data-testid="passport-item">
                <SpeciesPhoto name={p.accepted_name || p.species} size="xs" />
                <span><b className="num">{p.code}</b> <i className="serif">{p.accepted_name}</i><small>{p.organ} · {p.status_label}{p.open_tasks ? ` · ${p.open_tasks} open` : ''}</small></span>
              </button>
            </li>
          ))}
          {overview && !overview.passports.length && <li className="small dim">No passports yet in this workspace.</li>}
        </ul>
      </aside>

      <section className="ops-main scroll" aria-live="polite">
        {err && <p className="ops-err" role="alert" data-testid="ops-error">{err}</p>}
        {toast && <p className="ops-toast" role="status">{toast}</p>}
        {creating ? (
          <NewPassport ops={ops} ws={ws} species={species} organ={organ} onCancel={() => setCreating(false)}
            onCreated={(p) => { setCreating(false); setPassport(p.id); setTab('prepare'); refresh() }} setErr={setErr} />
        ) : detail ? (
          <PassportView key={detail.id} d={detail} ops={ops} tab={tab} setTab={setTab} act={act} role={role} />
        ) : overview ? <OverviewView o={overview} ops={ops} act={act} open={(id) => { setPassport(id); setTab('prepare') }} role={role} /> : <p className="dim">Loading…</p>}
      </section>
    </div>
  )
}

// ---------------------------------------------------------------- overview
function OverviewView({ o, ops, act, open, role }: { o: Overview; ops: Ops; act: Act; open: (id: string) => void; role: string }) {
  const codes = Object.fromEntries(o.passports.map((p) => [p.id, `${p.code} · ${p.accepted_name}`]))
  return (
    <div className="ops-overview" data-testid="ops-overview">
      <div className="ops-hero-row">
        <div><p className="label">Workspace overview</p><h2 className="serif">What needs doing</h2></div>
        <a className="btn sm" href="#/plan/methods" data-testid="link-methods">Harvest methods →</a>
      </div>
      <div className="ops-counts ops-stagger">
        <StatTile value={o.counts.active_passports} label="active passports" tone="accent" />
        <StatTile value={o.counts.open_tasks} label="open tasks" />
        <StatTile value={o.counts.blocking} label="blocking a next step" tone={o.counts.blocking ? 'review' : undefined} />
        <StatTile value={o.counts.lots} label="lots in stock" />
        <StatTile value={o.counts.quarantined_lots} label="lots on hold" tone={o.counts.quarantined_lots ? 'bad' : undefined} />
        <StatTile value={o.counts.overdue ?? 0} label="overdue tasks" tone={o.counts.overdue ? 'review' : 'good'} />
      </div>
      {(o.exceptions?.length ?? 0) > 0 && (
        <section className="ops-exc" data-testid="exceptions">
          <h3 className="label">Exceptions ({o.exceptions!.length}) · most severe first</h3>
          <ul>{o.exceptions!.slice(0, 8).map((e) => (
            <li key={e.kind + e.ref} className={`sev-${e.severity}`}>
              <span className={`pill ${e.severity >= 3 ? 'bad' : 'review'}`}>{e.kind}</span>
              <span>{e.title}{e.due ? <span className="tiny dim"> · due {e.due}</span> : null}</span>
              {e.passport_id && <button className="linkish tiny" onClick={() => open(e.passport_id!)}>{e.passport ?? 'open passport'}</button>}
            </li>
          ))}</ul>
        </section>
      )}
      <div className="ops-cols">
        <section>
          <h3 className="label">Your queue ({role})</h3>
          <TaskList tasks={o.my_tasks} ops={ops} act={act} open={open} codes={codes} empty="Nothing assigned to your role." />
          <h3 className="label" style={{ marginTop: 18 }}>All open tasks</h3>
          <TaskList tasks={o.queue.filter((t) => t.owner_role !== role).slice(0, 12)} ops={ops} act={act} open={open} codes={codes} empty="No other open tasks." />
        </section>
        <section>
          <h3 className="label">Stock by species, part and condition</h3>
          <table className="ops-table">
            <thead><tr><th>Species</th><th>Part</th><th>Condition</th><th>Status</th><th className="r">On hand</th><th className="r">Available</th></tr></thead>
            <tbody>{o.inventory.by_species_organ_basis_status.map((r, i) => (
              <tr key={i}><td><i className="serif">{r.species}</i></td><td>{r.organ}</td><td>{r.basis}</td><td>{r.status}</td><td className="r num">{kg(r.on_hand_g)}</td><td className="r num">{kg(r.available_g)}</td></tr>
            ))}{!o.inventory.by_species_organ_basis_status.length && <tr><td colSpan={6} className="dim">No stock recorded.</td></tr>}</tbody>
          </table>
          <p className="tiny dim">{o.inventory.note}</p>
          {o.expiries.length > 0 && (<>
            <h3 className="label" style={{ marginTop: 18 }}>Document expiry dates</h3>
            <ul className="ops-mini">{o.expiries.map((e, i) => <li key={i}><span className="num">{e.normalised ?? e.value}</span> · {e.filename}</li>)}</ul>
          </>)}
          <h3 className="label" style={{ marginTop: 18 }}>Recent activity</h3>
          <ul className="ops-mini">{o.recent.slice(0, 10).map((a) => <li key={a.seq}><span className="dim num">{time(a.ts)}</span> {a.actor_role} · {a.entity} {a.action}</li>)}</ul>
        </section>
      </div>
    </div>
  )
}

type Act = (fn: () => Promise<unknown>, ok?: string) => Promise<boolean>

function TaskList({ tasks, ops, act, open, codes, empty }: { tasks: Task[]; ops: Ops; act: Act; open?: (pid: string) => void; codes?: Record<string, string>; empty: string }) {
  if (!tasks.length) return <p className="small dim">{empty}</p>
  return <ul className="ops-tasks">{tasks.map((t) => <TaskRow key={t.id} t={t} ops={ops} act={act} open={open} code={t.passport_id ? codes?.[t.passport_id] : undefined} />)}</ul>
}

function TaskRow({ t, ops, act, open, code }: { t: Task; ops: Ops; act: Act; open?: (pid: string) => void; code?: string }) {
  const [mode, setMode] = useState<null | 'resolved' | 'waived'>(null)
  const [why, setWhy] = useState('')
  const done = t.status === 'resolved' || t.status === 'waived'
  return (
    <li className={`ops-task ${t.blocking && !done ? 'blocking' : ''} ${done ? 'done' : ''}`} data-testid="task">
      <div className="ops-task-h">
        <span className={`pill ${done ? 'good' : t.blocking ? 'review' : 'none'}`}>{done ? t.status : t.blocking ? 'blocking' : t.kind}</span>
        <b>{t.title}</b>
        {!done && t.due && <span className={`tiny ${t.due < new Date().toISOString().slice(0, 10) ? 'warn' : 'dim'}`} data-testid="task-due">{t.due < new Date().toISOString().slice(0, 10) ? 'overdue · ' : 'due '}{t.due}</span>}
      </div>
      {code && <p className="tiny dim num">{code}</p>}
      <p className="small dim">{t.detail}</p>
      <div className="ops-task-f">
        <span className="tiny dim">for {t.owner_role} · {t.source}</span>
        {open && t.passport_id && <button className="linkish tiny" onClick={() => open(t.passport_id!)}>open passport</button>}
        {!done && !mode && (<>
          {t.status === 'open' && <button className="btn sm quiet" onClick={() => act(() => ops.updateTask(t.id, 'in-review'), 'Marked in review')}>In review</button>}
          <button className="btn sm" onClick={() => setMode('resolved')} data-testid="task-resolve">Resolve…</button>
          <button className="btn sm quiet" onClick={() => setMode('waived')}>Waive…</button>
        </>)}
        {t.resolution && <span className="tiny">“{t.resolution}”</span>}
      </div>
      {mode && (
        <form className="ops-inline" onSubmit={async (e) => { e.preventDefault(); if (await act(() => ops.updateTask(t.id, mode, why), mode === 'resolved' ? 'Task resolved' : 'Task waived')) setMode(null) }}>
          <input className="input sm" placeholder={mode === 'resolved' ? 'How was it resolved?' : 'Why is it safe to waive? (managers only)'} value={why} onChange={(e) => setWhy(e.target.value)} data-testid="task-why" />
          <button className="btn sm primary" type="submit">{mode === 'resolved' ? 'Resolve' : 'Waive'}</button>
          <button className="btn sm quiet" type="button" onClick={() => setMode(null)}>Cancel</button>
        </form>
      )}
    </li>
  )
}

// ---------------------------------------------------------------- new passport
function NewPassport({ ops, ws, species, organ, onCancel, onCreated, setErr }: {
  ops: Ops; ws: Workspace; species: string | null; organ: string | null; onCancel: () => void; onCreated: (p: Passport) => void; setErr: (s: string | null) => void
}) {
  const [f, setF] = useState({ species: species ?? 'Nardostachys jatamansi', organ: organ ?? '', activity: '', region_label: '', jurisdiction: '', private_locality: '' })
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null)
    try {
      const p = await ops.createPassport({ species: f.species.trim(), organ: f.organ || null, activity: f.activity || null, region_label: f.region_label || null,
        jurisdiction: f.jurisdiction || null, private_locality: f.private_locality || null })
      onCreated(p)
    } catch (er) { setErr((er as Error).message) } finally { setBusy(false) }
  }
  return (
    <form className="ops-new" onSubmit={submit} data-testid="new-passport-form">
      <h2 className="serif">Start a Harvest Passport</h2>
      <p className="small dim">EthnoHarvest fills in what public sources know: accepted name, documented harvested part, published harvest studies, evidence strength, CITES listing and a licensed photo. You add what only you know.</p>
      <div className="ops-new-grid">
        <label>Plant (scientific name)<input className="input" value={f.species} onChange={(e) => setF({ ...f, species: e.target.value })} required data-testid="np-species" /></label>
        <label>Harvested part<select className="input" value={f.organ} onChange={(e) => setF({ ...f, organ: e.target.value })} data-testid="np-organ">
          <option value="">use the part documented in the published study</option>{ORGANS.map((o) => <option key={o} value={o}>{o}</option>)}</select></label>
        <label>Planned activity<input className="input" placeholder="e.g. rhizome collection for a cooperative" value={f.activity} onChange={(e) => setF({ ...f, activity: e.target.value })} /></label>
        <label>Approximate region (public)<input className="input" placeholder="e.g. Dolpa district, Nepal" value={f.region_label} onChange={(e) => setF({ ...f, region_label: e.target.value })} data-testid="np-region" /></label>
        <label>Country / jurisdiction<input className="input" value={f.jurisdiction} onChange={(e) => setF({ ...f, jurisdiction: e.target.value })} data-testid="np-jurisdiction" /></label>
        <label>Exact site (restricted; managers only)<input className="input" value={f.private_locality} onChange={(e) => setF({ ...f, private_locality: e.target.value })} /></label>
      </div>
      {ws === 'demo' && <p className="tiny warn">This passport will be created in the demo workspace and marked synthetic.</p>}
      <div className="ops-row">
        <button className="btn primary" disabled={busy} data-testid="np-create">{busy ? 'Gathering evidence…' : 'Create passport'}</button>
        <button className="btn quiet" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------- passport
function PassportView({ d, ops, tab, setTab, act, role }: { d: PassportDetail; ops: Ops; tab: Tab; setTab: (t: Tab) => void; act: Act; role: string }) {
  const pf = d.prefill ?? {}
  const [note, setNote] = useState('')
  return (
    <div className="ops-passport" data-testid="passport">
      <header className="ops-ph">
        <SpeciesPhoto name={d.accepted_name} size="lg" />
        <div>
          <p className="label">Harvest Passport {d.code}{d.synthetic ? ' · SYNTHETIC DEMO' : ''}</p>
          <h2 className="serif"><i>{d.accepted_name}</i> · {d.organ}</h2>
          <p className="small dim">{d.activity ?? 'activity not set'} · {d.region_label ?? 'region not set'}{d.jurisdiction ? ` · ${d.jurisdiction}` : ''}</p>
          <p className="ops-status"><span className={`pill ${['blocked', 'quarantined'].includes(d.status) ? 'bad' : d.status === 'needs-review' ? 'review' : 'info'}`} data-testid="passport-status">{d.status_label}</span>
            {d.issues.filter((i) => i.status === 'open').length > 0 && <span className="pill bad">{d.issues.filter((i) => i.status === 'open').length} document issues</span>}</p>
        </div>
        <div className="ops-exports">
          <span className="label">Export PDF</span>
          {[['passport', 'Passport & audit packet'], ['checklist', 'Preparation checklist'], ['ledger', 'Batch & inventory ledger'], ['quality', 'Quality review checklist'], ['research', 'Research & caveats'], ['transfer', 'Transfer readiness']].map(([k, l]) => (
            <a key={k} className="linkish tiny" href={ops.exportUrl(d.id, k)} target="_blank" rel="noreferrer" data-testid={`export-${k}`}>{l}</a>
          ))}
        </div>
      </header>
      <PassportHero d={d} />

      <div className="ops-body">
        <aside className="ops-side">
          <ol className="ops-flow" aria-label="Passport stages">
            {d.flow.map((s) => <li key={s.id} className={s.state}><i />{s.label}</li>)}
          </ol>
          <div className="ops-next">
            <p className="label">Next actions</p>
            {d.next_actions.length ? <ol>{d.next_actions.map((t) => <li key={t.id} className="small">{t.title}<span className="tiny dim"> · {t.owner_role}</span></li>)}</ol> : <p className="small dim">No open tasks.</p>}
          </div>
          <div className="ops-move">
            {d.allowed_next.map((to) => (
              <button key={to} className="btn sm primary" onClick={() => act(() => ops.transition(d.id, to, note || undefined), `Moved to ${to}`)} data-testid={`move-${to}`}>
                Move to {d.flow.find((f) => f.id === to)?.label ?? to}</button>
            ))}
            {['blocked', 'needs-review', 'quarantined'].includes(d.status) && d.prev_status && (role === 'manager' || role === 'admin') && (
              <button className="btn sm" onClick={() => act(() => ops.transition(d.id, d.prev_status!, note || 'resumed'), 'Resumed')}>Resume</button>
            )}
            <input className="input sm" placeholder="note / reason (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            {!['blocked', 'needs-review', 'quarantined'].includes(d.status) && (
              <button className="btn sm quiet" onClick={() => act(() => ops.transition(d.id, 'needs-review', note), 'Flagged for review')}>Flag “needs review”</button>
            )}
            {d.allowed_next.length === 0 && <p className="tiny dim">Your role ({role}) cannot move this passport from here.</p>}
          </div>
          <p className="tiny ops-np">{d.not_a_permit}</p>
        </aside>

        <div className="ops-content">
          <div role="tablist" className="ops-tabs">
            {TABS.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} data-testid={`tab-${t.id}`}>{t.label}
              {t.id === 'documents' && d.documents.length > 0 && <span className="num"> {d.documents.length}</span>}</button>)}
          </div>
          {tab === 'prepare' && <Prepare d={d} pf={pf} ops={ops} act={act} />}
          {tab === 'collect' && <Collect d={d} ops={ops} act={act} />}
          {tab === 'process' && <ProcessInv d={d} ops={ops} act={act} />}
          {tab === 'quality' && <QualityTrade d={d} ops={ops} act={act} />}
          {tab === 'documents' && <Documents d={d} ops={ops} act={act} synthetic={!!d.synthetic} />}
          {tab === 'activity' && <Activity d={d} />}
        </div>
      </div>
    </div>
  )
}

function PassportHero({ d }: { d: PassportDetail }) {
  const doneN = d.flow.filter((f) => f.state === 'done').length
  const cur = d.flow.find((f) => f.state === 'current')
  const openTasks = d.tasks.filter((t) => t.status !== 'resolved' && t.status !== 'waived')
  const issues = d.issues.filter((i) => i.status === 'open').length
  const avail = d.lots.reduce((a, l) => a + Math.max(0, l.available_g), 0)
  return (
    <div className="ops-hero ops-stagger" data-testid="passport-hero">
      <StageRing done={doneN + (cur ? 1 : 0)} total={d.flow.length} label={cur?.label ?? d.status_label} />
      <StatTile value={openTasks.length} label="open tasks" tone={openTasks.some((t) => t.blocking) ? 'review' : undefined} />
      <StatTile value={issues} label="document issues" tone={issues ? 'bad' : 'good'} />
      <StatTile value={d.documents.length} label="documents" />
      <StatTile value={avail} label="available stock" format={(n) => kg(n)} tone="accent" />
    </div>
  )
}

const KIND_TONE: Record<string, string> = { 'supported-by-study': 'good', 'computed-from-matrices': 'good', 'general': 'info', 'practitioner-guidance': 'info' }

function CautionCard({ c }: { c: Caution }) {
  const [open, setOpen] = useState(false)
  return (
    <li className={`ccard ev-${c.evidence_kind} ${open ? 'open' : ''}`} data-testid="caution-card">
      <button className="ccard-h" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className={`pill ${KIND_TONE[c.evidence_kind] ?? 'review'}`}>{c.evidence_kind.replace(/-/g, ' ')}</span>
        <b>{c.issue}</b>
        <span className="ccard-chev" aria-hidden>▸</span>
      </button>
      {open && (
        <div className="ccard-b">
          <p className="small">{c.why_it_matters}</p>
          <p className="small"><span className="dim">Next:</span> {c.recommended_next}</p>
          <p className="tiny dim">applies: {c.applicability}{c.human_review_status !== 'reviewed' ? ' · awaiting expert review' : ''}</p>
          <p className="label">Proof ({c.sources.length})</p>
          <ul className="ops-src">{c.sources.map((s, i) => <li key={i}><span className="pill none">{s.kind}</span> {s.url ? <a href={s.url} target="_blank" rel="noreferrer noopener">{s.title}</a> : s.title}
            {s.excerpt && <blockquote>“{s.excerpt}”</blockquote>}</li>)}</ul>
          <ExpertDrawer title="Science behind this"><p className="tiny dim">Uncertainty: {c.uncertainty}. Scope: {c.scope}. Not a permit or legal determination.</p></ExpertDrawer>
          <a className="linkish tiny" href={`#/plan/methods?organ=${encodeURIComponent(c.organ ?? '')}`}>compare harvest methods for this part →</a>
        </div>
      )}
    </li>
  )
}

function Prov({ p }: { p?: string }) { return p ? <span className={`ops-prov ops-prov-${p}`}>{PROV_LABEL[p] ?? p}</span> : null }

function Prepare({ d, pf, ops, act }: { d: PassportDetail; pf: NonNullable<PassportDetail['prefill']>; ops: Ops; act: Act }) {
  const studies = (pf.studies?.value as { id: string; design: string; organ: string; citation: string }[]) ?? []
  const cites = (pf.cites?.value as { status: string; listed?: boolean; appendices?: string[]; caveat?: string }) ?? { status: 'unknown' }
  const missing = (pf.missing_local_evidence?.value as string[]) ?? []
  return (
    <div className="ops-prep">
      <section className="ops-facts">
        <h3 className="label">What we know</h3>
        <dl>
          <dt>Accepted name</dt><dd><i className="serif">{String(pf.accepted_name?.value ?? d.accepted_name)}</i> <Prov p={pf.accepted_name?.provenance} /></dd>
          <dt>Harvested part</dt><dd>{d.organ} <Prov p={pf.organ?.provenance} /> <span className="tiny dim">{pf.organ?.source}</span></dd>
          <dt>Growth form</dt><dd>{String(pf.growth_form?.value ?? 'unknown')} <Prov p={pf.growth_form?.provenance} /></dd>
          <dt>Published harvest studies</dt><dd>{studies.length ? studies.map((s) => <div key={s.id} className="small">{s.design === 'experimental' ? 'Experiment' : 'Observational comparison'} · {s.organ} · <span className="dim">{s.citation.slice(0, 110)}…</span></div>) : <span className="dim">none for this species</span>} <Prov p={pf.studies?.provenance} /></dd>
          <dt>Can a safe local harvest rate be estimated?</dt><dd><b>{String(pf.quota_answer?.value)}</b> <Prov p={pf.quota_answer?.provenance} /><div className="tiny dim">{missing.length} of 6 site measurements missing</div></dd>
          <dt>CITES</dt><dd>{cites.status !== 'available' ? <span className="dim">{cites.status}</span> : cites.listed ? `Listed, Appendix ${(cites.appendices ?? []).join(', ')}` : 'Not listed (Species+)'} <Prov p={pf.cites?.provenance} />
            <div className="tiny dim">Trade listing only; it does not grant or deny permission to collect.</div></dd>
        </dl>
      </section>
      <Cautions d={d} ops={ops} />
      <section>
        <h3 className="label">Preparation tasks</h3>
        <TaskList tasks={d.tasks} ops={ops} act={act} empty="No tasks." />
      </section>
    </div>
  )
}

function Cautions({ d, ops }: { d: PassportDetail; ops: Ops }) {
  const [state, setState] = useState<{ status: string; cards: Caution[]; run_id?: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(async (refresh = false) => {
    setBusy(true)
    try { setState(await ops.cautions(d.id, refresh)) } catch (e) { setState({ status: `unavailable: ${(e as Error).message}`, cards: [] }) } finally { setBusy(false) }
  }, [ops, d.id])
  useEffect(() => { load(false) }, [load])
  return (
    <section className="ops-cautions" data-testid="cautions">
      <div className="ops-row"><h3 className="label">Species- and part-specific cautions</h3>
        <button className="btn sm quiet" onClick={() => load(true)} disabled={busy} data-testid="cautions-refresh">{busy ? 'Researching…' : 'Re-run research'}</button>
        {state?.run_id && <a className="linkish tiny" href={`#/evidence?run=${state.run_id}`} data-testid="cautions-run">see how this was found</a>}</div>
      {!state ? <p className="small dim">Researching published evidence for {d.accepted_name} ({d.organ})…</p> : (
        <>
          {state.status !== 'ok' && <p className="small warn">{state.status}</p>}
          <ul className="ops-ccards">
            {state.cards.map((c) => <CautionCard key={c.id} c={c} />)}
          </ul>
        </>
      )}
    </section>
  )
}

function useIdem() { const r = useRef(newIdem()); return { key: r.current, rotate: () => { r.current = newIdem() } } }

function Collect({ d, ops, act }: { d: PassportDetail; ops: Ops; act: Act }) {
  const idem = useIdem()
  const [f, setF] = useState({ collector: '', date: new Date().toISOString().slice(0, 10), qty: '', unit: 'kg', basis: 'fresh', lot_code: `${d.code}-F${d.lots.length + 1}`, site_ref: '' })
  return (
    <div>
      <form className="ops-form" onSubmit={async (e) => {
        e.preventDefault()
        if (await act(() => ops.harvest(d.id, { ...f, qty: +f.qty, idem: idem.key, site_ref: f.site_ref || null }), 'Collection recorded and received into stock')) idem.rotate()
      }} data-testid="harvest-form">
        <h3 className="label">Record a collection</h3>
        <label>Collector<input className="input sm" required value={f.collector} onChange={(e) => setF({ ...f, collector: e.target.value })} /></label>
        <label>Date<input className="input sm" type="date" required value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
        <label>Quantity<input className="input sm" type="number" step="0.01" min="0.01" required value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} data-testid="harvest-qty" /></label>
        <label>Unit<select className="input sm" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })}><option>kg</option><option>g</option></select></label>
        <label>Condition<select className="input sm" value={f.basis} onChange={(e) => setF({ ...f, basis: e.target.value })}><option value="fresh">fresh (wet)</option><option value="dry">dry</option></select></label>
        <label>Lot / batch code<input className="input sm" required value={f.lot_code} onChange={(e) => setF({ ...f, lot_code: e.target.value })} /></label>
        <label>Site reference (private)<input className="input sm" value={f.site_ref} onChange={(e) => setF({ ...f, site_ref: e.target.value })} /></label>
        <button className="btn primary" data-testid="harvest-submit">Record collection</button>
        <p className="tiny dim">Quantities are what you report; EthnoHarvest cannot see the field. Submitting twice by accident is safe: the request carries a one-time key.</p>
      </form>
      <h3 className="label">Collections</h3>
      <table className="ops-table">
        <thead><tr><th>Date</th><th>Collector</th><th className="r">Reported</th><th>Condition</th><th>Lot</th></tr></thead>
        <tbody>{d.harvest_events.map((h) => <tr key={h.id}><td className="num">{h.date}</td><td>{h.collector}</td><td className="r num">{h.qty_original} {h.unit_original}</td><td>{h.basis}</td>
          <td className="num">{d.lots.find((l) => l.id === h.lot_id)?.code}</td></tr>)}
          {!d.harvest_events.length && <tr><td colSpan={5} className="dim">No collections recorded.</td></tr>}</tbody>
      </table>
    </div>
  )
}

function ProcessInv({ d, ops, act }: { d: PassportDetail; ops: Ops; act: Act }) {
  const idem = useIdem()
  const fresh = d.lots.filter((l) => l.available_g > 0 && l.status !== 'quarantined')
  const [f, setF] = useState({ in_lot_id: fresh[0]?.id ?? '', consume_qty: '', out_qty: '', out_lot_code: `${d.code}-D${d.lots.length + 1}`, moisture_loss: '', rejected: '', waste: '', method: 'drying' })
  const [result, setResult] = useState<{ mass_balance: Record<string, number>; reconciliation_flag: { message: string } | null } | null>(null)
  const [ledgerFor, setLedgerFor] = useState<string | null>(null)
  const [lineFor, setLineFor] = useState<string | null>(null)
  return (
    <div>
      <h3 className="label">Lots</h3>
      <LotTable lots={d.lots} ops={ops} act={act} onLedger={setLedgerFor} onLineage={setLineFor} />
      {ledgerFor && <LotLedger ops={ops} lotId={ledgerFor} onClose={() => setLedgerFor(null)} />}
      {lineFor && <LotLineage key={lineFor} ops={ops} act={act} lotId={lineFor} onClose={() => setLineFor(null)} />}
      <form className="ops-form" onSubmit={async (e) => {
        e.preventDefault()
        try {
          const r = await ops.process({ idem: idem.key, in_lot_id: f.in_lot_id, consume_qty: +f.consume_qty, consume_unit: 'kg', out_lot_code: f.out_lot_code,
            out_qty: +f.out_qty, out_unit: 'kg', out_basis: 'dry', moisture_loss: +f.moisture_loss || 0, rejected: +f.rejected || 0, waste: +f.waste || 0, loss_unit: 'kg', method: f.method })
          setResult(r); idem.rotate(); await act(async () => null, 'Processing recorded')
        } catch (er) { await act(() => Promise.reject(er)) }
      }} data-testid="process-form">
        <h3 className="label">Record cleaning / drying (kg)</h3>
        <label>From lot<select className="input sm" value={f.in_lot_id} onChange={(e) => setF({ ...f, in_lot_id: e.target.value })} required>
          <option value="">choose…</option>{fresh.map((l) => <option key={l.id} value={l.id}>{l.code} · {l.basis} · {kg(l.available_g)} available</option>)}</select></label>
        <label>Input used<input className="input sm" type="number" step="0.01" required value={f.consume_qty} onChange={(e) => setF({ ...f, consume_qty: e.target.value })} data-testid="proc-in" /></label>
        <label>Dry output<input className="input sm" type="number" step="0.01" required value={f.out_qty} onChange={(e) => setF({ ...f, out_qty: e.target.value })} data-testid="proc-out" /></label>
        <label>Output lot<input className="input sm" required value={f.out_lot_code} onChange={(e) => setF({ ...f, out_lot_code: e.target.value })} /></label>
        <label>Water lost (measured)<input className="input sm" type="number" step="0.01" value={f.moisture_loss} onChange={(e) => setF({ ...f, moisture_loss: e.target.value })} data-testid="proc-moist" /></label>
        <label>Rejected material<input className="input sm" type="number" step="0.01" value={f.rejected} onChange={(e) => setF({ ...f, rejected: e.target.value })} /></label>
        <label>Waste / cleaning loss<input className="input sm" type="number" step="0.01" value={f.waste} onChange={(e) => setF({ ...f, waste: e.target.value })} /></label>
        <button className="btn primary" data-testid="proc-submit">Record processing</button>
      </form>
      {result && <MassBalance mb={result.mass_balance} flag={result.reconciliation_flag} />}
      {d.processing.length > 0 && (<>
        <h3 className="label">Processing history</h3>
        <table className="ops-table"><thead><tr><th>Method</th><th className="r">In</th><th className="r">Out</th><th className="r">Water</th><th className="r">Rejected</th><th className="r">Waste</th><th className="r">Unexplained</th></tr></thead>
          <tbody>{d.processing.map((p) => <tr key={p.id}><td>{p.method}</td><td className="r num">{kg(p.in_g)}</td><td className="r num">{kg(p.out_g)}</td><td className="r num">{kg(p.moisture_g)}</td>
            <td className="r num">{kg(p.rejected_g)}</td><td className="r num">{kg(p.waste_g)}</td><td className={`r num ${Math.abs(p.unexplained_g) > 50 ? 'warn' : ''}`}>{kg(p.unexplained_g)}</td></tr>)}</tbody></table>
      </>)}
    </div>
  )
}

function MassBalance({ mb, flag }: { mb: Record<string, number>; flag: { message: string } | null }) {
  const parts = [['output_g', 'dry output', 'var(--forest)'], ['moisture_loss_g', 'water lost', 'var(--mineral)'], ['rejected_g', 'rejected', 'var(--soil)'], ['waste_g', 'waste', 'var(--soil-2)'], ['unexplained_g', 'unexplained', 'var(--coral)']] as const
  return (
    <div className="ops-mb" data-testid="mass-balance">
      <p className="label">Where the {kg(mb.input_g)} of input went</p>
      <div className="ops-mbbar">{parts.map(([k, l, c]) => mb[k] > 0 && <i key={k} style={{ flexGrow: mb[k], background: c }} title={`${l}: ${kg(mb[k])}`} />)}</div>
      <div className="ops-mbleg">{parts.map(([k, l, c]) => <span key={k}><i style={{ background: c }} />{l} {kg(Math.max(0, mb[k]))}</span>)}</div>
      {flag ? <p className="small warn" role="alert">{flag.message}</p> : <p className="small ok">All mass accounted for within tolerance.</p>}
      <p className="tiny dim" data-testid="tolerance-label">Tolerance: assumed operational tolerance (configurable), not a scientific or legal standard.</p>
    </div>
  )
}

function LotTable({ lots, ops, act, onLedger, onLineage }: { lots: Lot[]; ops: Ops; act: Act; onLedger: (id: string) => void; onLineage: (id: string) => void }) {
  return (
    <table className="ops-table" data-testid="lots">
      <thead><tr><th>Lot</th><th>Condition</th><th>Status</th><th className="r">On hand</th><th className="r">Reserved</th><th className="r">Available</th><th /></tr></thead>
      <tbody>{lots.map((l) => (
        <tr key={l.id}><td className="num">{l.code}</td><td>{l.basis}</td><td>{l.status === 'quarantined' ? <span className="pill bad">on hold</span> : l.status}</td>
          <td className="r num">{kg(l.on_hand_g)}</td><td className="r num">{kg(l.reserved_g)}</td><td className="r num">{kg(l.available_g)}</td>
          <td className="r"><button className="linkish tiny" onClick={() => onLedger(l.id)}>ledger</button>{' '}
            <button className="linkish tiny" onClick={() => onLineage(l.id)} data-testid={`lineage-${l.code}`}>lineage</button>{' '}
            <button className="linkish tiny" onClick={() => {
              const why = window.prompt?.(l.status === 'quarantined' ? 'Reason for releasing the hold' : 'Reason for holding this lot') ?? (l.status === 'quarantined' ? 'released after review' : 'held for quality review')
              act(() => ops.quarantine({ idem: newIdem(), lot_id: l.id, quarantine: l.status !== 'quarantined', reason: why || 'held for review' }), l.status === 'quarantined' ? 'Hold released' : 'Lot put on hold')
            }}>{l.status === 'quarantined' ? 'release hold' : 'hold'}</button></td></tr>
      ))}{!lots.length && <tr><td colSpan={7} className="dim">No lots yet. Record a collection first.</td></tr>}</tbody>
    </table>
  )
}

function LotLedger({ ops, lotId, onClose }: { ops: Ops; lotId: string; onClose: () => void }) {
  const [l, setL] = useState<Awaited<ReturnType<Ops['lotLedger']>> | null>(null)
  useEffect(() => { ops.lotLedger(lotId).then(setL).catch(() => setL(null)) }, [ops, lotId])
  if (!l) return null
  return (
    <div className="ops-ledger" data-testid="lot-ledger">
      <div className="ops-row"><b className="num">{l.lot.code}</b><span className="tiny dim">immutable event ledger: corrections are new events, never edits</span><button className="btn sm quiet" onClick={onClose}>Close</button></div>
      <table className="ops-table"><thead><tr><th>#</th><th>Event</th><th className="r">Change</th><th className="r">Balance</th><th>By</th><th>Reason</th></tr></thead>
        <tbody>{l.events.map((e) => <tr key={e.seq}><td className="num dim">{e.seq}</td><td>{e.kind}</td><td className="r num">{e.qty_g ? kg(e.qty_g) : e.reserved_delta_g ? `${kg(e.reserved_delta_g)} reserved` : '—'}</td>
          <td className="r num">{kg(e.running_g)}</td><td>{e.actor_role}</td><td className="small">{e.reason}</td></tr>)}</tbody></table>
    </div>
  )
}

function LotLineage({ ops, act, lotId, onClose }: { ops: Ops; act: Act; lotId: string; onClose: () => void }) {
  const [g, setG] = useState<Lineage | null>(null)
  const [why, setWhy] = useState('')
  const [held, setHeld] = useState<string | null>(null)
  useEffect(() => { ops.lineage(lotId).then(setG).catch(() => setG(null)) }, [ops, lotId, held])
  if (!g) return null
  // lay the tree out by depth from the received lot
  const depth: Record<string, number> = { [g.root]: 0 }
  for (let k = 0; k < g.nodes.length; k++) for (const e of g.edges) if (depth[e.from] != null) depth[e.to] = depth[e.from] + 1
  const cols: Lot[][] = []
  g.nodes.forEach((n) => { (cols[depth[n.id] ?? 0] ??= []).push(n) })
  const W = 170, H = 58, pos: Record<string, { x: number; y: number }> = {}
  cols.forEach((c, i) => c.forEach((n, j) => { pos[n.id] = { x: 10 + i * (W + 50), y: 10 + j * (H + 16) } }))
  const width = 20 + cols.length * (W + 50), height = 20 + Math.max(...cols.map((c) => c.length)) * (H + 16)
  const proc = (to: string) => g.processing.find((p) => p.out_lot === to)
  const focus = g.nodes.find((n) => n.id === lotId)
  return (
    <div className="ops-ledger" data-testid="lot-lineage">
      <div className="ops-row"><b>Lineage of <span className="num">{focus?.code}</span></b><span className="tiny dim">every lot made from the same collection</span><button className="btn sm quiet" onClick={onClose}>Close</button></div>
      <div className="ops-lineage"><svg width={width} height={height} role="img" aria-label="Lot lineage tree">
        {g.edges.map((e) => { const a = pos[e.from], b = pos[e.to]; if (!a || !b) return null
          const p = proc(e.to)
          return <g key={e.to}><path className="ops-edge" d={`M${a.x + W},${a.y + H / 2} C${a.x + W + 25},${a.y + H / 2} ${b.x - 25},${b.y + H / 2} ${b.x},${b.y + H / 2}`} />
            {p && <text x={b.x - 4} y={b.y + H / 2 - 6} textAnchor="end" className="ops-edge-t">{p.method}</text>}</g> })}
        {g.nodes.map((n) => { const p = pos[n.id]
          return <g key={n.id} transform={`translate(${p.x},${p.y})`} className={`ops-lnode ${n.status === 'quarantined' ? 'held' : ''} ${n.id === lotId ? 'focus' : ''}`}>
            <rect width={W} height={H} rx={8} /><text x={10} y={20} className="num">{n.code}</text>
            <text x={10} y={38} className="t2">{n.basis} · {kg(n.on_hand_g)}</text><text x={10} y={52} className="t2">{n.status === 'quarantined' ? 'on hold' : n.status}</text></g> })}
      </svg></div>
      <form className="ops-row" onSubmit={(e) => {
        e.preventDefault()
        act(async () => { const r = await ops.traceHold(lotId, { idem: newIdem(), reason: why.trim() }); setHeld(r.held.map((h) => h.lot).join(', ') || 'none'); return r }, 'Trace hold placed')
      }} data-testid="trace-hold-form">
        <input className="input sm" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Why is this material being traced? (e.g. contamination reported)" aria-label="Reason for trace hold" minLength={5} required />
        <button className="btn sm danger" data-testid="trace-hold">Hold this lot and everything made from it</button>
      </form>
      {held && <p className="small" data-testid="trace-held">Put on hold: {held}. A recall review task was added for each lot.</p>}
    </div>
  )
}

function QualityTrade({ d, ops, act }: { d: PassportDetail; ops: Ops; act: Act }) {
  const dry = d.lots.filter((l) => l.basis === 'dry')
  const [q, setQ] = useState({ lot_id: dry[0]?.id ?? '', analyte: 'loss on drying', result: '', unit: '%', criterion_op: '<=', criterion_value: '', criterion_source: '' })
  const sidem = useIdem()
  const [s, setS] = useState({ lot_id: dry[0]?.id ?? '', qty: '', destination_country: '', cross_border: true })
  const [rv, setRv] = useState('')
  return (
    <div className="ops-qt">
      <form className="ops-form" onSubmit={async (e) => {
        e.preventDefault()
        await act(() => ops.quality({ lot_id: q.lot_id, analyte: q.analyte, result: q.result === '' ? null : +q.result, unit: q.unit,
          criterion_op: q.criterion_value === '' ? null : q.criterion_op, criterion_value: q.criterion_value === '' ? null : +q.criterion_value, criterion_source: q.criterion_source || null }), 'Lab result linked')
      }} data-testid="quality-form">
        <h3 className="label">Link a laboratory result</h3>
        <label>Lot<select className="input sm" value={q.lot_id} onChange={(e) => setQ({ ...q, lot_id: e.target.value })} required><option value="">choose…</option>{d.lots.map((l) => <option key={l.id} value={l.id}>{l.code} ({l.basis})</option>)}</select></label>
        <label>Test<input className="input sm" value={q.analyte} onChange={(e) => setQ({ ...q, analyte: e.target.value })} /></label>
        <label>Result<input className="input sm" type="number" step="any" value={q.result} onChange={(e) => setQ({ ...q, result: e.target.value })} /></label>
        <label>Unit<input className="input sm" value={q.unit} onChange={(e) => setQ({ ...q, unit: e.target.value })} /></label>
        <label>Documented limit<span className="ops-pair"><select className="input sm" value={q.criterion_op} onChange={(e) => setQ({ ...q, criterion_op: e.target.value })}><option>{'<='}</option><option>{'<'}</option><option>{'>='}</option><option>{'>'}</option></select>
          <input className="input sm" type="number" step="any" placeholder="value" value={q.criterion_value} onChange={(e) => setQ({ ...q, criterion_value: e.target.value })} /></span></label>
        <label>Where the limit comes from<input className="input sm" placeholder="e.g. buyer specification v2" value={q.criterion_source} onChange={(e) => setQ({ ...q, criterion_source: e.target.value })} /></label>
        <button className="btn primary">Link result</button>
        <p className="tiny dim">EthnoHarvest compares numbers against the limit you document. It does not certify safety or quality; a quality reviewer decides.</p>
      </form>
      <table className="ops-table"><thead><tr><th>Lot</th><th>Test</th><th className="r">Result</th><th>Limit</th><th>Outcome</th></tr></thead>
        <tbody>{d.quality_tests.map((t) => <tr key={t.id}><td className="num">{d.lots.find((l) => l.id === t.lot_id)?.code}</td><td>{t.analyte}</td><td className="r num">{t.result ?? 'missing'} {t.unit}</td><td className="small">{t.criterion ?? 'none documented'}</td>
          <td><span className={`pill ${t.outcome === 'within-criterion' ? 'good' : t.outcome === 'outside-criterion' ? 'bad' : 'review'}`}>{t.outcome.replace(/-/g, ' ')}</span></td></tr>)}
          {!d.quality_tests.length && <tr><td colSpan={5} className="dim">No lab results linked.</td></tr>}</tbody></table>

      <form className="ops-form" onSubmit={async (e) => {
        e.preventDefault()
        if (await act(() => ops.shipment(d.id, { idem: sidem.key, lot_id: s.lot_id, qty: +s.qty, unit: 'kg', destination_country: s.destination_country, cross_border: s.cross_border }), 'Shipment prepared; stock reserved')) sidem.rotate()
      }} data-testid="shipment-form">
        <h3 className="label">Prepare a transfer / shipment</h3>
        <label>Lot<select className="input sm" value={s.lot_id} onChange={(e) => setS({ ...s, lot_id: e.target.value })} required><option value="">choose…</option>{d.lots.filter((l) => l.available_g > 0).map((l) => <option key={l.id} value={l.id}>{l.code} · {kg(l.available_g)}</option>)}</select></label>
        <label>Quantity (kg)<input className="input sm" type="number" step="0.01" required value={s.qty} onChange={(e) => setS({ ...s, qty: e.target.value })} /></label>
        <label>Destination country<input className="input sm" required value={s.destination_country} onChange={(e) => setS({ ...s, destination_country: e.target.value })} /></label>
        <label className="ops-check"><input type="checkbox" checked={s.cross_border} onChange={(e) => setS({ ...s, cross_border: e.target.checked })} /> crosses a border</label>
        <button className="btn">Prepare shipment</button>
      </form>
      {d.shipments.map((sh) => (
        <div key={sh.id} className="ops-ship" data-testid="shipment">
          <p><b>{kg(sh.qty_g)}</b> to {sh.destination_country} · <span className="pill info">{sh.status}</span></p>
          <ul>{sh.checklist.map((c, i) => <li key={i} className={c.ok ? 'ok' : 'warn'}>{c.ok ? '✓' : '○'} {c.item}{c.note ? <span className="tiny dim"> ({c.note})</span> : null}</li>)}</ul>
          {sh.status === 'prepared' && d.reviews.some((r) => r.target === 'transfer' && r.decision === 'approve') && (
            <button className="btn sm" onClick={() => act(() => ops.dispatch({ idem: newIdem(), shipment_id: sh.id }), 'Dispatched; stock reduced')}>Record dispatch</button>
          )}
        </div>
      ))}
      <div className="ops-form ops-decide">
        <h3 className="label">Authorised human decision on transfer</h3>
        <input className="input sm" placeholder="Reason / who reviewed what" value={rv} onChange={(e) => setRv(e.target.value)} />
        <div className="ops-row">
          <button className="btn sm primary" onClick={() => act(() => ops.review(d.id, { target: 'transfer', decision: 'approve', reason: rv }), 'Decision recorded')}>Record approval</button>
          <button className="btn sm" onClick={() => act(() => ops.review(d.id, { target: 'transfer', decision: 'request-changes', reason: rv }), 'Decision recorded')}>Request changes</button>
        </div>
        <p className="tiny dim">Recorded as an internal decision by a person with authority. It is not a permit or an official approval.</p>
        {d.reviews.map((r) => <p key={r.id} className="small">{r.target}: <b>{r.decision}</b> by {r.role} · “{r.reason}”</p>)}
      </div>
    </div>
  )
}

function Documents({ d, ops, act, synthetic }: { d: PassportDetail; ops: Ops; act: Act; synthetic: boolean }) {
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [packets, setPackets] = useState<Awaited<ReturnType<Ops['samples']>>['packets']>([])
  const [pk, setPk] = useState('')
  useEffect(() => { if (synthetic) ops.samples().then((r) => { setPackets(r.packets); setPk(r.packets[0]?.id ?? '') }).catch(() => setPackets([])) }, [ops, synthetic])
  const chosen = packets.find((p) => p.id === pk)
  return (
    <div className="ops-docs">
      {synthetic && packets.length > 0 && (
        <div className="ops-samples" data-testid="samples">
          <p className="label">Try a synthetic document packet</p>
          <div className="ops-row">
            <select className="input sm" value={pk} onChange={(e) => setPk(e.target.value)} aria-label="Sample packet" data-testid="sample-select">
              {packets.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.passport.species.split(' ')[0]} {p.passport.organ}</option>)}
            </select>
            <button className="btn sm soil" disabled={busy || !pk} data-testid="sample-load" onClick={async () => {
              setBusy(true); await act(() => ops.loadSample(d.id, pk), `Loaded ${pk}: ${chosen?.files.length} documents read and cross-checked`); setBusy(false)
            }}>{busy ? 'Reading…' : 'Upload this packet'}</button>
          </div>
          {chosen && <p className="tiny dim">{chosen.story} <span className="warn">Every page is watermarked SYNTHETIC; nothing here is a real permit, slip or lab report.</span></p>}
        </div>
      )}
      <div className="ops-upload">
        <input ref={fileRef} type="file" accept="application/pdf" aria-label="Upload a PDF document" data-testid="doc-upload" />
        <button className="btn primary" disabled={busy} data-testid="doc-upload-btn" onClick={async () => {
          const f = fileRef.current?.files?.[0]
          if (!f) return
          setBusy(true)
          await act(() => ops.upload(d.id, f), 'Document read and cross-checked')
          setBusy(false)
          if (fileRef.current) fileRef.current.value = ''
        }}>{busy ? 'Reading document…' : 'Upload & check PDF'}</button>
        <p className="tiny dim">PDF only, up to 10 MB. Text is extracted on this machine; if AI extraction is enabled only the extracted text (never the file) is sent to the language model. A document being readable does not make it authentic: issuers confirm validity.</p>
      </div>
      {d.issues.length > 0 && (
        <section data-testid="issues">
          <h3 className="label">Cross-document checks</h3>
          <ul className="ops-issues">{d.issues.map((i) => (
            <li key={i.id} className={`iss sev-${i.severity}`}><span className={`pill ${i.severity === 'consistent' ? 'good' : i.severity === 'mismatch' ? 'bad' : 'review'}`}>{i.severity}</span> <b>{i.category}</b>: {i.message}
              <EvidenceList ev={i.evidence} /></li>
          ))}</ul>
        </section>
      )}
      {d.documents.map((doc) => <DocCard key={doc.id} doc={doc} ops={ops} act={act} />)}
      {!d.documents.length && <p className="small dim">No documents yet.</p>}
    </div>
  )
}

function EvidenceList({ ev }: { ev: unknown }) {
  if (!Array.isArray(ev) || !ev.length) return null
  return <ul className="ops-ev">{(ev as { doc?: string; field?: string; value?: string; page?: number; snippet?: string }[]).map((e, i) => (
    <li key={i} className="tiny"><span className="num">{e.doc}</span>{e.page ? ` p.${e.page}` : ''}: {e.field} = <b>{e.value}</b>{e.snippet ? <span className="dim"> “{e.snippet}”</span> : null}</li>
  ))}</ul>
}

function DocCard({ doc, ops, act }: { doc: PassportDetail['documents'][number]; ops: Ops; act: Act }) {
  const fields = doc.extraction?.fields ?? []
  const [edit, setEdit] = useState<string | null>(null)
  const [val, setVal] = useState('')
  return (
    <article className="ops-doc" data-testid="document">
      <header className="ops-row"><b>{doc.filename}</b><span className="pill info">{doc.doc_kind.replace(/_/g, ' ')}</span>
        {doc.synthetic_marked ? <span className="pill review">marked SYNTHETIC</span> : null}
        <span className={`pill ${doc.status === 'extracted' ? 'good' : 'review'}`}>{doc.status}</span>
        <span className="tiny dim num">sha256 {doc.sha256.slice(0, 12)}… · {doc.pages} p · v{doc.version}</span>
        <a className="linkish tiny" href={ops.fileUrl(doc.id)} target="_blank" rel="noreferrer">open PDF</a></header>
      <p className="tiny dim">Issuer verification: {doc.issuer_verification}</p>
      {doc.extraction?.reason && <p className="small warn">{doc.extraction.reason}</p>}
      {(doc.extraction?.missing_expected?.length ?? 0) > 0 && <p className="small warn">Not found: {doc.extraction!.missing_expected!.map((m) => m.replace(/_/g, ' ')).join(', ')}. Checks needing these were skipped.</p>}
      <table className="ops-table small"><thead><tr><th>Field</th><th>Value</th><th>Page</th><th>Confidence</th><th /></tr></thead>
        <tbody>{fields.map((f) => (
          <tr key={f.id}><td>{f.name.replace(/^qc:/, 'result: ').replace(/^limit:/, 'limit: ').replace(/_/g, ' ')}</td>
            <td>{edit === f.id ? <input className="input sm" value={val} onChange={(e) => setVal(e.target.value)} /> : <>{f.value ?? <span className="dim">not found</span>}{f.normalised && f.normalised.toLowerCase() !== (f.value ?? '').toLowerCase() ? <span className="dim"> → {f.normalised}</span> : null}</>}
              {f.status === 'corrected' && <span className="ops-prov ops-prov-user-supplied">corrected</span>}</td>
            <td className="num">{f.page ?? '—'}</td><td className="num">{f.confidence != null ? `${Math.round(f.confidence * 100)}%` : '—'} <span className="tiny dim">{f.method}</span></td>
            <td>{edit === f.id ? <><button className="btn sm primary" onClick={async () => { if (await act(() => ops.correctField(f.id, val, 'manual correction'), 'Correction logged; checks re-run')) setEdit(null) }}>Save</button>
              <button className="btn sm quiet" onClick={() => setEdit(null)}>Cancel</button></>
              : <button className="linkish tiny" onClick={() => { setEdit(f.id); setVal(f.value ?? '') }}>correct</button>}</td></tr>
        ))}</tbody></table>
    </article>
  )
}

function Activity({ d }: { d: PassportDetail }) {
  return (
    <div>
      <h3 className="label">What EthnoHarvest did for you</h3>
      <ol className="ops-timeline" data-testid="timeline">
        {[...d.events].reverse().map((e) => (
          <li key={e.id}><span className="num dim">{time(e.ts)}</span> <b>{e.kind}</b>{e.to_status ? ` → ${e.to_status}` : ''} <span className="dim">· {e.actor_role}</span>{e.note ? <div className="small">{e.note}</div> : null}</li>
        ))}
      </ol>
      <ExpertDrawer title="Full audit trail">
        <ul className="ops-mini">{d.audit_trail.map((a) => <li key={a.seq}><span className="dim num">{time(a.ts)}</span> {a.actor_role} · {a.entity} · {a.action}</li>)}</ul>
      </ExpertDrawer>
    </div>
  )
}

function time(ts: number) {
  const d = new Date(ts * 1000)
  return `${d.toISOString().slice(0, 10)} ${d.toTimeString().slice(0, 5)}`
}

export function Section({ title, children }: { title: string; children: ReactNode }) { return <section><h3 className="label">{title}</h3>{children}</section> }
