import { create } from 'zustand'
import type { RegionInput } from './api'

export type Role = 'collector' | 'manager' | 'scientific-reviewer' | 'quality-reviewer' | 'admin'

// Cross-page case state: species, organ and region chosen on Explore carry into Simulate, Plan/HarvestOps
// and Evidence, so nobody re-enters the same information.
type Selection = {
  species: string | null
  organ: string | null
  region: RegionInput | null
  lastRunId: string | null
  passportId: string | null
  sceneId: string | null
  role: Role
  setSpecies: (s: string | null) => void
  setOrgan: (o: string | null) => void
  setRegion: (r: RegionInput | null) => void
  setLastRun: (id: string) => void
  setPassport: (id: string | null) => void
  setScene: (id: string | null) => void
  setRole: (r: Role) => void
}

const savedRole = (() => {
  try { return (localStorage.getItem('eh.role') as Role | null) ?? 'manager' } catch { return 'manager' as Role }
})()

export const useSelection = create<Selection>((set) => ({
  species: null,
  organ: null,
  region: null,
  lastRunId: null,
  passportId: null,
  sceneId: null,
  role: savedRole,
  setSpecies: (species) => set({ species }),
  setOrgan: (organ) => set({ organ }),
  setRegion: (region) => set({ region }),
  setLastRun: (lastRunId) => set({ lastRunId }),
  setPassport: (passportId) => set({ passportId }),
  setScene: (sceneId) => set({ sceneId }),
  setRole: (role) => {
    try { localStorage.setItem('eh.role', role) } catch { /* storage unavailable: role lasts for this session */ }
    set({ role })
  },
}))
