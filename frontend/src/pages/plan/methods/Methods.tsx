import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { api, type SpeciesProfile } from '../../../api'
import { useSelection } from '../../../store'
import { defaultArchetype } from '../../../data/archetypes'
import SpeciesPhoto from '../../../components/SpeciesPhoto'
import { Book, Card, Stat, ZoomImg, type Tone } from '../../../ui/kit'
import { G, T } from '../../../ui/terms'
import './methods.css'

const ModelViewer = lazy(() => import('../../../ui/ModelViewer'))

// Harvest Methods. Main section: the selected plant (annotated illustration, its parts, 3D illustration, photos of the
// part, harvesting techniques and tools). Then the methods for each part, an AI analysis with proof, and a catalogue.

type Ref = { id: string; title: string; url: string | null }
type Method = { id: string; label: string; touches: string; note: string; measure: string[] }
type Organ = { id: string; label: string; agent_organ: string; process: string; summary: string; methods: Method[]; refs: Ref[] }
type Photo = { id: string; title: string | null; creator: string; licence: string; licence_url?: string; landing?: string; src: string; query?: string
  caption?: string; kind?: string; this_species?: boolean; shows?: string }
type Photos = { photos: Photo[]; status: string; basis?: string; note?: string; species_status?: string | null; curated?: boolean; kinds?: Record<string, string> }
type Proof = { quote: string; title?: string | null; url?: string | null; jev_confidence?: number | null }
type Finding = { text: string; computed?: boolean; scope: string; review?: string; proof: Proof[]; flags?: { kind: string; text?: string; detail?: string }[] }
type EvCard = { id: string; issue: string; why_it_matters: string; evidence_kind: string; applicability?: string; uncertainty?: string; recommended_next?: string; human_review_status?: string }
type Part = { n: number; part: string; label: string; role: 'harvested' | 'context'; product: string | null; affects: string | null; methods: string[]
  stats: { label: string; value: string; basis: string }[] }
type Illus = { status: string; tier?: string; checked?: boolean; src?: string; orig_src?: string; visible?: number[]; model?: string; note?: string; reason?: string
  source?: { title?: string; creator?: string; licence?: string; landing?: string; kind?: string }
  facts?: { species: string; parts: Part[]; uses: string[]; uses_basis: string; chosen_organ?: string | null; known_organ?: boolean } }
type Hit = { name: string; common_name?: string | null; family?: string | null }

const PREBAKED = ['Nardostachys jatamansi', 'Panax quinquefolius', 'Echinacea angustifolia', 'Prunus africana', 'Khaya senegalensis', 'Boswellia papyrifera',
  'Phyllanthus emblica', 'Colchicum autumnale', 'Garcinia lucida', 'Primula veris', 'Arnica montana', 'Sabal yapa']
const ICON: Record<string, string> = {
  root: 'M12 3v7M12 10c-3 2-5 6-6 10M12 10c3 2 5 6 6 10M12 10v11',
  bark: 'M8 3v18M16 3v18M8 8h8M8 14h8M11 3v5M13 14v7',
  resin: 'M10 3v18M10 9l5 2M15 11c0 2 1 3 1 4a1.5 1.5 0 01-3 0c0-1 1-2 2-4',
  leaf: 'M5 19C5 9 12 4 19 5c1 7-4 14-14 14zM5 19l8-8',
  flower: 'M12 14v7M12 6a2 2 0 110 4 2 2 0 010-4M8 8a2 2 0 104 0M12 8a2 2 0 104 0M10 11a2 2 0 104 0',
  fruit: 'M12 6c-4 0-6 3-6 7s3 7 6 7 6-3 6-7-2-7-6-7zM12 6c0-2 1-3 3-3',
  whole: 'M12 21V9M12 13c-3-1-5-3-5-6 3 0 5 2 5 6M12 11c3-1 5-3 5-6-3 0-5 2-5 6M8 21h8',
}
const PROCESS_TONE: Record<string, string> = { survival: 'bad', reproduction: 'review', growth: 'good' }
const PROCESS_COLOUR: Record<string, Tone> = { survival: 'rose', reproduction: 'gold', growth: 'green' }
const KIND_TONE: Record<string, Tone> = { part: 'green', technique: 'gold', tool: 'sky', impact: 'rose', processing: 'plum', use: 'lime' }
const EVIDENCE_KIND: Record<string, [string, string]> = {
  'computed-from-matrices': ['computed from matrices', 'worked out from field data'],
  'published-experiment': ['published experiment', 'a harvest experiment'],
  'published-observational': ['published observational comparison', 'compared harvested places'],
  'literature-claim': ['literature claim', 'stated in a paper'],
  regulation: ['regulation', 'rules and listings'],
}
const REVIEW: Record<string, string> = { publishable_with_caveat: 'usable with caveat', needs_expert_review: 'needs an expert', insufficient: 'too thin to use' }
const Ico = ({ id, size = 22 }: { id: string; size?: number }) => <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className="mt-ico"><path d={ICON[id] ?? ICON.whole} /></svg>

function params() { return new URLSearchParams(window.location.hash.split('?')[1] ?? '') }

export default function Methods() {
  const sel = useSelection()
  const [cat, setCat] = useState<{ organs: Organ[]; photo_note: string; disclaimer: string } | null>(null)
  const [oid, setOid] = useState<string>(() => params().get('organ') || 'root')
  const [species, setSpecies] = useState<string>(() => params().get('species') || sel.species || 'Nardostachys jatamansi')
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { api.json<typeof cat>('/api/methods').then(setCat).catch((e) => setErr((e as Error).message)) }, [])
  const organ = useMemo(() => {
    if (!cat) return null
    const raw = oid.toLowerCase()
    return cat.organs.find((o) => o.id === raw || o.agent_organ === raw || raw.includes(o.id) || (raw === 'rhizome' && o.id === 'root')) ?? cat.organs[0]
  }, [cat, oid])

  if (!cat || !organ) return <section className="mt-page"><p className="dim">{err ?? 'Loading harvest methods…'}</p></section>
  return (
    <section className="mt-page scroll" data-testid="methods">
      <header className="mt-head">
        <div><p className="label">HarvestOps · Harvest methods</p><h1 className="serif">How each harvest touches the plant</h1></div>
        <a className="btn sm" href="#/plan/ops">← Back to the workbench</a>
      </header>

      <PlantPanel species={species} onSpecies={setSpecies} onOrgan={setOid} organs={cat.organs} />

      <h2 className="mt-h2"><span className="mt-h2-n">2</span> Methods for each harvested part</h2>
      <nav className="mt-organs" aria-label="Harvested part" role="tablist">
        {cat.organs.map((o) => (
          <button key={o.id} role="tab" aria-selected={o.id === organ.id} onClick={() => setOid(o.id)} data-testid={`organ-${o.id}`}>
            <Ico id={o.id} /><span>{o.label}</span>
          </button>
        ))}
      </nav>

      <div className="mt-grid" key={organ.id}>
        <div className="mt-main">
          <div className="mt-summary">
            <span className={`pill ${PROCESS_TONE[organ.process.split(' ')[0]] ?? 'info'}`} data-testid="organ-process">puts {organ.process} at risk</span>
            <p className="mt-lead">{organ.summary}</p>
          </div>
          <PhotoStrip organ={organ} species={species} />
          <h3 className="label">Methods compared</h3>
          <div className="mt-methods">
            {organ.methods.map((m, i) => (
              <article key={m.id} className={`mt-method kcard t-${PROCESS_COLOUR[m.touches.split(' ')[0]] ?? 'sky'}`} style={{ ['--i' as string]: i }} data-testid="method-card">
                <h3>{m.label}</h3>
                <p className="tiny"><span className={`tchip t-${PROCESS_COLOUR[m.touches.split(' ')[0]] ?? 'sky'}`}>touches {m.touches}</span></p>
                <p className="small">{m.note}</p>
                <p className="label">Measure locally</p>
                <ul className="mt-measure small">{m.measure.map((x) => <li key={x}>{x}</li>)}</ul>
              </article>
            ))}
          </div>
          <details className="mt-refs"><summary className="small">Sources ({organ.refs.length})</summary>
            <ul className="small">{organ.refs.map((r) => <li key={r.id}>{r.url ? <a href={r.url} target="_blank" rel="noreferrer">{r.title}</a> : r.title}</li>)}</ul>
          </details>
          <p className="tiny dim">{cat.disclaimer}</p>
        </div>
        <Analyse organ={organ} species={species} />
      </div>

      <Catalogue organs={cat.organs} />
    </section>
  )
}

/* --------------------------------------------------------------------------------------------- selected plant */
function PlantPanel({ species, onSpecies, onOrgan, organs }: { species: string; onSpecies: (s: string) => void; onOrgan: (o: string) => void; organs: Organ[] }) {
  const [draft, setDraft] = useState(species)
  const [ill, setIll] = useState<Illus | null>(null)
  const [busy, setBusy] = useState(false)
  const [profile, setProfile] = useState<SpeciesProfile | null>(null)
  const [picked, setPicked] = useState(false)
  const [part, setPart] = useState<string | null>(null)  // harvested part chosen by the user, for a plant with no harvest data
  const [hits, setHits] = useState<Hit[]>([])
  const [open, setOpen] = useState(false)
  const tried = useRef('')
  const custom = !PREBAKED.includes(species)
  const illUrl = (gen: boolean) => `/api/species/${encodeURIComponent(species)}/illustration?${new URLSearchParams({ ...(gen ? { generate: 'true' } : {}), ...(part ? { organ: part } : {}) })}`
  useEffect(() => { setDraft(species); setPart(null) }, [species])
  useEffect(() => {
    let live = true
    setIll(null)
    api.json<Illus>(illUrl(false)).then((r) => live && setIll(r)).catch((e) => live && setIll({ status: 'error', reason: (e as Error).message }))
    return () => { live = false }
  }, [species, part]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let live = true
    setProfile(null)
    api.profile(species).then((p) => live && setProfile(p)).catch(() => {})
    return () => { live = false }
  }, [species])
  // suggestions from the whole species catalogue while typing; any other name can still be used as a custom plant
  useEffect(() => {
    const q = draft.trim()
    if (!open || q.length < 3 || q === species) { setHits([]); return }
    const t = setTimeout(() => api.json<{ results: Hit[] }>(`/api/species?q=${encodeURIComponent(q)}&limit=8`).then((r) => setHits(r.results)).catch(() => setHits([])), 250)
    return () => clearTimeout(t)
  }, [draft, open, species])
  // when the user picks a plant, jump the methods tabs to the part it is harvested for
  useEffect(() => {
    if (!picked || !ill?.facts || ill.facts.species.toLowerCase() !== species.toLowerCase()) return  // wait for this plant's facts
    const h = ill.facts.parts.find((p) => p.role === 'harvested')
    if (h) onOrgan(h.part)
    setPicked(false)
  }, [ill, picked, onOrgan, species])
  const generate = async () => {
    setBusy(true)
    try { setIll(await api.json<Illus>(illUrl(true))) } catch (e) { setIll({ status: 'error', reason: (e as Error).message }) }
    setBusy(false)
  }
  // a new plant gets its illustration made once, automatically, as soon as we know which part is harvested; the server keeps it
  const hasHarvested = !!ill?.facts?.parts.some((p) => p.role === 'harvested')
  useEffect(() => {
    const k = `${species}|${part ?? ''}`
    if (ill?.status !== 'not generated' || !hasHarvested || busy || tried.current === k) return
    tried.current = k
    generate()
  }, [ill, hasHarvested, busy, species, part]) // eslint-disable-line react-hooks/exhaustive-deps
  const choose = (s: string) => { const v = s.trim(); if (v.length >= 3) { setPicked(true); setOpen(false); setHits([]); onSpecies(v) } }
  const choosePart = (oid: string) => { setPart(oid); onOrgan(oid) }
  const model = defaultArchetype(species, profile?.organism_type, profile?.family)
  const parts = ill?.facts?.parts ?? []
  const visible = new Set(ill?.visible ?? parts.map((p) => p.n))

  return (
    <section className="mt-plant" aria-label="Selected plant" data-testid="plant-panel">
      <div className="mt-plant-head">
        <h2 className="mt-h2"><span className="mt-h2-n">1</span> This plant: what is harvested, and how</h2>
        <form className="mt-pick" onSubmit={(e) => { e.preventDefault(); choose(draft) }}>
          <div className="mt-search">
            <input id="mt-plant-q" className="input sm" value={draft} placeholder="Any plant: Latin or common name" autoComplete="off"
              onChange={(e) => { setDraft(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
              role="combobox" aria-controls="mt-plant-list" aria-label="Plant" aria-autocomplete="list" aria-expanded={open && draft.trim().length >= 3 && draft.trim() !== species} data-testid="plant-input" />
            {open && draft.trim().length >= 3 && draft.trim() !== species && (
              <ul id="mt-plant-list" className="mt-suggest" role="listbox" aria-label="Plant suggestions" data-testid="plant-suggest">
                {hits.map((h) => (
                  <li key={h.name} role="presentation"><button type="button" role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(h.name)}>
                    <i className="serif">{h.name}</i>{(h.common_name || h.family) && <small>{h.common_name ?? h.family}</small>}</button></li>
                ))}
                <li role="presentation"><button type="button" role="option" aria-selected={false} className="mt-sug-custom" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(draft)} data-testid="use-custom">
                  Use <b>“{draft.trim()}”</b> as a custom plant</button></li>
              </ul>
            )}
          </div>
          <button className="btn sm primary">Show</button>
        </form>
      </div>
      <div className="mt-chips" role="group" aria-label="Plants">
        {PREBAKED.map((s) => <button key={s} type="button" className="mt-chip" aria-pressed={s === species} onClick={() => choose(s)}><i className="serif">{s}</i></button>)}
        {custom
          ? <button type="button" className="mt-chip custom" aria-pressed onClick={() => document.getElementById('mt-plant-q')?.focus()} data-testid="custom-chip"><i className="serif">{species}</i> <span className="tchip t-sky">custom</span></button>
          : <button type="button" className="mt-chip add" onClick={() => { setDraft(''); setOpen(true); document.getElementById('mt-plant-q')?.focus() }} data-testid="custom-chip">+ Custom plant</button>}
      </div>
      {ill?.facts && ill.facts.known_organ === false && (
        <div className="mt-partpick" role="group" aria-label="Which part is harvested?" data-testid="harvest-part">
          <span className="small"><b>Which part of this plant is harvested?</b> <span className="dim">We hold no harvest data for it, so tell us; the illustration and methods follow your choice.</span></span>
          <div className="mt-chips">
            {organs.map((o) => <button key={o.id} type="button" className="mt-chip" aria-pressed={part === o.id} onClick={() => choosePart(o.id)}><Ico id={o.id} size={16} /> {o.label}</button>)}
          </div>
        </div>
      )}

      <div className="mt-plant-grid">
        <figure className="mt-ill" data-testid="illustration">
          {!ill ? <div className="mt-shimmer tall" role="status" aria-label="Loading illustration" />
            : ill.status === 'ok' && ill.src ? (<>
              <ZoomImg src={ill.src} alt={`AI-annotated illustration of ${species}`} altSrc={ill.orig_src} altLabel="Show the original"
                caption={<><b>AI-annotated illustration.</b> {ill.note} Source: {ill.source?.title} · {ill.source?.creator} · {ill.source?.licence}</>} />
              <figcaption>
                <span className="mt-ill-tags">
                  <span className="tchip t-plum">AI-annotated illustration</span>
                  {ill.checked ? <span className="tchip t-green">markers checked by eye</span> : <span className="tchip t-rose">not checked by a person</span>}
                </span>
                <span className="tiny dim">Base image: {ill.source?.landing ? <a href={ill.source.landing} target="_blank" rel="noreferrer">{ill.source?.title || 'source'}</a> : ill.source?.title} · {ill.source?.creator} · {ill.source?.licence}. Markers drawn by {ill.model?.replace('gemini:', '')}.</span>
              </figcaption>
            </>) : (
              <div className="mt-noill">
                {busy ? <><div className="mt-shimmer tall" role="status" aria-label="Annotating" /><p className="small">Creating an AI-annotated illustration for this plant (about half a minute). It is saved, so next time it opens at once.</p></>
                  : <p className="small">{ill.status === 'not generated' ? (hasHarvested ? 'No illustration for this plant yet.' : 'Pick the harvested part above and an illustration will be made for it.') : ill.status === 'no source' ? 'No openly licensed plate or photo of this exact species was found.' : `Illustration unavailable (${ill.reason ?? ill.status}).`}</p>}
                {ill.status === 'not generated' && hasHarvested && !busy && <button className="btn sm" onClick={generate} data-testid="gen-illustration">Create an AI-annotated illustration</button>}
                <p className="tiny dim">Generated illustrations are labelled "not checked by a person". The parts list beside it always comes from our data.</p>
              </div>
            )}
        </figure>

        <div className="mt-legend" data-testid="part-legend">
          <p className="label">Numbered parts · names and figures from EthnoHarvest data</p>
          {parts.length === 0 && ill && <p className="small dim">No part data for this plant.</p>}
          <ol>
            {parts.map((p, i) => (
              <li key={p.n} className={`mt-part kcard t-${p.role === 'harvested' ? 'gold' : 'grey'}`} style={{ ['--i' as string]: i }}>
                <div className="mt-part-h">
                  <span className="mt-num" aria-label={`Marker ${p.n}`}>{p.n}</span>
                  <Ico id={p.part} size={18} />
                  <b>{p.label}</b>
                  <span className={`tchip t-${p.role === 'harvested' ? 'gold' : 'grey'}`}>{p.role === 'harvested' ? 'harvested' : 'for orientation'}</span>
                  {ill?.status === 'ok' && !visible.has(p.n) && <span className="tiny dim">not visible in this picture</span>}
                </div>
                {p.product && <p className="small">{p.product}</p>}
                {p.affects && <p className="small"><span className={`tchip t-${PROCESS_COLOUR[p.affects.split(' ')[0]] ?? 'sky'}`}>harvest affects {p.affects}</span></p>}
                {p.stats.length > 0 && <div className="mt-pstats">{p.stats.map((s) => (
                  <Stat key={s.label} tone={s.value.endsWith('%') ? 'gold' : 'sky'} shape={s.value.endsWith('%') ? 'round' : 'hex'} value={s.value}
                    label={s.label.startsWith('Growth that depends') ? <T plain={s.label} sci={<>Elasticity share · {s.label.replace('Growth that depends on ', '')}</>} /> : s.label}
                    hint={s.basis} />))}</div>}
                {p.methods.length > 0 && <p className="tiny dim">Methods: {p.methods.join(' · ')}</p>}
              </li>
            ))}
          </ol>
          {(ill?.facts?.uses.length ?? 0) > 0 && (
            <div className="mt-uses"><p className="label">Documented uses</p>
              <div className="mt-usechips">{ill!.facts!.uses.map((u) => <span key={u} className="tchip t-lime">{u}</span>)}</div>
              <p className="tiny dim">{ill!.facts!.uses_basis}</p></div>
          )}
        </div>

        <div className="mt-side">
          <Card title="Photo of this plant" tone="sky">
            <SpeciesPhoto name={species} size="lg" />
            <p className="tiny dim">Openly licensed; tap © for the credit.</p>
          </Card>
          <Card title={model.kind === 'species' ? '3D model of this plant' : 'Related 3D model'} tone="plum" testid="model-card">
            <div className="mt-model"><Suspense fallback={<div className="mt-shimmer" />}><ModelViewer assetId={model.id} /></Suspense></div>
            <p className="tiny"><span className="tchip t-plum">illustration only</span></p>
            <p className="tiny dim">{model.kind === 'species' ? 'AI-generated model of this species. Just an illustration, not a botanical reconstruction.' : `No model of this species. Shown: a generic ${profile?.organism_type?.toLowerCase() ?? 'plant'} for its growth form. Just an illustration.`} Drag to turn.</p>
          </Card>
        </div>
      </div>
    </section>
  )
}

/* --------------------------------------------------------------------------------------------- photos of the part */
function PhotoStrip({ organ, species }: { organ: Organ; species: string }) {
  const [data, setData] = useState<Photos | null>(null)
  const [kind, setKind] = useState<string>('all')
  const [i, setI] = useState(0)
  useEffect(() => {
    setData(null); setI(0); setKind('all')
    const q = new URLSearchParams({ organ: organ.id, species })
    api.json<Photos>(`/api/methods/photos?${q}`).then(setData).catch((e) => setData({ photos: [], status: (e as Error).message }))
  }, [organ.id, species])
  const list = (data?.photos ?? []).filter((p) => kind === 'all' || p.kind === kind)
  const p = list[Math.min(i, list.length - 1)]
  const kinds = [...new Set((data?.photos ?? []).map((x) => x.kind).filter(Boolean))] as string[]
  const credit = (x: Photo) => <>{x.creator} · {x.licence_url ? <a href={x.licence_url} target="_blank" rel="noreferrer">{x.licence}</a> : x.licence}
    {x.landing && <> · <a href={x.landing} target="_blank" rel="noreferrer">source</a></>}</>
  return (
    <div className="mt-photos" data-testid="photo-strip">
      {kinds.length > 1 && (
        <div className="mt-kinds" role="group" aria-label="Kind of picture">
          <button type="button" aria-pressed={kind === 'all'} onClick={() => { setKind('all'); setI(0) }}>All ({data!.photos.length})</button>
          {kinds.map((k) => <button type="button" key={k} className={`t-${KIND_TONE[k] ?? 'grey'}`} aria-pressed={kind === k} onClick={() => { setKind(k); setI(0) }}>
            {data?.kinds?.[k] ?? k} ({data!.photos.filter((x) => x.kind === k).length})</button>)}
        </div>
      )}
      <div className="mt-photo-main">
        {!data ? <div className="mt-shimmer" role="status" aria-label="Loading photos" /> : p ? (
          <figure key={p.id}>
            <ZoomImg src={p.src} alt={p.caption ?? p.title ?? 'photo'} testid="method-photo" caption={<><b>{p.caption ?? p.title}</b><br />{credit(p)}</>} />
            <figcaption>
              <span className="mt-cap">{p.kind && <span className={`tchip t-${KIND_TONE[p.kind] ?? 'grey'}`}>{data.kinds?.[p.kind] ?? p.kind}</span>}{p.caption ?? p.title}</span>
              {p.shows && <span className="tiny">{p.this_species ? 'Shows this plant' : p.shows === 'species not identified' ? 'Species not identified' : <>Shows <i>{p.shows}</i>, a related plant</>}</span>}
              <span className="tiny">{credit(p)}</span>
            </figcaption>
          </figure>
        ) : <p className="small dim mt-nophoto">No open-licence photo found ({data.status}).</p>}
        {list.length > 1 && (<>
          <button className="mt-nav prev" aria-label="Previous photo" onClick={() => setI((i - 1 + list.length) % list.length)}>‹</button>
          <button className="mt-nav next" aria-label="Next photo" onClick={() => setI((i + 1) % list.length)}>›</button>
        </>)}
      </div>
      <div className="mt-thumbs">{list.map((x, j) => (
        <button key={x.id} aria-label={`Photo ${j + 1}: ${x.caption ?? x.title ?? ''}`} aria-pressed={j === i} onClick={() => setI(j)} className={x.this_species ? 'same' : ''}>
          <img src={x.src} alt="" />
        </button>))}
      </div>
      <p className="tiny warn">{data?.note ?? 'Search result · not expert-checked · may not show this species'}{data?.basis ? ` · ${data.basis}` : ''}</p>
    </div>
  )
}

/* --------------------------------------------------------------------------------------------- AI analysis */
type RunOut = { findings?: Finding[]; cards?: EvCard[]; agent?: { retrieved?: number; jev_calls?: number; claims?: number }
  sensitivity?: { status?: string; plain?: string; not_a_rate?: string; few_matrices?: boolean } }
function Analyse({ organ, species: pageSpecies }: { organ: Organ; species: string }) {
  const [species, setSpecies] = useState(pageSpecies)
  const [country, setCountry] = useState('')
  const [rid, setRid] = useState<string | null>(null)
  const [run, setRun] = useState<{ status: string; outputs: RunOut | null } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  useEffect(() => { setSpecies(pageSpecies) }, [pageSpecies])
  useEffect(() => { setRid(null); setRun(null) }, [organ.id])
  useEffect(() => {
    if (!rid) return
    let stop = false
    const poll = async () => {
      try {
        const r = await api.json<NonNullable<typeof run>>(`/api/runs/${rid}`)
        if (stop) return
        setRun(r)
        if (r.status === 'running') window.setTimeout(poll, 1500)
      } catch (e) { setErr((e as Error).message) }
    }
    poll()
    return () => { stop = true }
  }, [rid])
  const go = async () => {
    setErr(null); setRun(null)
    try {
      const r = await api.json<{ run_id: string }>('/api/methods/analyse', { method: 'POST', body: JSON.stringify({ species: species.trim(), organ: organ.id, country: country.trim() || null }) })
      setRid(r.run_id)
    } catch (e) { setErr((e as Error).message) }
  }
  const findings = run?.outputs?.findings ?? []
  const cards = run?.outputs?.cards ?? []
  const sens = run?.outputs?.sensitivity
  const running = !!rid && (!run || run.status === 'running')
  return (
    <aside className="mt-ai" data-testid="methods-analyse">
      <p className="label">AI analysis with proof</p>
      <ol className="mt-howto">
        <li><span>1</span>Search papers</li><li><span>2</span><G k="jev">JEV</G> sorts them</li><li><span>3</span>Quote findings</li>
        <li><span>4</span>Second model checks</li><li><span>5</span>Compute from <G k="matrix">matrices</G></li>
      </ol>
      <label className="small">Plant<input className="input sm" value={species} onChange={(e) => setSpecies(e.target.value)} data-testid="mt-species" /></label>
      <label className="small">Country (optional)<input className="input sm" value={country} onChange={(e) => setCountry(e.target.value)} /></label>
      <button className="btn primary" onClick={go} disabled={running || species.trim().length < 3} data-testid="mt-analyse">{running ? 'Analysing…' : `Analyse ${organ.label.toLowerCase()} harvest`}</button>
      {err && <p className="error small">{err}</p>}
      {running && <div className="mt-progress" aria-live="polite"><i /><span className="small">Reading papers and computing… this can take a minute.</span></div>}
      {rid && <a className="linkish tiny" href={`#/evidence?run=${rid}`}>watch every step →</a>}
      {run && run.status !== 'running' && (
        <div className="mt-findings" data-testid="mt-findings">
          <div className="stat-row">
            <Stat tone="sky" shape="square" value={run.outputs?.agent?.retrieved ?? 0} label="papers" />
            <Stat tone="plum" shape="hex" value={run.outputs?.agent?.jev_calls ?? 0} label={<T sci="JEV decisions" plain="AI sorting calls" />} />
            <Stat tone="green" shape="leaf" value={findings.length} label="findings" />
          </div>
          {run.status !== 'completed' && <p className="small warn">Run {run.status}.</p>}
          {sens?.status === 'ok' && (
            <Card title="How sensitive the plant is to this harvest" tone="gold">
              <p className="small">{sens.plain}</p>
              <p className="tiny warn">{sens.not_a_rate}{sens.few_matrices ? ' Based on few matrices.' : ''}</p>
            </Card>
          )}
          {findings.length === 0 && <p className="small dim">No usable findings for this plant and part. That is not evidence of no effect.</p>}
          <ol>
            {findings.map((f, j) => (
              <li key={j} className={`mt-finding ${f.computed ? 'computed' : ''}`} data-testid="mt-finding">
                <p className="small">{f.text}</p>
                <span className={`tchip ${f.computed ? 't-green' : 't-sky'}`}>{f.computed ? 'computed here' : 'found in papers'}</span>
                {f.scope !== 'same-species' && <span className="tchip t-grey">other species</span>}
                {f.review && <span className={`tchip ${f.review === 'publishable_with_caveat' ? 't-lime' : f.review === 'insufficient' ? 't-grey' : 't-rose'}`}>{REVIEW[f.review] ?? f.review}</span>}
                {(f.flags ?? []).map((fl, k) => <p key={k} className="tiny warn">⚠ {fl.text ?? fl.detail ?? fl.kind}</p>)}
                <button className="linkish tiny" aria-expanded={open === j} onClick={() => setOpen(open === j ? null : j)} data-testid="mt-proof">Proof ▸</button>
                {open === j && <ul className="mt-proof">{f.proof.map((p, k) => (
                  <li key={k}><blockquote className="small">“{p.quote}”</blockquote>
                    <span className="tiny dim">{p.url ? <a href={p.url} target="_blank" rel="noreferrer">{p.title}</a> : p.title}{p.jev_confidence != null ? ` · JEV ${Math.round(p.jev_confidence * 100)}% sure` : ''}</span></li>
                ))}</ul>}
              </li>
            ))}
          </ol>
          {cards.length > 0 && (
            <Book label="Evidence report" testid="mt-book" pages={cards.map((c) => ({
              key: c.id, title: c.issue,
              tag: <span className="tchip t-sky"><T sci={EVIDENCE_KIND[c.evidence_kind]?.[0] ?? c.evidence_kind} plain={EVIDENCE_KIND[c.evidence_kind]?.[1] ?? c.evidence_kind} /></span>,
              body: (
                <div className="mt-page-body">
                  <Card title="Why it matters" tone="green"><p className="small">{c.why_it_matters}</p></Card>
                  {c.uncertainty && <Card title="How sure we are" tone="gold"><p className="small">{c.uncertainty}</p></Card>}
                  {c.recommended_next && <Card title="What to do next" tone="sky"><p className="small">{c.recommended_next}</p></Card>}
                  <p className="tiny dim">{c.applicability ? `Applies to: ${c.applicability}. ` : ''}{c.human_review_status}</p>
                </div>
              ),
            }))} />
          )}
          <p className="tiny dim">Advisory evidence summary, not a harvest rate, quota or permit.</p>
        </div>
      )}
    </aside>
  )
}

/* --------------------------------------------------------------------------------------------- whole catalogue */
type CatPhoto = Photo & { organ: string; species?: string | null }
type Cat = { groups: { organ: string; label: string; kinds: { kind: string; label: string; photos: CatPhoto[] }[] }[]; count: number; note: string }
function Catalogue({ organs }: { organs: Organ[] }) {
  const [cat, setCat] = useState<Cat | null>(null)
  const [only, setOnly] = useState<string>('all')
  useEffect(() => { api.json<Cat>('/api/methods/catalogue-photos').then(setCat).catch(() => setCat(null)) }, [])
  if (!cat || !cat.count) return null
  return (
    <section className="mt-catalogue" aria-label="Image catalogue" data-testid="photo-catalogue">
      <h2 className="mt-h2"><span className="mt-h2-n">3</span> Image catalogue: every part, technique and tool ({cat.count})</h2>
      <p className="small dim">{cat.note}</p>
      <div className="mt-kinds" role="group" aria-label="Filter by part">
        <button type="button" aria-pressed={only === 'all'} onClick={() => setOnly('all')}>All parts</button>
        {cat.groups.map((g) => <button type="button" key={g.organ} aria-pressed={only === g.organ} onClick={() => setOnly(g.organ)}><Ico id={g.organ} size={14} /> {organs.find((o) => o.id === g.organ)?.label ?? g.label}</button>)}
      </div>
      {cat.groups.filter((g) => only === 'all' || g.organ === only).map((g) => (
        <div key={g.organ} className="mt-cat-group">
          <h3 className="mt-cat-h"><Ico id={g.organ} /> {g.label}</h3>
          {g.kinds.map((k) => (
            <div key={k.kind} className={`mt-cat-kind t-${KIND_TONE[k.kind] ?? 'grey'}`}>
              <p className="label">{k.label}</p>
              <div className="mt-cat-row">
                {k.photos.map((p) => (
                  <figure key={p.id} className="mt-tile">
                    <ZoomImg src={p.src} alt={p.caption ?? p.title ?? ''} caption={<><b>{p.caption}</b> · {p.creator} · {p.licence}</>} />
                    <figcaption><span className="small">{p.caption}</span>
                      <span className="tiny dim">{p.species ? <i>{p.species}</i> : 'species not identified'} · {p.creator} · {p.licence}{p.landing && <> · <a href={p.landing} target="_blank" rel="noreferrer">source</a></>}</span></figcaption>
                  </figure>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </section>
  )
}
