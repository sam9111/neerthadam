import { useEffect, useState } from 'react'
import proj4 from 'proj4'
import { asset, observationDate, type LonLat, type Observation } from './catalog'

export type SampleGrid = { url: string; width: number; height: number; affine: [number, number, number, number] }
export type SampleCatalog = Record<string, Record<string, SampleGrid>>
type Values = [number, number]
const utm = '+proj=utm +zone=44 +datum=WGS84 +units=m +no_defs'
export const db = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(3)} dB`
const sampleCache = new Map<string, Promise<DataView>>()

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

async function sample(grid: SampleGrid | undefined, point: LonLat): Promise<Values | undefined> {
  if (!grid) throw new Error('Samples unavailable')
  const [x, y] = proj4('EPSG:4326', utm, point)
  const [left, top, dx, dy] = grid.affine
  const row = Math.floor((y - top) / dy)
  const col = Math.floor((x - left) / dx)
  if (col < 0 || col >= grid.width || row < 0 || row >= grid.height) return undefined
  const index = row * grid.width + col
  const view = await bufferFor(grid)
  return [view.getFloat32(index * 4, true), view.getFloat32((index + grid.width * grid.height) * 4, true)]
}

export function Measurements({ point, observations, samples }: {
  point: LonLat; observations: Observation[]; samples?: Record<string, SampleGrid>
}) {
  const [result, setResult] = useState<(Values | undefined)[]>()
  const [error, setError] = useState(false)
  useEffect(() => {
    if (!samples) return
    let active = true
    Promise.all(observations.map(o => sample(samples[o.id], point))).then(
      values => { if (active) setResult(values) },
      () => { if (active) setError(true) },
    )
    return () => { active = false }
  }, [point, observations, samples])

  if (error) return <p role="status">Measurement files could not load.</p>
  if (!samples) return <p role="status">Measurement catalog unavailable.</p>
  if (!result) return <p role="status">Loading native measurements…</p>
  const format = (value?: number) => value !== undefined && Number.isFinite(value) ? db(value) : 'NoData'
  const difference = (channel: 0 | 1) => {
    const before = result[0]?.[channel]
    const after = result[1]?.[channel]
    return before !== undefined && after !== undefined ? format(after - before) : 'NoData'
  }
  return <table className="measurements"><thead><tr><th scope="col">UTC date</th><th scope="col">HH</th><th scope="col">HV</th></tr></thead>
    <tbody>{observations.map((item, index) => <tr key={item.id}><th scope="row">{observationDate(item.date)}</th>
      <td>{format(result[index]?.[0])}</td><td>{format(result[index]?.[1])}</td></tr>)}
      {observations.length === 2 && <tr><th scope="row">Later − earlier</th><td>{difference(0)}</td><td>{difference(1)}</td></tr>}
    </tbody></table>
}
