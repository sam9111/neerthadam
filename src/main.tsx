import { useCallback, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { asset, observationDate, type Catalog, type Polarization } from './catalog'
import { RadarMap, type ChangePoint } from './Map'
import { BackscatterSwipe } from './BackscatterSwipe'
import './style.css'

type Rainfall = { source: string; sourceUrl: string; windows: Record<string, {
  total: number | null; validDays: number
}> }

function useAsset<T>(url?: string) {
  const [result, setResult] = useState<{ url: string; value: T }>()
  useEffect(() => {
    if (!url) return
    const controller = new AbortController()
    fetch(asset(url), { signal: controller.signal }).then(response => {
      if (!response.ok) throw new Error('Asset unavailable')
      return response.json() as Promise<T>
    }).then(value => setResult({ url, value })).catch(() => {})
    return () => controller.abort()
  }, [url])
  return result?.url === url ? result?.value : undefined
}
const day = (date: string) => observationDate(date, { year: undefined })
const coverage = (value: number) => `${Number(value.toFixed(1))}%`
const db = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(1)} dB`

function Explorer({ catalog }: { catalog: Catalog }) {
  const [groupIndex, setGroup] = useState(0)
  const [pairIndex, setPair] = useState(0)
  const [dateIndex, setDateIndex] = useState(0)
  const [pol, setPol] = useState<Polarization>('HH')
  const [optical, setOptical] = useState(false)
  const [showDifference, setShowDifference] = useState(false)
  const [showCoverage, setCoverage] = useState(false)
  const [showMethods, setMethods] = useState(false)
  const [details, setDetails] = useState<ChangePoint>()
  const rain = useAsset<Rainfall>('context/rainfall.json')
  const group = catalog.groups[groupIndex]
  const pair = group.comparisons[pairIndex]
  const observation = group.observations[dateIndex]
  const earlier = group.observations.find(item => item.id === pair?.earlierId)
  const later = group.observations.find(item => item.id === pair?.laterId)
  const difference = !!pair && showDifference
  const active = difference ? pair : observation
  const layer = active.layers[pol]
  const candidates = useAsset<{ features: Array<{ properties: ChangePoint }> }>(pair?.candidateUrl)
  const points = useMemo(() => (candidates?.features ?? []).map(item => item.properties)
    .filter(point => point.polarization === pol && point.pixel_centroid_lon_lat?.length === 2)
    .sort((a, b) => b.site_area_ha - a.site_area_ha), [candidates, pol])
  const featured = useMemo(() => points.slice(0, 8), [points])
  const dates = details && earlier && later ? [earlier.date, later.date] : [observation.date]
  const title = difference && earlier && later ? `${day(earlier.date)} – ${observationDate(later.date)}` : observationDate(observation.date)

  const selectCandidate = useCallback((point: ChangePoint) => {
    setDetails(point)
    setMethods(false)
  }, [])

  return <main className="explorer">
    <RadarMap site={catalog.site} layer={layer} coverage={active.coverageUrl}
      showCoverage={showCoverage} optical={optical} points={featured}
      onSelect={selectCandidate} selected={details} />
    <header className="brand floating">
      <span className="brand-icon" aria-hidden="true">≋</span>
      <div><h1>Neerthadam</h1><p>Pallikaranai Marsh · Chennai</p></div>
    </header>
    <div className="view-switch floating" aria-label="Map layers">
      <button type="button" aria-pressed={!optical} onClick={() => setOptical(false)}>NISAR imagery</button>
      <button type="button" aria-pressed={optical} onClick={() => setOptical(true)}>Optical + infrastructure</button>
    </div>
    <section className="control-card floating" aria-label="Observation controls">
      <div className="control-heading">
        <div><h2>{difference ? 'Radar change' : 'NISAR backscatter'}</h2><p>{title}</p></div>
        <span className={`maturity ${group.maturity}`}>{group.maturity}</span>
      </div>
      <div className="controls">
        <select aria-label="Acquisition group" value={groupIndex} onChange={event => {
          setGroup(Number(event.target.value)); setPair(0); setDateIndex(0); setShowDifference(false); setDetails(undefined)
        }}>
          {catalog.groups.map((item, index) => <option key={item.id} value={index}>
            {day(item.observations[0].date)} series · {item.spacingM} m · {item.maturity}
          </option>)}
        </select>
        {group.comparisons.length > 1 && <select aria-label="Candidate comparison dates" value={pairIndex}
          onChange={event => { setPair(Number(event.target.value)); setDetails(undefined) }}>
          {group.comparisons.map((item, index) => <option key={index} value={index}>
            {day(group.observations.find(o => o.id === item.earlierId)!.date)}–{day(group.observations.find(o => o.id === item.laterId)!.date)}
          </option>)}
        </select>}
        <div className="polar" aria-label="Radar polarization">
          {(['HH', 'HV'] as const).map(channel => <button key={channel} type="button" aria-pressed={pol === channel}
            onClick={() => { setPol(channel); setDetails(undefined) }}>{channel}</button>)}
        </div>
      </div>
      {optical ? <p className="hint">Reference imagery · gold roads · cyan building footprints at closer zoom.</p> :
        <div className="legend"><div className={difference ? 'colorbar change' : 'colorbar'} />
          <div><span>{difference ? 'Weaker return' : 'Darker'} · {layer.min} dB</span><span>{difference ? 'Stronger return' : 'Brighter'} · {layer.max} dB</span></div></div>}
      {pair && !optical && <button className="difference-toggle" type="button" aria-pressed={difference}
        onClick={() => setShowDifference(!showDifference)}>{difference ? 'Change colors shown' : 'Show change colors'}</button>}
      <div className="card-footer">
        <button type="button" aria-pressed={showCoverage} onClick={() => setCoverage(!showCoverage)}>
          {coverage(active.coveragePct)} site coverage
        </button>
        <button type="button" aria-expanded={showMethods} onClick={() => (setMethods(!showMethods), setDetails(undefined))}>How to read this map</button>
      </div>
      {pair && featured.length > 0 && earlier && later && <p className="hint">Markers show candidate changes from {day(earlier.date)} to {day(later.date)}.</p>}
    </section>
    <section className="time-card floating" aria-label="Map time slider">
      <div className="time-heading"><strong>Acquisition timeline</strong><span>{observationDate(observation.date)}</span></div>
      <input type="range" min={0} max={group.observations.length - 1} step={1} value={dateIndex}
        disabled={group.observations.length < 2}
        aria-label="NISAR acquisition date" aria-valuetext={observationDate(observation.date)}
        onChange={event => { setDateIndex(Number(event.target.value)); setOptical(false); setShowDifference(false) }} />
      <div className="time-dates">
        <span>{day(group.observations[0].date)}</span>
        <span>{group.observations.length} observations</span>
        <span>{day(group.observations.at(-1)!.date)}</span>
      </div>
    </section>
    {showMethods && <aside className="info-card floating" aria-label="Map methods">
      <button type="button" className="close" aria-label="Close methods" onClick={() => setMethods(false)}>×</button>
      <h2>How to read this map</h2>
      <p>Blue and red show weaker and stronger radar returns on the later date. The change colors show native differences. Markers highlight the largest available candidate areas from a separate noise-screened, smoothed analysis.</p>
      <p>Rainfall estimates describe the marsh vicinity. The cause of each radar change remains unverified. The optical imagery and infrastructure are geographic reference layers.</p>
      <p>Site median on the shared footprint: {active.fixedFootprint[pol].median == null ? 'Unavailable' : db(active.fixedFootprint[pol].median)} · {group.release}</p>
      <details><summary>Source details</summary>
        <p>{group.direction} · Track {group.track} · Frame {group.frame} · {group.spacingM} m pixels</p>
        {dates.map(date => <p key={date}>{group.observations.find(item => item.date === date)?.granuleId}</p>)}
        {group.notes.map(note => <p key={note}>{note}</p>)}
      </details>
      <a href="https://rsis.ramsar.org/ris/2481" target="_blank" rel="noreferrer">Ramsar Site 2481</a>
    </aside>}
    {details && <aside className="info-card investigation floating" aria-label="Candidate investigation" aria-live="polite">
      <button type="button" className="close" aria-label="Close investigation" onClick={() => setDetails(undefined)}>×</button>
      <span className="kicker">Candidate radar change</span>
      <h2>{details.tail === 'upper' ? 'Stronger radar return' : 'Weaker radar return'}</h2>
      <p><strong>{db(details.median_change_db)}</strong> median change · {details.site_area_ha.toFixed(2)} ha · {pol}</p>
      {earlier && later && <BackscatterSwipe key={details.pixel_centroid_lon_lat.join(',')}
        before={earlier.layers[pol]} after={later.layers[pol]} center={details.pixel_centroid_lon_lat}
        beforeDate={earlier.date} afterDate={later.date} channel={pol} />}
      <h3>Rainfall near Pallikaranai</h3>
      {dates.map(date => {
        const window = rain?.windows[date.slice(0, 10)]
        return <div className="rain-row" key={date}><span>Before {day(date)}</span>
          <strong>{window?.total == null ? 'Unavailable' : `${window.total.toFixed(1)} mm`}</strong></div>
      })}
      <p>Seven complete UTC days before each image. Gridded rainfall gives context across the marsh vicinity.</p>
      {rain && <a href={rain.sourceUrl} target="_blank" rel="noreferrer">{rain.source}</a>}
      <p>Physical cause remains unverified.</p>
      <button type="button" onClick={() => setOptical(!optical)}>{optical ? 'Return to radar' : 'See nearby roads and buildings'}</button>
    </aside>}
  </main>
}

function App() {
  const [catalog, setCatalog] = useState<Catalog>()
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    fetch(asset('data/catalog.json'), { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Catalog unavailable')
      const data: Catalog = await response.json()
      if (data.schemaVersion !== 1 || !data.groups?.length || data.groups.some(group => !group.observations.length)) throw new Error('Invalid catalog')
      setCatalog(data)
    }).catch(error => { if (error.name !== 'AbortError') setFailed(true) })
    return () => controller.abort()
  }, [])
  if (catalog) return <Explorer catalog={catalog} />
  return <div className="loading"><h1>Neerthadam</h1><p role="status">{failed ? 'The map data could not be loaded.' : 'Loading Pallikaranai Marsh…'}</p>
    {failed && <button type="button" onClick={() => location.reload()}>Try again</button>}</div>
}

createRoot(document.getElementById('root')!).render(<App />)
