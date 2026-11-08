import { useEffect, useState } from 'react'
import { api, type Health } from './api'
import { useSelection, type Role } from './store'
import Explore from './pages/Explore'
import Simulate from './pages/Simulate'
import Studio from './pages/simulate/studio/Studio'
import PlanShell from './pages/plan/PlanShell'
import Evidence from './pages/Evidence'
import './app.css'
import { Lightbox } from './ui/kit'
import { TermSwitch } from './ui/terms'

const PAGES = [
  { id: 'explore', label: 'Explore' },
  { id: 'simulate', label: 'Simulate' },
  { id: 'plan', label: 'Plan' },
  { id: 'evidence', label: 'Evidence & Intelligence' },
] as const
type PageId = (typeof PAGES)[number]['id']
const ROLES: { id: Role; label: string }[] = [
  { id: 'collector', label: 'Collector' }, { id: 'manager', label: 'Cooperative manager' },
  { id: 'scientific-reviewer', label: 'Scientific reviewer' }, { id: 'quality-reviewer', label: 'Quality reviewer' }, { id: 'admin', label: 'Admin' },
]

function route(): { page: PageId; sub: string | null } {
  const [head, sub] = window.location.hash.replace('#/', '').split('?')[0].split('/')
  return { page: (PAGES.find((p) => p.id === head)?.id ?? 'explore') as PageId, sub: sub || null }
}

export default function App() {
  const [{ page, sub }, setRoute] = useState(route)
  const [health, setHealth] = useState<Health | null>(null)
  const [down, setDown] = useState(false)
  const { role, setRole } = useSelection()

  useEffect(() => {
    const on = () => setRoute(route())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  useEffect(() => { api.health().then(setHealth).catch(() => setDown(true)) }, [])
  // HarvestOps and Harvest Methods use the deep-yellow theme across the whole screen
  useEffect(() => {
    const ops = page === 'plan' && (sub === 'ops' || sub === 'methods')
    if (ops) document.documentElement.dataset.theme = 'ops'
    else delete document.documentElement.dataset.theme
  }, [page, sub])

  return (
    <div className="shell">
      <header className="topbar">
        <a className="wordmark" href="#/explore" aria-label="EthnoHarvest home">
          <img className="app-icon" src="/icons/icon-64.png" width="26" height="26" alt="" aria-hidden />
          <span className="serif">EthnoHarvest</span>
          <em className="serif">harvest copilot</em>
        </a>
        <nav className="pages" aria-label="Pages">
          {PAGES.map((p) => (
            <a key={p.id} href={`#/${p.id}`} aria-current={page === p.id && !(p.id === 'plan' && sub === 'ops') ? 'page' : undefined}>
              {p.label}
            </a>
          ))}
        </nav>
        <a className="btn sm soil ops-shortcut" href="#/plan/ops" aria-current={page === 'plan' && sub === 'ops' ? 'page' : undefined} data-testid="nav-harvestops">
          HarvestOps
        </a>
        <TermSwitch />
        <div className="readout mono" data-testid="health">
          {down && <span className="st-failed">backend offline: start uvicorn on :8000</span>}
          {health && (
            <>
              <span title={`${health.matrices.toLocaleString()} matrices · ${health.rule_version}`}>COMPADRE {health.compadre_version}</span>
              <span className="providers">
                {(['jev', 'groq'] as const).map((k) => (
                  <i key={k} className={health.providers[k] ? 'on' : 'off'} title={`${k.toUpperCase()} ${health.providers[k] ? 'configured' : 'not configured'}`}>{k}</i>
                ))}
              </span>
            </>
          )}
          <label className="role" title="Demo access model: pick the role you are acting as. Roles are chosen, not signed in. The server checks permissions, but this is not production security.">
            <span className="sr-only">Acting as</span>
            <select value={role} onChange={(e) => setRole(e.target.value as Role)} data-testid="role">
              {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </label>
        </div>
      </header>
      <main className="stage">
        {page === 'explore' && <Explore />}
        {page === 'simulate' && (sub === 'science' ? <ScienceLab /> : <Studio />)}
        {page === 'plan' && <PlanShell sub={sub} />}
        {page === 'evidence' && <Evidence />}
      </main>
      <Lightbox />
    </div>
  )
}

function ScienceLab() {
  return (
    <div className="science-lab">
      <div className="science-bar"><a href="#/simulate" className="btn sm quiet">← Back to the studio</a>
        <span className="small dim">Detailed science lab: matrices, life-cycle diagram, harvest-response comparison and model checks.</span></div>
      <Simulate />
    </div>
  )
}
