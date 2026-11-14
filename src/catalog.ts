export type LonLat = [number, number]
export type Polarization = 'HH' | 'HV'
export type Stats = { count: number; p05: number | null; median: number | null; p95: number | null }
export type Layer = {
  url: string
  coordinates: [LonLat, LonLat, LonLat, LonLat]
  min: number
  max: number
  unit: 'dB'
}
export type Observation = {
  id: string; date: string; granuleId: string; coveragePct: number; coverageUrl: string
  layers: Record<Polarization, Layer>
  fixedFootprint: Record<Polarization, Stats>
}
export type Comparison = {
  earlierId: string; laterId: string; coveragePct: number; coverageUrl: string
  layers: Record<Polarization, Layer>
  candidateUrl?: string
  screen: string
  fixedFootprint: Record<Polarization, Stats>
}
export type Group = {
  id: string; label: string; maturity: 'provisional' | 'validated'; frequency: 'A' | 'B'
  centerFrequencyHz: number; spacingM: number; track: number; frame: number
  direction: string; release: string; footprintUrl: string; coveragePct: number
  notes: string[]; observations: Observation[]; comparisons: Comparison[]
}
export type Catalog = {
  schemaVersion: 1
  site: { name: string; id: number; boundaryUrl: string; center: LonLat
    bounds: [number, number, number, number] }
  groups: Group[]
}

export function asset(url: string) {
  return new URL(url, new URL(import.meta.env.BASE_URL, window.location.origin)).href
}

export function observationDate(date: string, styles?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric', ...styles,
  }).format(new Date(date.length === 10 ? `${date}T00:00:00Z` : date))
}
