import inventory from './plant-assets.generated.json'

// Visual models for the 3D studio. Species models are AI-generated illustrations of that species; generic models
// stand in for a growth form. Neither is a botanical reconstruction. Inventory comes from scripts/plant_assets.py.
export type PlantAsset = {
  id: string; file: string; label: string; status: 'ok' | 'error'; height?: number
  bounds_min?: number[] | null; bounds_max?: number[] | null; triangles?: number; archetypes: string[]
  licence?: { attribution: string; licence: string; licence_url: string | null; author: string | null; source_url: string | null } | null
  derived_from?: string | null; bytes: number; error?: string
  kind?: 'species' | 'generic'; species?: string[]; display_height?: number; footprint?: number
}

export const ASSETS: PlantAsset[] = (inventory as { assets: PlantAsset[] }).assets.filter((a) => a.status === 'ok')
export const assetById = (id: string) => ASSETS.find((a) => a.id === id)

// Display height on the soil plot (scene units). Conceptual only: not to botanical scale.
export const DISPLAY_HEIGHT: Record<string, number> = {
  'small-plant': 0.55, plant: 0.8, fern: 0.85, aloe: 0.6, flowers: 0.5, 'flower-single': 0.7, 'flower-single-2': 0.7,
  'flower-group': 0.7, 'flowering-bush': 1.1, 'big-leaf-plant': 1.6, 'dry-tree': 2.6, palm: 2.8, vines: 1.2,
  ...Object.fromEntries(ASSETS.filter((a) => a.display_height).map((a) => [a.id, a.display_height!])),
}

// Maximum ground footprint (scene units) so wide, low models such as rosettes do not swamp the plot.
export const FOOTPRINT: Record<string, number> = {
  'small-plant': 0.75, plant: 0.8, fern: 0.9, aloe: 0.7, flowers: 0.6, 'flower-single': 0.55, 'flower-single-2': 0.55,
  'flower-group': 0.7, 'flowering-bush': 1.1, 'big-leaf-plant': 1.4, 'dry-tree': 2.2, palm: 2.6, vines: 1.2,
  ...Object.fromEntries(ASSETS.filter((a) => a.footprint).map((a) => [a.id, a.footprint!])),
}

/** Heavy (AI-generated, ~20-35k triangle) models get fewer instances so three fields stay interactive. */
export const isHeavy = (id: string) => (assetById(id)?.triangles ?? 0) > 8000

// Species that have their own model.
const SPECIES_MODEL: Record<string, string> = Object.fromEntries(
  ASSETS.filter((a) => a.kind === 'species').flatMap((a) => (a.species ?? []).map((s) => [s, a.id])))

// Growth form -> pool of generic models (new AI generics first, then the earlier low-poly ones). A species always
// gets the same pick from its pool, so neighbouring species of one growth form still look different.
const POOLS: Record<string, string[]> = {
  'Herbaceous perennial': ['g-flowering-herb', 'g-low-herb', 'plant', 'flower-single', 'flower-group', 'small-plant'],
  Annual: ['g-weedy-herb', 'flowers', 'flower-single-2'],
  'Tree:tropical': ['g-tropical-tree', 'big-leaf-plant'],
  'Tree:temperate': ['g-temperate-tree'],
  'Tree:conifer': ['g-conifer'],
  Shrub: ['g-shrub', 'flowering-bush'],
  Palm: ['g-palm', 'palm'],
  'Succulent:cactus': ['g-cactus'],
  Succulent: ['aloe', 'g-cactus'],
  Liana: ['vines'], Fern: ['fern'], Epiphyte: ['small-plant', 'g-low-herb'], Algae: ['small-plant'],
}
const CONIFER = /^(Pinaceae|Cupressaceae|Taxaceae|Podocarpaceae|Araucariaceae|Sciadopityaceae)$/
const TROPICAL = /^(Meliaceae|Burseraceae|Clusiaceae|Phyllanthaceae|Anacardiaceae|Annonaceae|Myristicaceae|Sapotaceae|Moraceae|Dipterocarpaceae|Combretaceae|Lecythidaceae|Euphorbiaceae|Rubiaceae|Arecaceae|Chrysobalanaceae|Malvaceae|Bignoniaceae|Apocynaceae|Myrtaceae|Lauraceae)$/
// Curated choices where the family alone would mislead.
const OVERRIDES: Record<string, string> = { 'Garcinia lucida': 'g-tropical-tree' }

const pickFrom = (pool: string[], name: string) => {
  const ok = pool.filter((id) => assetById(id))
  if (!ok.length) return undefined
  const h = [...name].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) | 0, 7)
  return ok[Math.abs(h) % ok.length]
}

function poolKey(organismType?: string | null, family?: string | null) {
  if (organismType === 'Tree') return CONIFER.test(family ?? '') ? 'Tree:conifer' : TROPICAL.test(family ?? '') ? 'Tree:tropical' : 'Tree:temperate'
  if (organismType === 'Succulent' && family === 'Cactaceae') return 'Succulent:cactus'
  return organismType ?? ''
}

export type ModelChoice = { id: string; basis: string; kind: 'species' | 'generic' }

export function defaultArchetype(name: string, organismType?: string | null, family?: string | null): ModelChoice {
  const own = SPECIES_MODEL[name]
  if (own) return { id: own, basis: 'AI-generated model of this species: an illustration, not a botanical reconstruction', kind: 'species' }
  if (OVERRIDES[name] && assetById(OVERRIDES[name])) return { id: OVERRIDES[name], basis: 'generic model chosen for this species’ growth form (illustration)', kind: 'generic' }
  const key = poolKey(organismType, family)
  const id = POOLS[key] && pickFrom(POOLS[key], name)
  if (id) return { id, basis: `generic ${(organismType ?? 'plant').toLowerCase()} model, not this species (illustration)`, kind: 'generic' }
  return { id: pickFrom(['g-flowering-herb', 'plant'], name) ?? 'plant', basis: 'generic fallback: growth form unknown, please confirm the visual', kind: 'generic' }
}

export const SPECIES_COLOURS = ['#7fd19a', '#f2c45a', '#6ec6e0', '#f08a7a', '#b9a4f0']
