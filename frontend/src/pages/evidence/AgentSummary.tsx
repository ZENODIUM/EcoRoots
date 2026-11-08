import { useState } from 'react'
import { Card, Stat, Table } from '../../ui/kit'
import { G, T } from '../../ui/terms'

// Right-rail summary of a standalone Harvest Evidence Agent run: findings first, each with the proof behind it.

type Proof = { quote: string; doi?: string | null; title?: string | null; url?: string | null; triage?: string; jev_confidence?: number | null }
type Finding = { text: string; scope: string; process: string; direction: string | null; computed?: boolean; review?: string; review_by?: string
  proof: Proof[]; flags: { kind: string; text?: string; detail?: string }[] }
type Summary = { retrieved?: number; triage?: Record<string, number>; triage_mode?: string; jev_calls?: number; claims?: number; claims_dropped?: number
  verification?: { checked?: number; rejected?: number; mode?: string } | null }
type Stoch = { status: string; groups?: Record<string, { stochastic_lambda?: number; matrices?: number }>; plain?: string } | null

const REVIEW_TEXT: Record<string, string> = {
  publishable_with_caveat: 'Usable with its caveat', needs_expert_review: 'Needs an expert to read', insufficient: 'Too thin to use',
}

export default function AgentSummary({ inputs, outputs, status }: { inputs: Record<string, unknown>; outputs: Record<string, unknown> | null; status: string }) {
  const [open, setOpen] = useState<number | null>(0)
  if (!outputs) return <div className="rail-sec"><p className="label">Evidence agent</p><p className="small dim">{status === 'failed' ? 'The run failed; see the event log.' : 'Working…'}</p></div>
  const findings = (outputs.findings ?? []) as Finding[]
  const a = (outputs.agent ?? {}) as Summary
  const st = outputs.stochastic as Stoch
  const notes = (outputs.pipeline_notes ?? []) as string[]
  return (
    <div data-testid="agent-summary">
      <div className="rail-sec">
        <p className="label">Evidence agent</p>
        <p className="small"><i className="serif">{String(inputs.species)}</i> · {String(inputs.organ)}{inputs.jurisdiction ? ` · ${String(inputs.jurisdiction)}` : ''}</p>
        <div className="stat-row agent-stats">
          <Stat tone="sky" shape="square" value={a.retrieved ?? 0} label="papers read" />
          <Stat tone="plum" shape="hex" value={a.jev_calls ?? 0} label={<T sci="JEV decisions" plain="AI sorting calls" />} />
          <Stat tone="green" shape="leaf" value={a.claims ?? 0} label="quoted findings" />
          {a.verification && <Stat tone="rose" shape="round" value={a.verification.rejected ?? 0} label="rejected by 2nd model" />}
        </div>
        {notes.length > 0 && <ul className="tiny dim">{notes.map((n) => <li key={n}>{n}</li>)}</ul>}
      </div>
      <div className="rail-sec">
        <p className="label">Findings ({findings.length})</p>
        {findings.length === 0 && <p className="small dim">Nothing usable was found for this plant part. That is a result, not a zero effect.</p>}
        <ol className="findings">
          {findings.map((f, i) => (
            <li key={i} className={`finding ${f.computed ? 'computed' : 'quoted'}`} data-testid="agent-finding">
              <p className="small">{f.text}</p>
              <p className="tiny">
                <span className={`chip ${f.computed ? 'st-available' : 'st-enabled-with-caveats'}`}>{f.computed ? 'computed here' : 'found in papers'}</span>
                {f.scope !== 'same-species' && <span className="chip st-unknown">other species</span>}
                {f.review && <span className="chip">{REVIEW_TEXT[f.review] ?? f.review}</span>}
              </p>
              <button className="btn sm ghost" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)} data-testid="proof-toggle">
                Proof ({f.proof.length}) {open === i ? '▾' : '▸'}
              </button>
              {open === i && (
                <ul className="proof">
                  {f.proof.map((p, j) => (
                    <li key={j}>
                      <blockquote className="small">“{p.quote}”</blockquote>
                      <p className="tiny dim">
                        {p.url ? <a href={p.url} target="_blank" rel="noreferrer">{p.title ?? p.doi}</a> : p.title}
                        {p.jev_confidence != null && ` · JEV ${Math.round(p.jev_confidence * 100)}% sure`}
                      </p>
                    </li>
                  ))}
                  {f.flags.map((fl, j) => <li key={`f${j}`} className="tiny warn">⚠ {fl.text ?? fl.detail ?? fl.kind}</li>)}
                </ul>
              )}
            </li>
          ))}
        </ol>
      </div>
      {st?.status === 'ok' && st.groups && (
        <div className="rail-sec">
          <p className="label">Good and bad years</p>
          {st.plain && <p className="small">{st.plain}</p>}
          <details className="tiny"><summary>Science behind this</summary>
            <ul>{Object.entries(st.groups).map(([g, v]) => <li key={g} className="mono">{g}: stochastic λ {v.stochastic_lambda?.toFixed(3) ?? '—'} ({v.matrices ?? 0} matrices)</li>)}</ul>
            <p>Triage: {a.triage_mode}. JEV accuracy on the rubric-labelled E11 set (not expert-labelled) was similar to keyword rules; decisions are advisory.</p>
          </details>
        </div>
      )}
      <ContextCards ctx={(outputs.context ?? {}) as Ctx} />
      <p className="tiny dim rail-sec">No harvest rate, quota or permit is implied. Click any node to see its inputs and outputs.</p>
    </div>
  )
}

/* ---------------------------------------------------------------- opt-in context nodes */
type Ctx = {
  cites_lookup?: { status: string; listed?: boolean; appendices?: string[] | null; caveat?: string; url?: string | null }
  eligibility_gate?: { overall_tier: string; quota_answer: string; tasks: { task: string; status: string; reason: string }[] }
  harvest_compare?: { status: string; plain?: string; studies: { study: string; design?: string; control_lambda?: number; harvested_lambda?: number; difference?: number; status?: string }[] }
  recovery_rotation?: { status: string; study?: string; cycles: { rest_years: number; yearly_growth: number }[]; years_to_recover?: number | null; caveat?: string }
  methods_lookup?: { status: string; part?: string; process?: string; methods?: { label: string; touches: string; measure: string[] }[] }
  identity_check?: { status: string; growth_form?: string; lookalikes?: string[]; flowering_time_data?: string }
  evidence_gaps?: { status: string; budget?: string; next_steps?: { item: string; cost: number; why: string[] }[]; unlocks?: string[] }
}
const TASK_TONE: Record<string, 'green' | 'gold' | 'rose' | 'grey'> = { enabled: 'green', 'enabled-with-caveats': 'gold', blocked: 'rose', unknown: 'grey' }

function ContextCards({ ctx }: { ctx: Ctx }) {
  if (!Object.keys(ctx).length) return null
  const growth = (x: number) => (x > 1.005 ? 'grows' : x < 0.995 ? 'shrinks' : 'about stable')
  return (
    <div className="rail-sec ctx-cards" data-testid="context-cards">
      <p className="label">Context steps</p>
      {ctx.cites_lookup && (
        <Card title={<G k="cites">CITES trade listing</G>} tone="sky">
          <p className="small">{ctx.cites_lookup.listed ? <>Listed in Appendix <b>{ctx.cites_lookup.appendices?.join(', ')}</b></> : ctx.cites_lookup.status === 'available' ? 'Not listed' : `Unknown (${ctx.cites_lookup.status})`}</p>
          <p className="tiny dim">{ctx.cites_lookup.caveat}</p>
        </Card>
      )}
      {ctx.eligibility_gate && (
        <Card title={<T sci="Eligibility gate" plain="What the data allows" />} tone="green">
          <p className="small"><G k="tier" /> <b>{ctx.eligibility_gate.overall_tier}</b> · {ctx.eligibility_gate.quota_answer}</p>
          <ul className="ctx-tasks">{ctx.eligibility_gate.tasks.map((t) => (
            <li key={t.task}><span className={`tchip t-${TASK_TONE[t.status] ?? 'grey'}`}>{t.status}</span> {t.task.replace(/_/g, ' ')}<span className="tiny dim"> · {t.reason}</span></li>))}</ul>
        </Card>
      )}
      {ctx.harvest_compare && (
        <Card title={<T sci="Harvested vs control λ" plain="Harvested vs untouched plots" />} tone="gold">
          {ctx.harvest_compare.studies.length === 0 ? <p className="small dim">{ctx.harvest_compare.status}</p> : ctx.harvest_compare.studies.map((r) => (
            <div key={r.study} className="ctx-cmp">
              <p className="tiny dim">{r.study} · {r.design}</p>
              {r.control_lambda != null && r.harvested_lambda != null ? (
                <div className="ctx-bars">
                  <span>untouched <b>{r.control_lambda}</b> <i className="tiny dim">({growth(r.control_lambda)})</i></span>
                  <span>harvested <b>{r.harvested_lambda}</b> <i className="tiny dim">({growth(r.harvested_lambda)})</i></span>
                </div>) : <p className="tiny dim">{r.status}</p>}
            </div>))}
          {ctx.harvest_compare.plain && <p className="tiny dim">{ctx.harvest_compare.plain}</p>}
        </Card>
      )}
      {ctx.recovery_rotation && (
        <Card title="Recovery and rest years" tone="lime">
          {ctx.recovery_rotation.cycles.length === 0 ? <p className="small dim">{ctx.recovery_rotation.status}</p> : (<>
            <Table rowKey={(r) => String(r.rest_years)} rows={ctx.recovery_rotation.cycles} cols={[
              { key: 'rest_years', label: 'Rest years after one harvest', num: true },
              { key: 'yearly_growth', label: <T sci="Annualised λ" plain="Yearly growth" />, num: true, render: (r) => <span className={r.yearly_growth >= 1 ? 'ok' : 'warn'}>{r.yearly_growth.toFixed(3)}</span> },
            ]} />
            <p className="tiny dim">{ctx.recovery_rotation.years_to_recover != null ? `Back to the starting number after ${ctx.recovery_rotation.years_to_recover} year(s) in the model. ` : 'Did not recover within the modelled years. '}{ctx.recovery_rotation.caveat}</p>
          </>)}
        </Card>
      )}
      {ctx.methods_lookup?.methods && (
        <Card title={`Harvest methods: ${ctx.methods_lookup.part}`} tone="clay">
          <ul className="small">{ctx.methods_lookup.methods.map((m) => <li key={m.label}><b>{m.label}</b> <span className="dim">touches {m.touches}; measure {m.measure.join(', ')}</span></li>)}</ul>
        </Card>
      )}
      {ctx.identity_check && (
        <Card title="Look-alikes and timing data" tone="plum">
          <p className="small">{ctx.identity_check.lookalikes?.length ? <>Rule out: <i>{ctx.identity_check.lookalikes.join(', ')}</i></> : 'No known look-alikes or synonyms in our table.'}</p>
          <p className="tiny dim">{ctx.identity_check.growth_form} · <G k="phenology">flowering-time data</G>: {ctx.identity_check.flowering_time_data}</p>
        </Card>
      )}
      {ctx.evidence_gaps?.next_steps && (
        <Card title="What to measure next" tone="rose">
          <ol className="ctx-steps">{ctx.evidence_gaps.next_steps.map((n) => <li key={n.item}><b>{n.item}</b> <span className="tiny dim">· {n.cost} days · {n.why[0]}</span></li>)}</ol>
          <p className="tiny dim">Budget {ctx.evidence_gaps.budget}. Unlocks: {ctx.evidence_gaps.unlocks?.map((u) => u.replace(/_/g, ' ')).join(', ') || 'none'}.</p>
        </Card>
      )}
    </div>
  )
}
