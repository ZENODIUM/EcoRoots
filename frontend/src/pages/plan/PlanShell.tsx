import Plan from '../Plan'
import HarvestOps from './HarvestOps'
import Methods from './methods/Methods'
import './ops.css'

// Plan has two areas: conservation monitoring plans (the original planner) and HarvestOps.
export default function PlanShell({ sub }: { sub?: string | null }) {
  const ops = sub === 'ops'
  const methods = sub === 'methods'
  return (
    <div className="plan-shell">
      <nav className="plan-tabs" aria-label="Plan areas">
        <a href="#/plan" aria-current={!ops && !methods ? 'page' : undefined} data-testid="plan-tab-conservation">Conservation Plans</a>
        <a href="#/plan/ops" aria-current={ops ? 'page' : undefined} data-testid="plan-tab-ops">HarvestOps</a>
        <a href="#/plan/methods" aria-current={methods ? 'page' : undefined} data-testid="plan-tab-methods">Harvest methods</a>
      </nav>
      <div className="plan-body">{ops ? <HarvestOps /> : methods ? <Methods /> : <Plan />}</div>
    </div>
  )
}
