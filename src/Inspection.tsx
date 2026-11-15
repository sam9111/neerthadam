import { useEffect, useState, type ReactNode } from 'react'
import proj4 from 'proj4'
import { asset, observationDate, type LonLat } from './catalog'
import type { Acquisition, SampleGrid, ValidatedPair } from './archive'

type Channel = 'HH' | 'HV' | 'HH − HV'
type Status = 'valid' | 'outside-imagery' | 'outside-measurement-grid' | 'unavailable' | 'masked' | 'load-failed'
type Measurement = {
  acquisitionId: string
  timestamp: string
  source: string
  status: Status
  values: Partial<Record<Channel, number>>
}
const utm = '+proj=utm +zone=44 +datum=WGS84 +units=m +no_defs'
export const db = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(3)} dB`
const sampleCache = new Map<string, Promise<DataView>>()
const channels: Channel[] = ['HH', 'HV', 'HH − HV']
const statusText: Record<Status, string> = {
  valid: 'Reading available',
  'outside-imagery': 'Outside the published radar image extent.',
  'outside-measurement-grid': 'The measurement grid does not cover this location.',
  unavailable: 'Numeric measurement asset unavailable.',
  masked: 'No usable native sample here. The export combines quality-screened, invalid source and site-excluded pixels.',
  'load-failed': 'The numeric measurement file could not load.',
}

function bufferFor(grid: SampleGrid) {
  let request = sampleCache.get(grid.url)
  if (!request) {
    request = fetch(asset(grid.url)).then(async response => {
      if (!response.ok) throw new Error('Samples unavailable')
      const bytes = await response.arrayBuffer()
      if (bytes.byteLength !== grid.width * grid.height * 8) throw new Error('Invalid samples')
      return new DataView(bytes)
    }).catch(error => { sampleCache.delete(grid.url); throw error })
    sampleCache.set(grid.url, request)
  }
  return request
}

async function sample(acquisition: Acquisition, point: LonLat, requested: readonly Channel[]): Promise<Measurement> {
  const result: Measurement = {
    acquisitionId: acquisition.acquisitionId, timestamp: acquisition.timestamp,
    source: acquisition.granuleId, status: 'unavailable', values: {},
  }
  const grid = acquisition.numeric
  const corners = acquisition.imagery?.coordinates
  function outsideImage() {
    if (!corners) return false
    return point.some((value, axis) => {
      const edges = corners.map(corner => corner[axis])
      return value < Math.min(...edges) || value > Math.max(...edges)
    })
  }
  if (!grid) return { ...result, status: outsideImage() ? 'outside-imagery' : 'unavailable' }
  const [x, y] = proj4('EPSG:4326', utm, point)
  const [left, top, dx, dy] = grid.affine
  const row = Math.floor((y - top) / dy)
  const col = Math.floor((x - left) / dx)
  if (col < 0 || col >= grid.width || row < 0 || row >= grid.height) {
    return { ...result, status: outsideImage() ? 'outside-imagery' : 'outside-measurement-grid' }
  }
  try {
    const index = row * grid.width + col
    const view = await bufferFor(grid)
    const hh = view.getFloat32(index * 4, true)
    const hv = view.getFloat32((index + grid.width * grid.height) * 4, true)
    const values = { HH: hh, HV: hv, 'HH − HV': hh - hv }
    for (const channel of requested) {
      if (Number.isFinite(values[channel])) result.values[channel] = values[channel]
    }
    return { ...result, status: Number.isFinite(hh) || Number.isFinite(hv) ? 'valid' : 'masked' }
  } catch {
    return { ...result, status: 'load-failed' }
  }
}

export function sampleSeries(point: LonLat, acquisitions: readonly Acquisition[], requested: readonly Channel[]) {
  return Promise.all(acquisitions.map(item => sample(item, point, requested)))
}

function History({ history, selected, channel }: { history: Measurement[]; selected: string; channel: Channel }) {
  const available = history.flatMap(item => item.values[channel] ?? [])
  if (!available.length) return <p>No usable {channel} measurements for this location.</p>
  const dates = history.map(item => Date.parse(item.timestamp))
  const min = Math.floor(Math.min(...available)) - 1
  const max = Math.ceil(Math.max(...available)) + 1
  const x = (index: number) => 37 + 234 * (dates[index] - dates[0]) / (dates.at(-1)! - dates[0] || 1)
  const y = (value: number) => 76 - 64 * (value - min) / (max - min)
  return <>
    <svg className="history-chart" viewBox="0 0 289 98" role="img" aria-label={`${channel} observations in dB, with gaps for unavailable samples`}>
      <path d="M37 12H274 M37 76H274" />
      <text x="0" y="16">{max} dB</text><text x="0" y="79">{min} dB</text>
      <text x="37" y="95">{observationDate(history[0].timestamp, { year: undefined })}</text>
      {history.length > 1 && <text x="271" y="95" textAnchor="end">{observationDate(history.at(-1)!.timestamp, { year: undefined })}</text>}
      {history.map((item, index) => {
        const value = item.values[channel]
        const previous = history[index - 1]?.values[channel]
        return value !== undefined && <g key={item.acquisitionId}>
          {previous !== undefined && <line x1={x(index - 1)} x2={x(index)} y1={y(previous)} y2={y(value)} />}
          <circle cx={x(index)} cy={y(value)} r={item.acquisitionId === selected ? 4.5 : 3}>
            <title>{observationDate(item.timestamp)} · {db(value)}</title>
          </circle>
        </g>
      })}
    </svg>
  </>
}

export function Measurements({ point, observations, historyIds, current, pair, sourceDetails }: {
  point: LonLat; observations: Acquisition[]; historyIds: string[]; current: Acquisition; pair?: ValidatedPair; sourceDetails: ReactNode
}) {
  const [result, setResult] = useState<Measurement[]>()
  const [channel, setChannel] = useState<Channel>('HH')
  const before = pair && result?.find(item => item.acquisitionId === pair.earlierAcquisitionId)
  const after = pair && result?.find(item => item.acquisitionId === pair.laterAcquisitionId)
  const sample = result?.find(item => item.acquisitionId === current.acquisitionId)
  useEffect(() => {
    let active = true
    void sampleSeries(point, observations, channels).then(values => { if (active) setResult(values) })
    return () => { active = false }
  }, [point, observations])

  if (!result) return <p role="status">Loading native measurements…</p>
  const valueLabel = (value?: number) => value === undefined ? 'Unavailable' : db(value)
  const history = result.filter(item => historyIds.includes(item.acquisitionId))
  const first = history[0]?.values.HH
  const last = history.at(-1)
  const latest = last?.values.HH
  const twoReadings = channel === 'HH' && history.length === 2 && first !== undefined && latest !== undefined
  const direction = twoReadings && Math.abs(latest - first) >= .001
    ? latest > first ? 'stronger' : 'weaker'
    : undefined
  return <>
    <p role="status">{sample?.status === 'masked' ? 'No usable reading at this point.' : sample && statusText[sample.status]}</p>
    <h3>{channel === 'HH' ? 'Reflected signal over time' : `${channel} over time`}</h3>
    <History history={history} selected={current.acquisitionId} channel={channel} />
    {twoReadings && last && <p className="history-reading">{direction
      ? `The reflected signal was ${direction} on ${observationDate(last.timestamp, { year: undefined })} than on ${observationDate(history[0].timestamp, { year: undefined })}.`
      : 'The reflected signal was nearly the same on both dates.'}</p>}
    <details className="layer-details evidence-section">
      <summary>Details</summary>
      <h3>Selected date</h3>
      <p>HH and HV measure the reflected signal in two ways. A higher value in either channel means a stronger return in that channel. HH − HV shows the difference between them in dB.</p>
      {sample?.status === 'masked' && <p>{statusText.masked}</p>}
      <dl className="reading-list">{channels.map(item => <div key={item}>
        <dt>{item}</dt><dd>{valueLabel(sample?.values[item])}</dd>
      </div>)}</dl>
      <label className="field">History channel<select value={channel} onChange={event => setChannel(event.target.value as Channel)}>
        {channels.map(item => <option key={item}>{item}</option>)}
      </select></label>
      {history.map(item => <p key={item.acquisitionId}><time>{observationDate(item.timestamp)}</time> ·
        {' '}{item.values[channel] === undefined ? (item.status === 'valid' ? 'Channel unavailable' : statusText[item.status]) : db(item.values[channel]!)}</p>)}
      {pair && <>
        <h3>Measured change</h3>
        {before && after && <p><time>{observationDate(before.timestamp)}</time> → <time>{observationDate(after.timestamp)}</time></p>}
        <dl className="reading-list">{channels.map(item => {
          const one = before?.values[item]
          const two = after?.values[item]
          return <div key={item}><dt>{item}</dt><dd>{valueLabel(one != null && two != null ? two - one : undefined)}</dd></div>
        })}</dl>
        <p>Later minus earlier. The environmental cause requires independent evidence.</p>
      </>}
      <h3>Location and sources</h3>
      {sourceDetails}
    </details>
  </>
}
