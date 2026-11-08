// Plain-language layer. User-facing labels live here; the technical term stays available in expert views.

export type EvidenceKind = 'experiment' | 'observational' | 'population-only' | 'synthetic' | 'visual-only' | 'none'

export const EVIDENCE: Record<EvidenceKind, { label: string; short: string; explain: string; tone: 'good' | 'info' | 'review' | 'none' }> = {
  experiment: {
    label: 'Published harvest experiment', short: 'Experiment', tone: 'good',
    explain: 'Researchers harvested plots on purpose and compared them with untouched plots. This is the strongest kind of evidence, but it describes that study site, not yours.',
  },
  observational: {
    label: 'Observed harvested vs less-harvested populations', short: 'Observational', tone: 'info',
    explain: 'Researchers compared populations that were already harvested more or less. Differences can also come from site, soil or climate, so this is not proof that harvest caused them.',
  },
  'population-only': {
    label: 'Population study only (no harvest data)', short: 'No harvest data', tone: 'review',
    explain: 'A published model of how this plant grows and survives exists, but nobody measured what harvesting does to it. Harvest scenarios would be guesses.',
  },
  synthetic: {
    label: 'Synthetic / educational (your own numbers)', short: 'Synthetic', tone: 'review',
    explain: 'Every rate was typed in by you. Useful for learning how plant populations work; it predicts nothing about a real population.',
  },
  'visual-only': {
    label: 'Visual only: no population model', short: 'Visual only', tone: 'none',
    explain: 'No published population model exists for this plant, so it is shown for layout only and does not change over time.',
  },
  none: { label: 'Insufficient evidence', short: 'Insufficient', tone: 'none', explain: 'No usable demographic evidence.' },
}

export function outlook(ratio: number | null, kind: EvidenceKind): { word: string; tone: 'good' | 'bad' | 'flat' | 'unknown' } {
  if (ratio == null || kind === 'visual-only' || kind === 'none') return { word: 'Unknown', tone: 'unknown' }
  if (ratio > 1.05) return { word: 'Growing', tone: 'good' }
  if (ratio < 0.95) return { word: 'Declining', tone: 'bad' }
  return { word: 'Roughly stable', tone: 'flat' }
}

// λ in words, for the expert drawer's plain summary line
export function lambdaWords(l: number) {
  const pct = (l - 1) * 100
  if (Math.abs(pct) < 0.5) return 'about the same size each year (long-run)'
  return pct > 0 ? `about ${pct.toFixed(1)}% larger each year (long-run)` : `about ${Math.abs(pct).toFixed(1)}% smaller each year (long-run)`
}

export const ORGAN_NOTE: Record<string, string> = {
  rhizome: 'Underground rhizome: digging removes or splits the plant’s storage organ and disturbs soil around neighbours.',
  root: 'Root harvest usually kills or severely sets back the whole plant.',
  bark: 'Bark stripping injures the living layer under the bark; girdling (all the way round) kills trees.',
  'bark + foliage': 'Bark and branch/foliage cutting act together here; their effects were not separated in the study.',
  leaf: 'Leaf removal reduces the plant’s capacity to make food; recovery depends on how many leaves are left.',
  fruit: 'Fruit harvest removes seeds that would become the next generation.',
  'resin (stem tapping)': 'Resin tapping wounds the stem; repeated tapping has been linked to reduced flowering and seed production.',
}
