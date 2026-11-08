import { useSelection } from '../store'

// Opens HarvestOps with a new passport prefilled for this plant (and harvested part, when known).
export default function StartPassport({ species, organ, className = 'btn sm soil' }: { species: string; organ?: string | null; className?: string }) {
  const { setSpecies, setOrgan, setPassport } = useSelection()
  return (
    <a className={className} href="#/plan/ops?new=1" data-testid="start-passport"
      onClick={() => { setSpecies(species); setOrgan(organ ?? null); setPassport(null) }}>
      Start a Harvest Passport
    </a>
  )
}
