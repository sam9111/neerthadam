import { useCallback, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { asset, observationDate, type Catalog, type Polarization } from './catalog'
import { RadarMap, type ChangePoint } from './Map'
import { BackscatterSwipe } from './BackscatterSwipe'
import { RegionalSeries } from './RegionalSeries'
import { RainfallContext, type Rainfall } from './RainfallContext'
import type { OpticalCatalog } from './context'
import './style.css'

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
  const [commonCoverage, setCommonCoverage] = useState(false)
  const [showMethods, setMethods] = useState(false)
  const [showSeries, setShowSeries] = useState(false)
  const [details, setDetails] = useState<ChangePoint>()
  const [contextType, setContextType] = useState<'reference' | 'sentinel' | 'landsat'>('reference')
  const [contextIndex, setContextIndex] = useState(0)
  const [opticalLayer, setOpticalLayer] = useState('rgb')
  const [contextOpacity, setContextOpacity] = useState(.95)
  const [waterways, setWaterways] = useState(false)
  const [dumpyard, setDumpyard] = useState(false)
  const [weather, setWeather] = useState(false)
  const opticalData = useAsset<OpticalCatalog>(optical && contextType !== 'reference' ? `context/${contextType}/manifest.json` : undefined)
  const opticalObservation = opticalData?.observations[contextIndex]
  const indices = opticalData?.derivedProducts.filter(item =>
    (item.kind === 'NDVI' || item.kind === 'MNDWI') && item.observationIds.includes(opticalObservation?.id ?? ''))
  const derived = indices?.find(item => item.kind === opticalLayer)
  const contextRaster = useMemo(() => {
    if (!optical || contextType === 'reference' || !opticalObservation) return
    const url = derived?.assets[derived.kind.toLowerCase()] ?? opticalObservation.assets.rgb
    return { url, coordinates: derived?.coordinates ?? opticalObservation.coordinates }
  }, [optical, contextType, opticalObservation, derived])
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
    setShowSeries(false)
    setWeather(false)
  }, [])

  function selectDate(index: number) {
    setDateIndex(index)
    setOptical(false)
    setShowDifference(false)
  }

  return <main className="explorer">
    <RadarMap site={catalog.site} layer={layer} coverage={commonCoverage ? group.footprintUrl : active.coverageUrl}
      showCoverage={showCoverage} optical={optical} points={featured}
      onSelect={selectCandidate} selected={details} contextRaster={contextRaster}
      contextOpacity={contextOpacity} waterways={waterways} dumpyard={dumpyard} />
    <header className="brand floating">
      <span className="brand-icon" aria-hidden="true">≋</span>
      <div><h1>Neerthadam</h1><p>Pallikaranai Marsh · Chennai</p></div>
    </header>
    <div className="view-switch floating" aria-label="Map layers">
      <button type="button" aria-pressed={!optical} onClick={() => setOptical(false)}>NISAR imagery</button>
      <button type="button" aria-pressed={optical} onClick={() => setOptical(true)}>Context</button>
    </div>
    <section className="control-card floating" aria-label="Observation controls">
      <div className="control-heading">
        <div><h2>{optical ? 'Map context' : difference ? 'Radar change' : 'NISAR backscatter'}</h2><p>{optical ? 'Radar reference · ' : ''}{title}</p></div>
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
      {optical ? <div className="context-options">
        <label>Imagery<select value={contextType} onChange={event => {
          const value = event.target.value
          if (value === 'reference' || value === 'sentinel' || value === 'landsat') {
            setContextType(value)
            setContextIndex(0)
            setOpticalLayer('rgb')
          }
        }}>
          <option value="reference">Satellite reference</option>
          <option value="sentinel">Sentinel-2 optical</option>
          <option value="landsat">Landsat history</option>
        </select></label>
        {contextType !== 'reference' && !opticalObservation && <p role="status">Optical observation unavailable or loading.</p>}
        {opticalObservation && <>
          <label>Optical date<select value={contextIndex} onChange={event => { setContextIndex(Number(event.target.value)); setOpticalLayer('rgb') }}>
            {opticalData?.observations.map((item, index) => <option value={index} key={item.id}>{observationDate(item.acquiredAt)}</option>)}
          </select></label>
          {!!indices?.length && <label>Optical layer<select value={opticalLayer}
            onChange={event => setOpticalLayer(event.target.value)}>
            <option value="rgb">True color</option>
            {indices.map(item => <option key={item.id} value={item.kind}>{item.kind}</option>)}
          </select></label>}
          {derived && <div className="index-legend">
            <div className={derived.kind.toLowerCase()} />
            <p>−1 · 0 · +1 {derived.kind} (unitless)</p>
            <p>{derived.kind === 'NDVI' ? 'Vegetation-related spectral index.' : 'Water-related spectral index.'} Interpret with imagery.</p>
          </div>}
          <label>Opacity<input type="range" min="0.1" max="1" step="0.05" value={contextOpacity}
            onChange={event => setContextOpacity(Number(event.target.value))} /></label>
          <p>{derived?.resolutionMeters ?? opticalObservation.resolutionMeters} m · {coverage(derived?.coveragePercent ?? opticalObservation.coveragePercent)} valid within site.
            Optical and radar dates differ. Reference imagery can show through excluded pixels.</p>
          <a href={opticalObservation.sourceUrl} target="_blank" rel="noreferrer">{opticalObservation.attribution ?? opticalObservation.sensor}</a>
        </>}
        <div className="infrastructure-options">
          <label><input type="checkbox" checked={waterways} onChange={event => setWaterways(event.target.checked)} /> Mapped waterways</label>
          <label><input type="checkbox" checked={dumpyard} onChange={event => setDumpyard(event.target.checked)} /> Dumpyard location</label>
        </div>
        <p>Gold roads · cyan buildings at closer zoom · blue waterways.</p>
      </div> :
        <div className="legend"><div className={difference ? 'colorbar change' : 'colorbar'} />
          <div><span>{difference ? 'Weaker return' : 'Darker'} · {layer.min} dB</span><span>{difference ? 'Stronger return' : 'Brighter'} · {layer.max} dB</span></div></div>}
      {pair && !optical && <button className="difference-toggle" type="button" aria-pressed={difference}
        onClick={() => setShowDifference(!showDifference)}>{difference ? 'Change colors shown' : 'Show change colors'}</button>}
      <div className="card-footer">
        <button type="button" aria-pressed={showCoverage} onClick={() => setCoverage(!showCoverage)}>
          {coverage(commonCoverage ? group.coveragePct : active.coveragePct)} {commonCoverage ? 'shared' : difference ? 'pair' : 'site'} coverage
        </button>
        <button type="button" aria-expanded={weather} onClick={() => { setWeather(!weather); setDetails(undefined); setMethods(false); setShowSeries(false) }}>Rainfall</button>
        <button type="button" aria-expanded={showMethods} onClick={() => (setMethods(!showMethods), setDetails(undefined), setShowSeries(false), setWeather(false))}>How to read this map</button>
      </div>
      {showCoverage && <label className="coverage-option"><input type="checkbox" checked={commonCoverage}
        onChange={event => setCommonCoverage(event.target.checked)} /> Shared coverage across series</label>}
      {pair && featured.length > 0 && earlier && later && <p className="hint">Markers show candidate changes from {day(earlier.date)} to {day(later.date)}.</p>}
    </section>
    <section className="time-card floating" aria-label="Map time slider">
      <div className="time-heading"><strong>Acquisition timeline</strong><button type="button" aria-expanded={showSeries} onClick={() => { setShowSeries(!showSeries); setDetails(undefined); setMethods(false); setWeather(false) }}>Regional chart</button></div>
      <input type="range" min={0} max={group.observations.length - 1} step={1} value={dateIndex}
        disabled={group.observations.length < 2}
        aria-label="NISAR acquisition date" aria-valuetext={observationDate(observation.date)}
        onChange={event => selectDate(Number(event.target.value))} />
      <div className="time-dates">
        <span>{day(group.observations[0].date)}</span>
        <span>{group.observations.length} observations</span>
        <span>{day(group.observations.at(-1)!.date)}</span>
      </div>
    </section>
    {weather && <aside className="info-card floating" aria-label="Rainfall context">
      <button type="button" className="close" aria-label="Close rainfall" onClick={() => setWeather(false)}>×</button>
      <RainfallContext rain={rain} dates={difference && earlier && later ? [earlier.date, later.date] : [observation.date]} />
    </aside>}
    {showSeries && <aside className="info-card floating" aria-label="Regional chart">
      <button type="button" className="close" aria-label="Close regional chart" onClick={() => setShowSeries(false)}>×</button>
      <RegionalSeries group={group} pol={pol} selected={dateIndex} onSelect={selectDate} />
    </aside>}
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
      <RainfallContext rain={rain} dates={dates} />
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
