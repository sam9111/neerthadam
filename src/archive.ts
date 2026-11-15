import type { Catalog, Comparison, Group, Observation } from './catalog'
import type { ContextRaster } from './context'

export type SampleGrid = { url: string; width: number; height: number; affine: [number, number, number, number] }
export type SampleCatalog = Record<string, Record<string, SampleGrid>>
export type CompositeCatalog = {
  ranges: Record<'red' | 'green' | 'blue', [number, number]>
  groups: Record<string, Record<string, ContextRaster>>
}

export type ProductMetadata = Record<string, {
  processor: string | null; look: string | null; collection: string | null
  footprint: unknown; source: string | null
}>

export type Acquisition = Observation & {
  acquisitionId: string
  studyAreaId: number
  timestamp: string
  satellite: 'NISAR'
  product: 'L2 GCOV'
  band: 'L'
  frequency: Group['frequency']
  postingM: number
  track: number
  frame: number
  direction: string
  maturity: Group['maturity']
  processingVersion: string | null
  lookDirection: string | null
  sourceFootprint: unknown
  productMetadata: ProductMetadata[string] | null
  polarizations: ('HH' | 'HV')[]
  validDataFootprint: string
  qualityMask: 'applied to published assets' | 'available Harmony masks'
  imagery: ContextRaster | null
  numeric: SampleGrid | null
  capabilities: {
    discovered: true
    renderable: boolean
    inspectable: boolean
    comparable: boolean
    visualComparable: boolean
    quantitativelyComparable: boolean
    timeSeries: boolean
  }
}

export type ValidatedPair = Comparison & {
  id: string
  compatibility: 'verified'
  earlierAcquisitionId: string
  laterAcquisitionId: string
}

type VisualPair = {
  id: string; earlierId: string; laterId: string; coveragePct: number; exploratory: boolean
}

export type HarmonySeriesManifest = Record<string, {
  sourceGroups: string[]
  frames: Record<string, { imagery: ContextRaster; coveragePct: number; coverageUrl: string }>
  footprintUrl: string
  coveragePct: number
  pairs: Omit<VisualPair, 'id' | 'exploratory'>[]
}>

export type Series = Omit<Group, 'observations' | 'comparisons'> & {
  observations: Acquisition[]
  comparisons: ValidatedPair[]
  exploratoryPairs?: VisualPair[]
}

export function parseCatalog(value: unknown): Catalog {
  const catalog = value as Catalog | null
  if (catalog?.schemaVersion !== 1 || !Number.isInteger(catalog.site?.id) ||
      !Array.isArray(catalog.site.bounds) || catalog.site.bounds.length !== 4 ||
      !Array.isArray(catalog.groups)) throw new Error('Invalid observation catalog')
  const groups = new Set<string>()
  for (const group of catalog.groups) {
    if (!group.id || groups.has(group.id) || !Array.isArray(group.observations) ||
        !Array.isArray(group.comparisons)) throw new Error('Invalid acquisition group')
    groups.add(group.id)
    const ids = new Set<string>()
    for (const observation of group.observations) {
      if (!observation.id || ids.has(observation.id) || !Number.isFinite(Date.parse(observation.date))) {
        throw new Error('Invalid acquisition')
      }
      ids.add(observation.id)
    }
  }
  return catalog
}

export function buildArchive(catalog: Catalog, composites?: CompositeCatalog, samples?: SampleCatalog, products?: ProductMetadata): Series[] {
  return catalog.groups.map(group => {
    const ordered = [...group.observations].sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
    const byId = new Map(ordered.map(item => [item.id, item]))
    const acquisitionId = (id: string) => `${group.id}/${id}`
    // The v1 exporter publishes only processed pairs. Membership alone does not verify a pair.
    const comparisons = (group.qualityScreen === 'harmony' ? [] : group.comparisons).flatMap((pair): ValidatedPair[] => {
      const earlier = byId.get(pair.earlierId)
      const later = byId.get(pair.laterId)
      if (!earlier || !later || Date.parse(earlier.date) >= Date.parse(later.date) ||
          !pair.coverageUrl || !(pair.coveragePct > 0) || !pair.screen) return []
      return [{
        ...pair,
        id: `${pair.earlierId}/${pair.laterId}`,
        compatibility: 'verified',
        earlierAcquisitionId: acquisitionId(earlier.id),
        laterAcquisitionId: acquisitionId(later.id),
      }]
    })
    const observations = ordered.map((item): Acquisition => {
      const imagery = composites?.groups[group.id]?.[item.id] ?? null
      const numeric = samples?.[group.id]?.[item.id] ?? null
      const metadata = products?.[item.granuleId] ?? null
      const linked = comparisons.filter(pair => pair.earlierId === item.id || pair.laterId === item.id)
      const comparable = linked.length > 0
      const visualComparable = linked.some(pair => Boolean(composites?.groups[group.id]?.[pair.earlierId] &&
        composites.groups[group.id]?.[pair.laterId]))
      const quantitativelyComparable = linked.some(pair => Boolean(pair.layers.HH && pair.layers.HV))
      return {
        ...item, acquisitionId: acquisitionId(item.id), studyAreaId: catalog.site.id,
        timestamp: item.date, satellite: 'NISAR', product: 'L2 GCOV',
        band: 'L', frequency: group.frequency, postingM: group.spacingM,
        track: group.track, frame: group.frame, direction: group.direction,
        maturity: group.maturity, processingVersion: metadata?.processor ?? null,
        lookDirection: metadata?.look ?? null, sourceFootprint: metadata?.footprint ?? null, productMetadata: metadata,
        polarizations: (['HH', 'HV'] as const).filter(channel => Boolean(item.layers[channel])),
        validDataFootprint: item.coverageUrl, qualityMask: group.qualityScreen === 'harmony' ? 'available Harmony masks' : 'applied to published assets',
        imagery, numeric,
        capabilities: { discovered: true, renderable: Boolean(imagery), inspectable: Boolean(numeric),
          comparable, visualComparable, quantitativelyComparable, timeSeries: visualComparable },
      }
    })
    return { ...group, observations, comparisons }
  }).filter(group => group.observations.length)
}

export function compatibleSequence(series: Series, anchorId: string) {
  return series.observations.filter(item => item.id === anchorId || series.comparisons.some(pair =>
    (pair.earlierId === anchorId && pair.laterId === item.id) ||
    (pair.laterId === anchorId && pair.earlierId === item.id)))
}

export function applyHarmonySeries(archive: Series[], manifest: HarmonySeriesManifest): Series[] {
  let displayed = archive
  for (const [id, entry] of Object.entries(manifest)) {
    const base = displayed.find(group => group.id === id)
    if (!base) continue
    const sources = displayed.filter(group => entry.sourceGroups.includes(group.id))
    const items = sources.flatMap(group => group.observations)
    if (items.some(item => !entry.frames[item.id])) continue
    const pairs = entry.pairs.map(pair => ({
      ...pair, id: `${pair.earlierId}/${pair.laterId}`, exploratory: true,
    }))
    const observations = items.map(item => {
      const frame = entry.frames[item.id]
      const visualComparable = pairs.some(pair => pair.earlierId === item.id || pair.laterId === item.id)
      return {
        ...item, ...frame, acquisitionId: `${id}/${item.id}`,
        validDataFootprint: frame.coverageUrl, qualityMask: 'available Harmony masks' as const,
        capabilities: {
          ...item.capabilities, comparable: false, visualComparable, quantitativelyComparable: false,
          timeSeries: visualComparable,
        },
      }
    }).sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
    displayed = [...displayed.filter(group => !sources.includes(group)), {
      ...base, observations, comparisons: [], exploratoryPairs: pairs,
      coveragePct: entry.coveragePct, footprintUrl: entry.footprintUrl,
      notes: [
        'Every date uses the same native Harmony crop, subswath, looks and positive finite power screen.',
        'Native exception flags and noise estimates are unavailable in these crops. Playback is exploratory.',
      ],
    }]
  }
  return displayed
}

export function visualPairs(series: Series) {
  const renderable = new Set(series.observations.filter(item => item.imagery).map(item => item.id))
  const pairs: VisualPair[] = series.exploratoryPairs ?? series.comparisons.map(pair => ({
    ...pair, exploratory: false,
  }))
  return pairs.filter(pair => renderable.has(pair.earlierId) && renderable.has(pair.laterId))
}

export function playbackSequence(series: Series, anchorId?: string) {
  const pairs = visualPairs(series)
  const ordered = series.observations.filter(item => item.imagery)
  const pairExists = (earlier: string, later: string) =>
    pairs.some(pair => pair.earlierId === earlier && pair.laterId === later)

  // Three or more frames require a published group-wide support footprint as well
  // as validated consecutive comparisons. A single pair has its own footprint.
  const before = new Map<string, Acquisition[]>()
  const after = new Map<string, Acquisition[]>()
  for (const item of ordered) {
    const candidates = ordered.filter(other => pairExists(other.id, item.id))
      .map(other => before.get(other.id) ?? [other])
    before.set(item.id, [...longest(candidates), item])
  }
  for (const item of [...ordered].reverse()) {
    const candidates = ordered.filter(other => pairExists(item.id, other.id))
      .map(other => after.get(other.id) ?? [other])
    after.set(item.id, [item, ...longest(candidates)])
  }
  const paths = ordered.filter(item => !anchorId || item.id === anchorId)
    .map(item => {
      const prefix = before.get(item.id)!
      const suffix = after.get(item.id)!
      if (!(series.coveragePct > 0 && series.footprintUrl)) {
        return longest([prefix.slice(-2), suffix.slice(0, 2)])
      }
      return [...prefix.slice(0, -1), ...suffix]
    })
  return longest(paths)
}

function longest(paths: Acquisition[][]) {
  return paths.reduce<Acquisition[]>((best, path) => {
    if (path.length !== best.length) return path.length > best.length ? path : best
    const minimum = (items: Acquisition[]) => Math.min(...items.map(item => item.coveragePct))
    return minimum(path) > minimum(best) ? path : best
  }, [])
}

export function defaultSeries(archive: Series[], frequency: Group['frequency']) {
  const candidates = archive.filter(group => group.frequency === frequency && group.observations.some(item => item.imagery))
    .map(group => ({ group, sequence: playbackSequence(group) }))
  return candidates.sort((a, b) => {
    const preferred = (candidate: typeof a) => candidate.sequence.length > 1 && candidate.group.coveragePct >= 90
    return Number(preferred(b)) - Number(preferred(a)) ||
      b.sequence.length - a.sequence.length || b.group.coveragePct - a.group.coveragePct
  })[0]
}
