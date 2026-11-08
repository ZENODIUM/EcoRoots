import { useState } from 'react'
import type { Checklists, EligibilityTask, RegionContext, SpeciesProfile } from '../../api'
import StartPassport from '../../components/StartPassport'
import SpeciesPhoto from '../../components/SpeciesPhoto'
import { lambdaWords } from '../../lang'
import { G, T } from '../../ui/terms'

const TASK_LABEL: Record<string, string> = {
  demographic_projection: 'Population projection',
  harvest_comparison: 'Harvested vs control comparison',
  rotation_extrapolation: 'Rotation extrapolation',
  hypothetical_harvest: 'Hypothetical removal (sensitivity)',
  local_quota: 'Local harvest rate / quota',
  habitat_model: 'Train a habitat model here',
  phenology_window: 'Flowering window',
  survey_planning: 'Survey planning',
  evidence_planning: 'Evidence planning',
}

const TIER_TEXT = {
  A: 'Study-backed: audited harvest-treatment matrices exist for this species.',
  B: 'Published demographic model, but no harvest study. Harvest effects are hypothetical.',
  C: 'Insufficient evidence for population modelling. Geography and literature only.',
}

const statusLabel = (s: string) => (s === 'enabled-with-caveats' ? 'caveats' : s)

export default function SpeciesDossier({ name, profile, ctx, onClear }: { name: string; profile: SpeciesProfile | null; ctx: RegionContext | null; onClear: () => void }) {
  const [open, setOpen] = useState<string | null>('local_quota')
  if (!profile) return <div className="rail-sec"><p className="label">Loading dossier · {name}</p><div className="skeleton" /></div>
  const el = profile.eligibility
  const quota = el.tasks.local_quota
  const cites = ctx?.layers.cites as { status: string; listed?: boolean; appendices?: string[]; caveat?: string; url?: string } | undefined
  const tasks = Object.values(el.tasks).filter((t) => t.task !== 'local_quota')

  return (
    <div className="dossier" data-testid="dossier">
      <div className="rail-sec">
        <div className="dossier-top">
          <button className="btn sm quiet" onClick={onClear} aria-label="Back to case library">← Cases</button>
          <span className="label">rules {el.rule_version}</span>
        </div>
        <div className="sp-head">
          <SpeciesPhoto name={profile.name} size="md" />
          <h2 className="sp-name"><i>{profile.name}</i></h2>
        </div>
        <p className="sp-meta">{[profile.family, profile.organism_type, profile.common_name].filter(Boolean).join(' · ') || 'Not in the medicinal COMPADRE catalogue'}</p>
        <div className="tier-line"><span className={`tier tier-${profile.tier}`}>{profile.tier}</span><p>{TIER_TEXT[profile.tier]}</p></div>
        {profile.note && <p className="note">{profile.note}</p>}
        {profile.in_catalog && (
          <dl className="facts num">
            <div><dt><G k="matrix"><T sci="matrices" plain="life-cycle tables" /></G></dt><dd>{profile.n_matrices}</dd></div>
            <div><dt><T sci="studies" plain="published studies" /></dt><dd>{profile.n_studies}</dd></div>
            <div><dt><T sci="populations" plain="wild groups studied" /></dt><dd>{profile.n_populations}</dd></div>
            <div><dt><G k="lambda"><T sci="median λ" plain="typical yearly growth" /></G></dt><dd>{profile.median_lambda ?? '—'}</dd></div>
          </dl>
        )}
        {profile.median_lambda != null && <p className="small">Typical long-term outlook in published populations: {lambdaWords(profile.median_lambda)}.</p>}
        <div className="dossier-actions" data-testid="dossier-actions">
          <a className="btn sm" href="#/simulate" data-testid="simulate-this">Simulate this plant →</a>
          <StartPassport species={name} organ={profile.harvest_studies?.[0]?.organ} />
        </div>
        {profile.sensitive && <p className="note sens">Sensitive species: occurrence coordinates are generalised to 0.1° before they reach this page.</p>}
      </div>

      <div className="rail-sec quota" data-testid="quota">
        <p className="label">Can a safe local harvest rate be estimated?</p>
        <p className="quota-answer serif">{el.quota_answer}</p>
        <p className="quota-why">{quota.reasons[0]}</p>
        <p className="tally" aria-label={`${6 - quota.missing.length} of 6 local evidence items present`}>
          {Array.from({ length: 6 }, (_, i) => <i key={i} className={i < 6 - quota.missing.length ? 'on' : ''} />)}
          <span>{6 - quota.missing.length}/6 local evidence</span>
        </p>
        {quota.missing.length > 0 && (
          <details>
            <summary>{quota.missing.length} of 6 local evidence items missing</summary>
            <ol>{quota.missing.map((m) => <li key={m}>{m}</li>)}</ol>
          </details>
        )}
      </div>

      <div className="rail-sec">
        <p className="label">What the evidence permits</p>
        <ul className="tasks" data-testid="eligibility">
          {tasks.map((t: EligibilityTask) => (
            <li key={t.task}>
              <button aria-expanded={open === t.task} onClick={() => setOpen(open === t.task ? null : t.task)}>
                <span>{TASK_LABEL[t.task] ?? t.task}</span>
                <span className={`chip st-${t.status}`}>{statusLabel(t.status)}</span>
              </button>
              {open === t.task && (
                <div className="task-body">
                  {t.reasons.map((r) => <p key={r}>{r}</p>)}
                  {t.missing.length > 0 && <p className="missing">Needs: {t.missing.join('; ')}</p>}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      {(profile.harvest_studies?.length ?? 0) > 0 && (
        <div className="rail-sec">
          <p className="label">Audited harvest studies</p>
          <ul className="studies">
            {profile.harvest_studies!.map((s) => (
              <li key={s.id}>
                <p>{s.citation}</p>
                <p className="mono small">{s.design} · organ: {s.organ} · tier {s.tier}</p>
              </li>
            ))}
          </ul>
          <a className="btn sm" href="#/simulate">Open in Simulate →</a>
        </div>
      )}

      {profile.in_catalog && (
        <div className="rail-sec">
          <p className="label">Documented medicinal use</p>
          <p className="small">{profile.example_uses}</p>
          <p className="mono small dim">{profile.n_med_references} references · {profile.medicinal_sources}{profile.matched_via_synonym ? ' · matched via reviewed synonym' : ''}</p>
          <p className="small dim">Published ethnobotanical records only. No traditional knowledge is collected or stored.</p>
        </div>
      )}

      {profile.checklists && <NameCheck c={profile.checklists} name={profile.name} />}

      {cites && cites.status === 'available' && (
        <div className="rail-sec">
          <p className="label">Trade regulation</p>
          <p className="small">{cites.listed ? `CITES Appendix ${cites.appendices?.join(', ')}` : 'Not CITES-listed'} · <a href={cites.url} target="_blank" rel="noreferrer">Species+</a></p>
          <p className="small dim">{cites.caveat}</p>
        </div>
      )}
    </div>
  )
}

// Name check against two global checklists, plus WCVP native range (drawn on the globe)
function NameCheck({ c, name }: { c: Checklists; name: string }) {
  const w = c.wcvp, f = c.wfo
  const accW = w.accepted_name, accF = f.accepted_name
  const verdict = c.agree === true ? (c.name_changed ? 'Both checklists accept a different name' : 'Name accepted by both checklists')
    : c.agree === false ? 'The two checklists disagree on the accepted name' : 'Checked in one checklist only'
  return (
    <div className="rail-sec" data-testid="name-check">
      <p className="label">Name check · <T sci="WCVP (POWO) + World Flora Online" plain="two world plant lists" /></p>
      <p className="small"><span className={`chip ${c.agree === false || c.name_changed ? 'st-caveats' : c.agree ? 'st-available' : 'st-pending'}`}>{verdict}</span></p>
      <dl className="facts nc">
        <div><dt>POWO / WCVP</dt><dd>{w.status === 'no match' ? 'no match' : <>{w.status}{accW && accW.split(' ').slice(0, 2).join(' ') !== name ? <> → <i>{accW}</i></> : null}{w.powo_url && <> · <a href={w.powo_url} target="_blank" rel="noreferrer">POWO</a></>}</>}</dd></div>
        <div><dt>WFO</dt><dd>{f.status !== 'matched' ? f.status : <>{f.role ?? 'matched'}{accF && accF.split(' ').slice(0, 2).join(' ') !== name ? <> → <i>{accF}</i></> : null}{f.url && <> · <a href={f.url} target="_blank" rel="noreferrer">WFO</a></>}</>}</dd></div>
        {w.native_l3 && <div><dt><T sci="Native range" plain="Where it grows wild" /></dt><dd>{w.range_text ?? '—'} <span className="dim">({w.native_l3.length} regions{w.introduced_l3?.length ? `, introduced in ${w.introduced_l3.length}` : ''})</span></dd></div>}
        {(w.lifeform || w.climate) && <div><dt>Life form · climate</dt><dd>{[w.lifeform, w.climate].filter(Boolean).join(' · ')}</dd></div>}
      </dl>
      <p className="small dim">Native range is drawn on the globe (green, introduced amber). Botanical-country scale: coarse, and “not recorded” is not proof of absence.</p>
    </div>
  )
}
