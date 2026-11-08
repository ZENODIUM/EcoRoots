import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { useSelection } from '../store'
import './evidence.css'
import WorkflowBuilder from './evidence/WorkflowBuilder'
import AgentSummary from './evidence/AgentSummary'
import { Book, Card, Stat, Table, type Tone } from '../ui/kit'
import { G, T } from '../ui/terms'

type GraphNode = { id: string; label: string; parents: string[] }
type Ev = { seq: number; ts: number; node: string; state: string; payload: Record<string, unknown> }
type Jev = { id: string; question: string; choice: string; confidence: number; model?: string; accepted?: boolean; input_fields?: Record<string, unknown>; probabilities?: Record<string, number>; fallback?: string; [k: string]: unknown }
type RunRow = { id: string; kind: string; label: string; status: string; created: number; finished: number | null }
type Experiment = { id: string; title: string; question: string; hypothesis: string; method: string; data: string; status: string; finding: string; command: string; ran_utc: string; registered_utc: string; error: string | null }

const INJECT = [
  ['provider_failure', 'Geospatial provider fails'],
  ['unknown_study', 'Unknown study requested'],
  ['low_jev_confidence', 'JEV returns low confidence'],
  ['unsupported_population_model', 'No usable population model'],
  ['jev_unavailable', 'JEV unavailable'],
  ['groq_unavailable', 'Explanation model unavailable'],
] as const
const STATE_ORDER = ['queued', 'running', 'completed', 'human-review', 'blocked', 'skipped', 'failed']
// plain words for run and step states; the technical state stays in data attributes and the hidden alternate
const STATE_WORD: Record<string, string> = { queued: 'waiting', running: 'working', completed: 'done', 'human-review': 'needs a person',
  blocked: 'blocked', skipped: 'skipped', failed: 'failed', pending: 'not started', 'completed-with-failures': 'done, with problems' }
const STATE_TONE: Record<string, Tone> = { completed: 'green', 'human-review': 'gold', blocked: 'clay', skipped: 'grey', failed: 'rose', running: 'sky', queued: 'grey' }
const STATUS_TONE: Record<string, Tone> = { replicated: 'green', 'validated within scope': 'lime', exploratory: 'sky', inconclusive: 'gold', 'failed/negative': 'rose' }
const STATUS_PLAIN: Record<string, string> = { replicated: 'held up again', 'validated within scope': 'held up (within limits)', exploratory: 'early look',
  inconclusive: 'no clear answer', 'failed/negative': 'did not hold up' }

function runFromHash() { return new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('run') }
const decode = (s: string) => { const t = document.createElement('textarea'); t.innerHTML = s; return t.value.replace(/<[^>]+>/g, '') }

export default function Evidence() {
  const [tab, setTab] = useState<'live' | 'builder' | 'registry' | 'sources'>(window.location.hash.includes('builder') ? 'builder' : 'live')
  const [rid, setRid] = useState<string | null>(runFromHash())
  const [runs, setRuns] = useState<RunRow[]>([])
  useEffect(() => {
    const on = () => { const r = runFromHash(); if (r) { setRid(r); setTab('live') } }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const refreshRuns = () => api.json<{ runs: RunRow[] }>('/api/runs').then((r) => setRuns(r.runs)).catch(() => {})
  useEffect(() => { refreshRuns() }, [rid])
  useEffect(() => { if (!rid && runs.length) setRid((runs.find((r) => r.kind === 'assessment') ?? runs.find((r) => r.kind === 'harvestops'))?.id ?? null) }, [runs, rid])

  return (
    <div className="evidence-page">
      <aside className="rail left scroll" aria-label="Runs">
        <div className="rail-sec">
          <div className="tabs" role="tablist">
            {(['live', 'builder', 'registry', 'sources'] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} data-testid={`tab-${t}`}>
                {t === 'live' ? 'Agent runs' : t === 'builder' ? 'Builder' : t === 'registry' ? <T sci="Experiments" plain="Tests we ran" /> : 'Sources'}
              </button>
            ))}
          </div>
        </div>
        <Launcher onStarted={(id) => { setRid(id); setTab('live'); window.location.hash = `#/evidence?run=${id}` }} />
        <div className="rail-sec">
          <p className="label">Recent runs</p>
          <ul className="runlist" data-testid="runlist">
            {runs.filter((r) => r.kind === 'assessment' || r.kind === 'harvestops').slice(0, 25).map((r) => (
              <li key={r.id}>
                <button aria-current={r.id === rid} onClick={() => { setRid(r.id); setTab('live'); window.location.hash = `#/evidence?run=${r.id}` }}>
                  <span className={`chip st-${r.status === 'completed' ? 'available' : r.status === 'running' ? 'enabled-with-caveats' : 'failed'}`}>{r.status.replace('completed-with-failures', 'with failures')}</span>
                  <span className="rl">{r.label.replace(' · assess', '')}</span>
                  <span className="mono dim">{new Date(r.created * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>
      {tab === 'live' && (rid ? <LiveRun key={rid} rid={rid} onDone={refreshRuns} /> : <section className="ev-center"><div className="ev-empty kcard t-sky"><p className="serif">No runs yet</p><p className="small dim">Press <b>Run assessment</b> on the left, build your own pipeline in <b>Builder</b>, or start from a species on Explore. Each run reads the published evidence, shows every step it took, and ends with a summary you can check.</p></div></section>)}
      {tab === 'builder' && <WorkflowBuilder onStarted={(id) => { setRid(id); setTab('live'); window.location.hash = `#/evidence?run=${id}` }} />}
      {tab === 'registry' && <Registry />}
      {tab === 'sources' && <Sources />}
    </div>
  )
}

function Launcher({ onStarted }: { onStarted: (id: string) => void }) {
  const { species, region } = useSelection()
  const [inject, setInject] = useState<string[]>([])
  const [question, setQuestion] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const sp = species ?? 'Nardostachys jatamansi'
  const rg = species ? region : { bbox: [82.4, 28.9, 83.2, 29.5] }
  const go = async () => {
    setErr(null)
    try {
      const r = await api.json<{ run_id: string }>('/api/runs', { method: 'POST', body: JSON.stringify({ species: sp, region: rg, goal: 'assess', question: question || null, inject }) })
      onStarted(r.run_id)
    } catch (e) { setErr((e as Error).message) }
  }
  return (
    <div className="rail-sec launcher">
      <p className="label">New assessment</p>
      <p className="small"><i className="serif">{sp}</i>{rg ? ' · with region' : ' · no region'}</p>
      <input className="input" placeholder="Optional question, e.g. how does rhizome harvest affect growth?" value={question} onChange={(e) => setQuestion(e.target.value)} />
      <details>
        <summary>Fault injection ({inject.length})</summary>
        {INJECT.map(([k, l]) => (
          <label key={k}><input type="checkbox" checked={inject.includes(k)} onChange={(e) => setInject(e.target.checked ? [...inject, k] : inject.filter((x) => x !== k))} data-testid={`inject-${k}`} />{l}</label>
        ))}
      </details>
      <button className="btn primary" onClick={go} data-testid="start-run">Run assessment</button>
      {err && <p className="error">{err}</p>}
    </div>
  )
}

function LiveRun({ rid, onDone }: { rid: string; onDone: () => void }) {
  const [graph, setGraph] = useState<GraphNode[]>([])
  const [events, setEvents] = useState<Ev[]>([])
  const [done, setDone] = useState<string | null>(null)
  const [run, setRun] = useState<{ status: string; inputs: Record<string, unknown>; outputs: Record<string, unknown> | null; jev: Jev[] } | null>(null)
  const [focus, setFocus] = useState<string | null>(null)
  const seen = useRef(new Set<number>())

  useEffect(() => {
    const es = new EventSource(`/api/runs/${rid}/events`)
    es.addEventListener('node', (m) => {
      const e = JSON.parse((m as MessageEvent).data) as Ev
      if (seen.current.has(e.seq)) return
      seen.current.add(e.seq)
      if (e.node === '_graph') setGraph((e.payload as { nodes: GraphNode[] }).nodes)
      else setEvents((prev) => [...prev, e])
    })
    es.addEventListener('done', (m) => { setDone(JSON.parse((m as MessageEvent).data).status); es.close() })
    return () => es.close()
  }, [rid])
  useEffect(() => { if (done) { api.json<typeof run>(`/api/runs/${rid}`).then(setRun).catch(() => {}); onDone() } }, [done, rid]) // eslint-disable-line react-hooks/exhaustive-deps
  // JEV decisions arrive during the run; poll lightly until done
  useEffect(() => {
    if (done) return
    const t = setInterval(() => api.json<typeof run>(`/api/runs/${rid}`).then(setRun).catch(() => {}), 1500)
    return () => clearInterval(t)
  }, [rid, done])

  const state = useMemo(() => {
    const s: Record<string, { state: string; payload: Record<string, unknown>; ts: number }> = {}
    for (const e of events) s[e.node] = { state: e.state, payload: e.payload, ts: e.ts }
    return s
  }, [events])
  const t0 = events[0]?.ts ?? 0
  const jev = run?.jev ?? []

  return (
    <>
      <section className="ev-center scroll">
        <div className="run-head">
          <p className="serif">Run <span className="mono">{rid}</span></p>
          <span className={`chip ${done ? (done === 'completed' ? 'st-available' : 'st-failed') : 'st-enabled-with-caveats'}`} data-testid="run-status">{done ?? 'running'}</span>
          {done && <a className="btn sm" href={`/api/report/${rid}?fmt=html`} target="_blank" rel="noreferrer" data-testid="report-link">Open report</a>}
        </div>
        {graph.length > 0 && <WhatHappened nodes={graph} state={state} />}
        {graph.length > 0 && <Dag nodes={graph} state={state} jev={jev} focus={focus} onFocus={setFocus} />}
        <p className="label ev-log-h">Event log · every state change, in order</p>
        <ol className="log mono" data-testid="event-log" aria-label="Event log" tabIndex={0}>
          {events.filter((e) => e.state !== 'queued').map((e) => (
            <li key={e.seq} className={`s-${e.state}`}>
              <span className="t">+{(e.ts - t0).toFixed(2)}s</span><span className="n">{e.node}</span><span className="st">{e.state}</span>
              <span className="w">{String((e.payload as { why?: string }).why ?? (e.payload as { error?: string }).error ?? '')}</span>
            </li>
          ))}
        </ol>
      </section>
      <aside className="rail right scroll" aria-label="Node inspector" tabIndex={0}>
        {focus ? <NodeInspector id={focus} node={graph.find((g) => g.id === focus)} st={state[focus]} jev={jev} /> : <RunSummary run={run} jev={jev} checks={((state.verify?.payload as { outputs?: { checks?: Check[] } } | undefined)?.outputs?.checks) ?? []} />}
      </aside>
    </>
  )
}

function brief(v: unknown): string {
  if (v == null) return '—'
  if (Array.isArray(v)) return v.length === 0 ? 'none' : typeof v[0] === 'string' ? v.slice(0, 3).join('; ') + (v.length > 3 ? ` (+${v.length - 3})` : '') : `${v.length} items`
  if (typeof v === 'object') return `${Object.keys(v as object).length} fields`
  return String(v).slice(0, 90)
}

// Answer first: a plain list of what each step did, in order, before the graph and the raw event log.
function WhatHappened({ nodes, state }: { nodes: GraphNode[]; state: Record<string, { state: string; payload: Record<string, unknown> }> }) {
  const rows = nodes.filter((n) => state[n.id] && !['queued', 'running'].includes(state[n.id].state))
  if (!rows.length) return null
  return (
    <section className="what-happened" data-testid="what-happened" aria-label="What happened">
      <p className="label">What happened, step by step</p>
      <ol className="steps">
        {rows.map((n, i) => {
          const st = state[n.id]
          const out = (st.payload.outputs ?? {}) as Record<string, unknown>
          const ms = st.payload.duration_ms as number | undefined
          return (
            <li key={n.id} className={`wh-${st.state} t-${STATE_TONE[st.state] ?? 'grey'}`} style={{ ['--i' as string]: i }}>
              <span className="step-dot" aria-hidden>{st.state === 'completed' ? '✓' : st.state === 'failed' ? '!' : st.state === 'human-review' ? '?' : i + 1}</span>
              <div className="step-card">
                <b>{n.label}</b> <span className={`tchip t-${STATE_TONE[st.state] ?? 'grey'}`}><T sci={st.state} plain={STATE_WORD[st.state] ?? st.state} /></span>
                <span className="dim small">{ms != null ? ` ${ms} ms` : ''}{st.payload.recorded_from ? ' · recorded from request' : ''}</span>
                <div className="small wh-kvs">{Object.entries(out).slice(0, 3).map(([k, v]) => <span key={k} className="wh-kv">{k.replace(/_/g, ' ')}: <b>{brief(v)}</b></span>)}
                  {typeof st.payload.error === 'string' && <span className="wh-kv error">{st.payload.error}</span>}</div>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function Dag({ nodes, state, jev, focus, onFocus }: { nodes: GraphNode[]; state: Record<string, { state: string }>; jev: Jev[]; focus: string | null; onFocus: (id: string) => void }) {
  const depth: Record<string, number> = {}
  const d = (id: string): number => {
    if (depth[id] !== undefined) return depth[id]
    const n = nodes.find((x) => x.id === id)
    return (depth[id] = !n || !n.parents.length ? 0 : 1 + Math.max(...n.parents.map(d)))
  }
  nodes.forEach((n) => d(n.id))
  const cols: GraphNode[][] = []
  nodes.forEach((n) => (cols[depth[n.id]] ??= []).push(n))
  // drawn at real size (the panel scrolls sideways for wide runs) so labels stay readable instead of shrinking to fit
  const NW = 184, NH = 66, GX = 36, GY = 14
  const H = Math.max(...cols.map((c) => c.length)) * (NH + GY) + 20
  const W = cols.length * (NW + GX) + 10
  const pos: Record<string, { x: number; y: number }> = {}
  cols.forEach((c, i) => c.forEach((n, j) => { pos[n.id] = { x: 5 + i * (NW + GX), y: (H - c.length * (NH + GY)) / 2 + j * (NH + GY) + GY / 2 } }))
  const jevNodes = new Set<string>(jev.map((j) => (j.question === 'route' ? 'route' : 'triage')))
  const box = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState(false)  // part of the graph is off to the right
  useEffect(() => {
    const el = box.current
    if (!el) return
    const check = () => setMore(el.scrollWidth - el.clientWidth - el.scrollLeft > 8)
    check()
    el.addEventListener('scroll', check)
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', check); ro.disconnect() }
  }, [W])
  return (
    <figure className={`dag ${more ? 'more' : ''}`} data-testid="dag">
      <div className="dag-scroll" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="group" aria-label="Agent decision graph">
        {nodes.flatMap((n) => n.parents.map((p) => {
          const a = pos[p], b = pos[n.id]
          const active = ['completed', 'human-review'].includes(state[p]?.state ?? '')
          return <path key={p + n.id} d={`M ${a.x + NW} ${a.y + NH / 2} C ${a.x + NW + GX / 2 + 8} ${a.y + NH / 2}, ${b.x - GX / 2 - 8} ${b.y + NH / 2}, ${b.x} ${b.y + NH / 2}`}
            fill="none" stroke={active ? '#608F73' : '#1c3a2f'} strokeWidth={active ? 1.6 : 1} />
        }))}
        {nodes.map((n) => {
          const s = state[n.id]?.state ?? 'pending'
          const { x, y } = pos[n.id]
          return (
            <g key={n.id} className={`node s-${s} ${focus === n.id ? 'focus' : ''}`} transform={`translate(${x},${y})`} onClick={() => onFocus(n.id)} role="button" tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && onFocus(n.id)} data-node={n.id} data-state={s}>
              <rect width={NW} height={NH} rx={4} />
              <text x={10} y={20} className="nid">{wrap(n.label + (jevNodes.has(n.id) ? ' ◆' : ''), 24).map((l, i) => <tspan key={i} x={10} dy={i ? 16 : 0}>{l}</tspan>)}<title>{`${n.label} (${n.id})`}</title></text>
              <text x={10} y={57} className="nst">{s}</text>
              <title>{n.label}</title>
            </g>
          )
        })}
      </svg>
      </div>
      <figcaption>
        {STATE_ORDER.map((s) => <span key={s} className={`lg s-${s}`}><i />{s}</span>)}
        <span className="lg"><b>◆</b> JEV decision</span>
        {more && <span className="lg dag-more">scroll sideways to see all {nodes.length} steps →</span>}
      </figcaption>
    </figure>
  )
}

function Json({ v }: { v: unknown }) {
  const s = JSON.stringify(v, (_k, x) => (typeof x === 'string' ? decode(x) : x), 2) ?? ''
  return <pre className="json">{s.length > 6000 ? s.slice(0, 6000) + '\n… (truncated)' : s}</pre>
}

function NodeInspector({ id, node, st, jev }: { id: string; node?: GraphNode; st?: { state: string; payload: Record<string, unknown> }; jev: Jev[] }) {
  const mine = jev.filter((j) => (id === 'route' ? j.question === 'route' : id === 'triage' ? j.question !== 'route' : false))
  return (
    <div className="inspector-node" data-testid="node-inspector">
      <div className="rail-sec">
        <p className="label">Node</p>
        <h3 className="serif">{node?.label ?? id}</h3>
        <p className="small"><span className={`chip s-chip-${st?.state ?? 'pending'}`}>{st?.state ?? 'pending'}</span>{st?.payload?.duration_ms !== undefined && <span className="mono dim"> · {String(st.payload.duration_ms)} ms</span>}</p>
        {Boolean(st?.payload?.why) && <p className="note">{String(st!.payload.why)}</p>}
      </div>
      {mine.length > 0 && (
        <div className="rail-sec">
          <p className="label">JEV decisions · TypeSafe System One</p>
          <ul className="jev">
            {mine.map((j) => (
              <li key={j.id}>
                <p className="small">{j.input_fields?.title ? decode(String(j.input_fields.title)) : j.question}</p>
                <p className="mono small"><b>{j.choice}</b> · confidence {j.confidence?.toFixed(2)} · {j.accepted === false ? 'below 0.85: rules used, human review' : 'accepted'}</p>
              </li>
            ))}
          </ul>
          <p className="small dim">JEV can route and triage. It cannot change a number or an eligibility decision.</p>
        </div>
      )}
      {st && Object.keys((st.payload.outputs ?? {}) as object).length > 0 && (
        <div className="rail-sec"><p className="label">What this step produced</p>
          <dl className="kv">{Object.entries(st.payload.outputs as Record<string, unknown>).slice(0, 12).map(([k, v]) => (
            <div key={k}><dt>{k.replace(/_/g, ' ')}</dt><dd>{brief(v)}</dd></div>))}</dl>
        </div>
      )}
      {st && <details className="rail-sec raw" open={!st.payload.outputs}><summary className="label">Raw data (payload)</summary><Json v={st.payload} /></details>}
    </div>
  )
}

type Check = { check: string; pass: boolean; detail: string }
function RunSummary({ run, jev, checks: verify }: { run: { status: string; inputs: Record<string, unknown>; outputs: Record<string, unknown> | null } | null; jev: Jev[]; checks: Check[] }) {
  if (!run) return <div className="rail-sec"><p className="label">Summary</p><p className="small dim">Waiting for the run…</p></div>
  const o = run.outputs ?? {}
  if (run.inputs?.event === 'evidence-agent') return <AgentSummary inputs={run.inputs} outputs={run.outputs} status={run.status} />
  if (run.inputs?.event) {  // HarvestOps subgraph run: point back at the passport instead of an assessment answer
    return (
      <div data-testid="run-summary" className="rail-sec">
        <p className="label">HarvestOps run</p>
        <p className="small">Event: <b>{String(run.inputs.event).replace(/_/g, ' ')}</b>{run.inputs.recorded_from ? ' (work done in the request; this run records its results)' : ''}</p>
        <p className="small dim">{Object.entries(o).filter(([k]) => k !== 'passport_id').map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(' · ')}</p>
        <a className="btn sm soil" href="#/plan/ops" onClick={() => { try { useSelection.getState().setPassport(String(run.inputs.passport_id)) } catch { /* ignore */ } }}>Open the passport</a>
        <p className="tiny dim" style={{ marginTop: 8 }}>Click any node to see its inputs and outputs.</p>
      </div>
    )
  }
  const env = (o.envelope ?? {}) as { quota_answer?: string; evidence_tier?: string; datasets?: string[] }
  const explain = (o.explain ?? {}) as { summary?: string; mode?: string; grounding?: { passed?: boolean } }
  return (
    <div data-testid="run-summary">
      <div className="rail-sec">
        <Card title={<T sci="Answer (quota_answer)" plain="What we can say about harvest limits" />} tone="gold">
          <p className="quota-answer serif">{env.quota_answer ?? '—'}</p>
          <p className="small dim"><G k="tier" /> {env.evidence_tier ?? '—'} · click any step in the map to inspect it</p>
        </Card>
      </div>
      {explain.summary && (
        <div className="rail-sec">
          <p className="label">Plain-language summary</p>
          <p className="small">{explain.summary}</p>
          <p className="src">{explain.mode ?? 'generated'} · numbers checked against the engine state</p>
        </div>
      )}
      {verify.length > 0 && (
        <div className="rail-sec"><p className="label">Verification checks</p>
          <ul className="checks tiles">{verify.map((c) => <li key={c.check} className={`${c.pass ? 'ok t-green' : 'bad t-rose'}`}><span>{c.pass ? '✓' : '✗'}</span>{c.check}<span className="mono dim">{c.detail}</span></li>)}</ul>
        </div>
      )}
      <div className="rail-sec">
        <p className="label"><G k="jev">JEV</G> decisions ({jev.length})</p>
        {jev.length > 0 && <Table rowKey={(j) => j.id} max={8} rows={jev} cols={[
          { key: 'question', label: 'Question' },
          { key: 'choice', label: 'Choice', render: (j) => <b>{j.choice}</b> },
          { key: 'confidence', label: 'Sure', num: true, render: (j) => `${Math.round((j.confidence ?? 0) * 100)}%` },
          { key: 'accepted', label: 'Used', render: (j) => (j.accepted === false ? 'fallback' : 'yes'), sort: (j) => (j.accepted === false ? 0 : 1) },
        ]} />}
        {jev.length > 0 && <p className="small dim">On the rubric-labelled E11 set (not expert-labelled), JEV triage was no better than keyword rules on the latest run; decisions are advisory.</p>}
      </div>
      {(env.datasets?.length ?? 0) > 0 && <div className="rail-sec"><p className="label">Datasets used</p><p className="small">{env.datasets!.join(' · ')}</p></div>}
    </div>
  )
}

function Registry() {
  const [ex, setEx] = useState<Experiment[]>([])
  const [open, setOpen] = useState<string | null>('E03')
  useEffect(() => { api.json<Record<string, Experiment>>('/api/experiments').then((r) => setEx(Object.values(r))).catch(() => {}) }, [])
  const counts = ex.reduce<Record<string, number>>((a, e) => ({ ...a, [e.status]: (a[e.status] ?? 0) + 1 }), {})
  const idx = Math.max(0, ex.findIndex((e) => e.id === open))
  const when = (t?: string) => t?.slice(0, 16).replace('T', ' ')
  return (
    <section className="ev-center ev-wide scroll" data-testid="registry">
      <div className="run-head"><p className="serif"><T sci="Pre-registered experiments" plain="Tests we wrote down before running them" /></p></div>
      <div className="stat-row">
        {Object.entries(counts).map(([k, v]) => <Stat key={k} tone={STATUS_TONE[k] ?? 'grey'} shape={k === 'failed/negative' ? 'square' : k === 'inconclusive' ? 'hex' : 'round'}
          value={v} label={<T sci={k} plain={STATUS_PLAIN[k] ?? k} />} />)}
      </div>
      <p className="small dim">Each hypothesis was written before its run. Negative and inconclusive results are reported as they came out.</p>
      <div className="reg-grid">
        <ul className="exps" aria-label="Contents">
          {ex.map((e) => (
            <li key={e.id} className={open === e.id ? 'open' : ''}>
              <button onClick={() => setOpen(e.id)} aria-expanded={open === e.id}>
                <span className="mono eid">{e.id}</span><span className="et">{e.title}</span>
                <span className={`tchip t-${STATUS_TONE[e.status] ?? 'grey'}`}><T sci={e.status} plain={STATUS_PLAIN[e.status] ?? e.status} /></span>
              </button>
            </li>
          ))}
        </ul>
        <Book label="Experiment pages" index={idx} onIndex={(i) => setOpen(ex[i]?.id ?? null)} pages={ex.map((e) => ({
          key: e.id,
          tag: <span className="mono eid">{e.id}</span>,
          title: e.title,
          body: (
            <div className="exp-page">
              <p><span className={`tchip t-${STATUS_TONE[e.status] ?? 'grey'}`}>{e.status}</span> <span className="small dim">{STATUS_PLAIN[e.status]}</span></p>
              <div className="kgrid">
                <Card title={<T sci="Question" plain="What we asked" />} tone="sky" icon="?"><p className="small">{e.question}</p></Card>
                <Card title={<T sci="Hypothesis" plain="What we expected" />} tone="plum" icon="→"><p className="small">{e.hypothesis}</p>
                  <p className="tiny dim">registered {when(e.registered_utc)}</p></Card>
                <Card title={<T sci="Data · method" plain="How we tested it" />} tone="grey" icon="≡"><p className="small">{e.data}</p><p className="small dim">{e.method}</p></Card>
              </div>
              <Card title={<T sci="Finding" plain="What we found" />} tone={STATUS_TONE[e.status] ?? 'grey'} icon="★" className="exp-finding"><p className="finding">{e.finding}</p></Card>
              <p className="tiny mono dim">Reproduce: {e.command} · ran {when(e.ran_utc)}</p>
            </div>
          ),
        }))} />
      </div>
    </section>
  )
}

type Manifest = Record<string, { title: string; citation: string; license: string; redistribute_raw: boolean; retrieved_utc: string; status: string; files: { name: string; sha256: string; bytes: number }[] }>
function Sources() {
  const [s, setS] = useState<{ manifest: Manifest; spatial_sources: Record<string, { name: string; url?: string; citation?: string; resolution?: string; licence?: string }>; open_datasets: unknown[]; literature_values: unknown[] } | null>(null)
  useEffect(() => { api.json<typeof s>('/api/sources').then(setS).catch(() => {}) }, [])
  if (!s) return <section className="ev-center ev-wide"><p className="small dim">Loading…</p></section>
  return (
    <section className="ev-center ev-wide scroll" data-testid="sources">
      <div className="run-head"><p className="serif">Data sources and provenance</p></div>
      <table className="src-table ktable">
        <thead><tr><th>dataset</th><th>citation</th><th>licence</th><th>sha-256</th></tr></thead>
        <tbody>
          {Object.entries(s.manifest).map(([k, m]) => (
            <tr key={k}><td><b>{m.title}</b><br /><span className="mono dim">{m.status} · retrieved {m.retrieved_utc?.slice(0, 10)}</span></td><td>{m.citation}</td>
              <td>{m.license}{m.redistribute_raw === false && <><br /><span className="mono dim">raw file not redistributed</span></>}</td>
              <td className="mono dim">{m.files?.map((f) => <div key={f.name} title={f.sha256}>{f.name.slice(0, 26)} {f.sha256?.slice(0, 10)}…</div>)}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="label">Live providers (queried per region, cached)</p>
      <ul className="prov">
        {Object.entries(s.spatial_sources).map(([k, v]) => <li key={k}><b>{v.name}</b> {v.resolution && <span className="mono dim">· {v.resolution}</span>} {v.url && <a href={v.url} target="_blank" rel="noreferrer">source</a>}{v.citation && <span className="small dim"> · {v.citation}</span>}</li>)}
      </ul>
      <p className="small dim">Also catalogued: {s.literature_values.length} literature-derived parameter values and {s.open_datasets.length} open datasets screened for future use (docs/research). Unavailable sources (WDPA, FIRMS, IUCN) are marked pending throughout the app, never filled with defaults.</p>
    </section>
  )
}

/** Up to two lines of about `max` characters, breaking at spaces; the rest becomes an ellipsis. */
function wrap(label: string, max: number): string[] {
  const lines: string[] = ['']
  for (const w of label.split(' ')) {
    const cur = lines[lines.length - 1]
    if (!cur || (cur + ' ' + w).length <= max) lines[lines.length - 1] = cur ? `${cur} ${w}` : w
    else if (lines.length < 2) lines.push(w)
    else { lines[1] = (lines[1] + ' ' + w).slice(0, max - 1) + '…'; break }
  }
  return lines.map((l) => (l.length > max ? l.slice(0, max - 1) + '…' : l))
}
