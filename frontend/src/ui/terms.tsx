import { create } from 'zustand'
import type { ReactNode } from 'react'

// Plain words vs scientific terms, one switch for the whole app. Plain is the default.
// <T> keeps the other wording in the DOM (hidden), so text searches, reports and tests find either form.

type TermState = { plain: boolean; setPlain: (p: boolean) => void }
const saved = (() => { try { return localStorage.getItem('eh.terms') !== 'sci' } catch { return true } })()

export const useTerms = create<TermState>((set) => ({
  plain: saved,
  setPlain: (plain) => {
    try { localStorage.setItem('eh.terms', plain ? 'plain' : 'sci') } catch { /* storage unavailable: lasts this session */ }
    set({ plain })
  },
}))

export function T({ sci, plain }: { sci: ReactNode; plain: ReactNode }) {
  const p = useTerms((s) => s.plain)
  return <>{p ? plain : sci}<span hidden>{p ? sci : plain}</span></>
}

/** Pick a string by mode (for attributes, titles and places where hidden alternates do not make sense). */
export function useWord() {
  const p = useTerms((s) => s.plain)
  return (sci: string, plain: string) => (p ? plain : sci)
}

// Terms used across the scientific pages: the plain label, and a one-line explanation shown on hover or focus.
export const GLOSSARY: Record<string, { sci: string; plain: string; explain: string }> = {
  lambda: { sci: 'λ (population growth rate)', plain: 'yearly growth', explain: 'How much the population multiplies each year in the long run. Above 1 grows, below 1 shrinks.' },
  elasticity: { sci: 'elasticity', plain: 'how much growth depends on it', explain: 'The share of long-run growth that rests on one life process, such as adult survival or seed production.' },
  matrix: { sci: 'population matrix', plain: 'life-cycle table', explain: 'A table of how many plants survive, grow, shrink or produce seedlings from one year to the next, measured in the field.' },
  stochastic: { sci: 'stochastic λ', plain: 'growth across good and bad years', explain: 'Growth when good and bad years come in random order, simulated many times.' },
  ltre: { sci: 'LTRE', plain: 'what harvest changed', explain: 'Life table response experiment: splits the difference in growth between harvested and control plots into the life processes that caused it.' },
  ilp: { sci: 'ILP (integer linear programming)', plain: 'exact best choice', explain: 'A solver that checks every combination and returns the provably best plan within the budget.' },
  greedy: { sci: 'greedy baseline', plain: 'quick rule of thumb', explain: 'Picks the best-looking option one at a time. Fast, but can miss better combinations.' },
  jev: { sci: 'JEV', plain: 'the AI sorter', explain: 'An AI classifier that sorts papers and routes findings for review. It is advisory and can never change a number.' },
  qc: { sci: 'QC-passing', plain: 'passed quality checks', explain: 'The matrix passed our checks: survival between 0 and 1, consistent parts, no missing values.' },
  tier: { sci: 'evidence tier', plain: 'strength of evidence', explain: 'A: a published harvest study exists. B: a population model only. C: not enough data.' },
  cites: { sci: 'CITES appendix', plain: 'international trade listing', explain: 'CITES controls international trade in listed species. It does not grant or deny local harvesting permission.' },
  quota: { sci: 'quota answer', plain: 'what we can say about harvest limits', explain: 'Whether the evidence can support any statement about harvest amounts. Never a permit or a safe rate.' },
  dag: { sci: 'DAG', plain: 'step map', explain: 'The map of steps the agent ran and which step fed which.' },
  sensitivity: { sci: 'sensitivity', plain: 'what matters most', explain: 'How much long-run growth changes when one part of the life cycle changes a little.' },
  bootstrap: { sci: 'bootstrap', plain: 'resampling check', explain: 'Re-running the calculation on many reshuffled copies of the data to see how stable the answer is.' },
  recruitment: { sci: 'recruitment', plain: 'new young plants', explain: 'Seedlings that survive to join the population.' },
  phenology: { sci: 'phenology', plain: 'timing of flowering and fruit', explain: 'When in the year the plant flowers, fruits or sheds leaves.' },
}

/** A term with an explanation on hover/focus. Shows the plain or scientific label to match the switch. */
export function G({ k, children, icon }: { k: keyof typeof GLOSSARY | string; children?: ReactNode; icon?: boolean }) {
  const p = useTerms((s) => s.plain)
  const g = GLOSSARY[k]
  if (!g) return <>{children}</>
  const shown = icon ? <b className="gl-q" aria-hidden>?</b> : children ?? (p ? g.plain : g.sci)
  return (
    <span className="gl" tabIndex={0} data-tip={`${p ? g.sci : g.plain}: ${g.explain}`}>
      {shown}<span className="sr-only"> ({g.explain})</span>
    </span>
  )
}

export function TermSwitch() {
  const { plain, setPlain } = useTerms()
  return (
    <button type="button" className="term-switch" role="switch" aria-checked={!plain} onClick={() => setPlain(!plain)} data-testid="term-switch"
      title="Switch between everyday words and scientific terms">
      <span className={plain ? 'on' : ''}>Plain</span>
      <i aria-hidden><b /></i>
      <span className={plain ? '' : 'on'}>Scientific</span>
    </button>
  )
}
