import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { asset, observationDate, type Catalog, type LonLat, type Polarization } from './catalog'
import { RadarMap } from './Map'
import { Measurements, db, type SampleCatalog } from './Inspection'
import { RainfallContext, type Rainfall } from './RainfallContext'
import type { ContextRaster, OpticalCatalog } from './context'
import { Tour } from './Tour'
import './style.css'

type Mode = 'Observe' | 'Compare' | 'Investigate'
type Display = 'radar' | 'reference' | 'swipe' | 'difference' | 'optical' | 'sensor-swipe'
type Footprint = 'off' | 'valid' | 'missing'
const seenKey = 'neerthadam-evidence-tour-v1'
const pct = (value: number) => `${Number(value.toFixed(2))}%`
const shortDate = (date: string) => observationDate(date, { year: undefined })

function useAsset<T>(path: string) {
  const [result, setResult] = useState<{ value?: T; failed?: boolean }>({})
  useEffect(() => {
    const controller = new AbortController()
    fetch(asset(path), { signal: controller.signal }).then(response => {
      if (!response.ok) throw new Error('Asset unavailable')
      return response.json() as Promise<T>
    }).then(value => setResult({ value })).catch(error => {
      if (error.name !== 'AbortError') setResult({ failed: true })
    })
    return () => controller.abort()
  }, [path])
  return result
}

function initialTour() {
  try { return localStorage.getItem(seenKey) ? null : 0 } catch { return 0 }
}

function Workspace({ catalog }: { catalog: Catalog }) {
  const julyIndex = catalog.groups.findIndex(group => group.track === 149 && group.frequency === 'A' &&
    group.observations[0]?.date.startsWith('2026-07-06'))
  const defaultGroup = Math.max(julyIndex, 0)
  const [step, setStep] = useState<number | null>(initialTour)
  const [mode, setMode] = useState<Mode>('Observe')
  const [display, setDisplay] = useState<Display>(() => initialTour() === null ? 'radar' : 'reference')
  const [groupIndex, setGroup] = useState(defaultGroup)
  const [dateIndex, setDate] = useState(0)
  const [pairIndex, setPair] = useState(0)
  const [pol, setPol] = useState<Polarization>('HH')
  const [footprint, setFootprint] = useState<Footprint>('off')
  const [opacity, setOpacity] = useState(1)
  const [location, setLocation] = useState<LonLat>()
  const [contextOpen, setContextOpen] = useState(false)
  const [infrastructure, setInfrastructure] = useState(() => initialTour() !== null)
  const [opticalLayer, setOpticalLayer] = useState('rgb')
  const sentinel = useAsset<OpticalCatalog>('context/sentinel/manifest.json')
  const cloudy = useAsset<ContextRaster & { source: string }>('context/sentinel/2026-07-18-cloudy-rgb.json')
  const rainfall = useAsset<Rainfall>('context/rainfall.json')
  const samples = useAsset<SampleCatalog>('data/samples.json')
  const group = catalog.groups[groupIndex]
  const observation = group.observations[dateIndex]
  const pair = group.comparisons[pairIndex]
  const earlier = group.observations.find(item => item.id === pair?.earlierId)
  const later = group.observations.find(item => item.id === pair?.laterId)
  const comparable = Boolean(pair && earlier && later && earlier.layers[pol].min === later.layers[pol].min &&
    earlier.layers[pol].max === later.layers[pol].max)
  const comparing = mode === 'Compare' && comparable
  const optical = sentinel.value?.observations[0]
  const opticalIndex = sentinel.value?.derivedProducts.find(item => item.kind === opticalLayer)
  const sensorSwipe = display === 'sensor-swipe'
  const opticalMap = display === 'optical'
  // July 18 T44PMV SCL contained only class 9 over the site (31,160 centers).
  // See research/sentinel_july_screen.csv for the source and native quality counts.
  const cloudyExample = step === 1 && observation.date.startsWith('2026-07-18')
  const showCloudImage = cloudyExample && sensorSwipe
  const difference = comparing && display === 'difference'
  const radarLayer = difference ? pair.layers[pol] : comparing ? later?.layers[pol] : observation.layers[pol]
  const opticalRaster = useMemo(() => optical ? {
    url: opticalIndex?.assets[opticalLayer.toLowerCase()] ?? optical.assets.rgb,
    coordinates: opticalIndex?.coordinates ?? optical.coordinates,
  } : undefined, [optical, opticalIndex, opticalLayer])
  const raster = showCloudImage ? cloudy.value ?? radarLayer : display === 'reference' ? undefined : opticalMap || sensorSwipe ? opticalRaster : radarLayer
  const swipe = comparing && display === 'swipe' && earlier && later ? {
    raster: earlier.layers[pol], left: shortDate(earlier.date), right: shortDate(later.date),
  } : showCloudImage && cloudy.value ? {
    raster: observation.layers[pol], left: 'NISAR · 13:11 UTC', right: 'Sentinel-2 · 05:15 UTC',
  } : sensorSwipe && optical && !cloudyExample ? {
    raster: observation.layers[pol], left: `NISAR · ${shortDate(observation.date)}`,
    right: `Sentinel-2 · ${shortDate(optical.acquiredAt)}`,
  } : undefined
  const observedSupport = comparing ? pair : observation
  const opticalMaskBase = optical ? `context/sentinel/${optical.acquiredAt.slice(0, 10)}` : ''
  const radarCoverage = observedSupport.coverageUrl
  const radarMissing = radarCoverage.replace('/coverage-', '/missing-')
  const coverage = opticalMap || sensorSwipe ? optical && `${opticalMaskBase}-coverage.geojson` : radarCoverage
  const missing = opticalMap || sensorSwipe ? optical && `${opticalMaskBase}-missing.geojson` : radarMissing
  const measured = useMemo(() => comparing && earlier && later ? [earlier, later] : [observation], [comparing, earlier, later, observation])
  const median = comparing ? pair.fixedFootprint[pol].median : null

  function chooseMode(next: Mode) {
    setMode(next)
    setDisplay(next === 'Compare' ? 'swipe' : 'radar')
    setContextOpen(false)
    setFootprint(next === 'Compare' ? 'valid' : 'off')
  }

  function tourStep(next: number) {
    setStep(next)
    setGroup(defaultGroup)
    setDate(next === 1 || next === 3 ? Math.min(1, catalog.groups[defaultGroup].observations.length - 1) : 0)
    setPair(0)
    setPol('HH')
    setOpacity(1)
    setOpticalLayer('rgb')
    setInfrastructure(next === 0 || next === 4)
    setMode(next === 3 ? 'Compare' : next === 1 || next === 4 ? 'Investigate' : 'Observe')
    setDisplay(next === 0 ? 'reference' : next === 1 ? 'sensor-swipe' : next === 3 ? 'swipe' : next === 4 ? 'optical' : 'radar')
    setFootprint(next === 2 || next === 3 ? 'valid' : 'off')
    setLocation(next === 4 ? catalog.site.center : undefined)
    setContextOpen(next === 4)
  }

  function finishTour() {
    try { localStorage.setItem(seenKey, 'done') } catch { /* Completion remains available in memory. */ }
    setStep(null)
    chooseMode('Observe')
  }

  function selectGroup(index: number) {
    setGroup(index)
    setDate(0)
    setPair(0)
  }

  function inspect(point: LonLat) {
    if (step !== null && step < 3) return
    setLocation(point)
    setContextOpen(true)
  }

  const locked = step !== null && step < 5
  return <main className={`explorer ${step === null ? '' : 'tour-active'}`}>
    <RadarMap site={catalog.site} raster={raster} swipe={swipe} optical={opticalMap || display === 'reference'}
      opacity={opacity} coverage={footprint === 'valid' ? coverage : undefined}
      missing={footprint === 'missing' ? missing : undefined}
      leftCoverage={sensorSwipe && footprint === 'valid' ? radarCoverage : undefined}
      leftMissing={sensorSwipe && footprint === 'missing' ? radarMissing : undefined}
      hideBasemap={showCloudImage} selected={location} onInspect={inspect} infrastructure={infrastructure} />
    <header className="brand floating"><span className="brand-icon" aria-hidden="true">≋</span>
      <div><h1>Neerthadam <span lang="ta">நீர்த்தடம்</span></h1><p>Pallikaranai Marsh · Chennai</p></div>
    </header>
    <nav className="view-switch floating" aria-label="Workspace">
      {(['Observe', 'Compare', 'Investigate'] as const).map(item => <button key={item} type="button"
        disabled={locked} aria-pressed={mode === item} onClick={() => chooseMode(item)}>{item}</button>)}
      <button type="button" disabled={step !== null} onClick={() => tourStep(0)}>Tour</button>
    </nav>

    {step !== 0 && <section className="control-card floating" aria-label="Layer and acquisition controls">
      <div className="control-heading">
        <div><h2>{comparing ? 'Radar comparison' : cloudyExample ? '18 July · observation coverage' : sensorSwipe ? 'Radar vs. optical' : opticalMap ? 'Sentinel-2 optical' : 'NISAR backscatter'}</h2>
          <p>{comparing && earlier && later ? `${shortDate(earlier.date)} – ${observationDate(later.date)}` : opticalMap && optical ? observationDate(optical.acquiredAt) : observationDate(observation.date)}</p></div>
        <span className={`maturity ${group.maturity}`}>{group.maturity}</span>
      </div>
      <p className="meta">L-band {group.frequency} · {group.spacingM} m posting · {group.direction} · Track {group.track} / Frame {group.frame}</p>
      <div className="controls">
        <select aria-label="Compatible acquisition group" value={groupIndex} disabled={locked}
          onChange={event => selectGroup(Number(event.target.value))}>
          {catalog.groups.map((item, index) => <option key={item.id} value={index}>{shortDate(item.observations[0].date)} · Frequency {item.frequency} · {item.maturity}</option>)}
        </select>
        {mode === 'Compare' && pair && <select aria-label="Compatible comparison pair" value={pairIndex} disabled={locked}
          onChange={event => setPair(Number(event.target.value))}>
          {group.comparisons.map((item, index) => {
            const one = group.observations.find(o => o.id === item.earlierId)
            const two = group.observations.find(o => o.id === item.laterId)
            return <option key={item.earlierId + item.laterId} value={index}>{one && shortDate(one.date)} – {two && shortDate(two.date)}</option>
          })}
        </select>}
        <div className="polar" aria-label="Polarization">{(['HH', 'HV'] as const).map(channel =>
          <button key={channel} type="button" aria-pressed={pol === channel} onClick={() => setPol(channel)}>{channel}</button>)}</div>
      </div>
      {mode === 'Compare' && !comparable && <p className="meta" role="status">Comparison unavailable. Dates must share a verified acquisition group, grid and display scale.</p>}
      {comparing && <div className="toggle-row">
        <button type="button" aria-pressed={!difference} onClick={() => setDisplay('swipe')}>Swipe</button>
        <button type="button" aria-pressed={difference} onClick={() => setDisplay('difference')}>Difference</button>
      </div>}
      {mode === 'Investigate' && !cloudyExample && <div className="toggle-row">
        <button type="button" aria-pressed={display === 'radar'} onClick={() => setDisplay('radar')}>Radar</button>
        <button type="button" aria-pressed={sensorSwipe} onClick={() => { setOpticalLayer('rgb'); setDisplay('sensor-swipe') }}>Radar vs. Optical</button>
        <button type="button" aria-pressed={opticalMap} onClick={() => setDisplay('optical')}>Optical</button>
      </div>}
      {opticalMap && optical && <label className="field">Optical layer<select value={opticalLayer} onChange={event => setOpticalLayer(event.target.value)}>
        <option value="rgb">True color</option>
        {sentinel.value?.derivedProducts.filter(item => item.kind === 'NDVI' || item.kind === 'MNDWI').map(item =>
          <option key={item.id} value={item.kind}>{item.kind}</option>)}
      </select></label>}
      {(sensorSwipe || opticalMap) && !optical && !cloudyExample && <p className="meta" role="status">{sentinel.failed ? 'Optical data unavailable.' : 'Loading optical observation…'}</p>}
      {sensorSwipe && optical && !cloudyExample && <p className="meta">Radar {pct(observation.coveragePct)} of site area · optical RGB {pct(optical.coveragePercent)} of 10 m site pixel centers. Acquisitions are separately dated.</p>}
      {opticalMap && optical && <p className="meta">{pct(opticalIndex?.coveragePercent ?? optical.coveragePercent)} usable site pixel centers · {opticalIndex?.resolutionMeters ?? optical.resolutionMeters} m posting.
        {opticalIndex?.formula && ` ${opticalLayer} (unitless, −1 to 1) · ${opticalIndex.formula}`}</p>}
      {cloudyExample && <p className="meta">18 July UTC · Sentinel-2 at 05:15, NISAR at 13:11. Radar passed the mask across {pct(observation.coveragePct)} of the site. Sentinel-2 retained 0 of 31,160 site pixel centers at 20 m. Every tested center was classified as high-probability cloud in the Sentinel-2 Scene Classification Layer. This unmasked RGB view uses a shared contrast stretch of the actual visible bands to reveal cloud detail. The cloud classification is a separate quality result. <a href="https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/S2B_44PMV_20260718_0_L2A" target="_blank" rel="noreferrer">Sentinel-2 source</a>{cloudy.value && <> · <a href={cloudy.value.source} target="_blank" rel="noreferrer">Red band source</a></>}</p>}
      {showCloudImage && !cloudy.value && <p role="status">{cloudy.failed ? "Sentinel-2 image unavailable." : "Loading Sentinel-2 true color…"}</p>}
      {radarLayer && !opticalMap && <div className="legend" aria-label="Backscatter legend">
        <p>{difference ? 'Later − earlier γ₀' : `${pol} gamma-zero (γ₀)`} · dB</p><div className={`colorbar ${difference ? 'change' : ''}`} />
        <div><span>{radarLayer.min} dB{difference && ' · weaker'}</span>{difference && <span>0 · near zero</span>}<span>{radarLayer.max} dB{difference && ' · stronger'}</span></div>
      </div>}
      {comparing && <div className="summary" aria-live="polite"><strong>{pct(pair.coveragePct)} common valid site area</strong>
        <p>{median === null ? 'Median unavailable' : `${db(median)} area-weighted median · ${pol}`}</p>
        <p>Native backscatter differences describe scattering. Their environmental cause remains unverified.</p>
      </div>}
      {!cloudyExample && <label className="field">Coverage<select value={footprint} onChange={event => setFootprint(event.target.value as Footprint)}>
        <option value="off">Hidden</option><option value="valid">{comparing ? 'Common valid footprint' : 'Valid footprint'}</option>
        <option value="missing">Missing data</option>
      </select></label>}
      {footprint !== 'off' && <p className="meta">{footprint === 'valid' ? 'Teal · valid under the applicable mask' : 'Amber · masked or outside valid coverage inside the site'}{opticalMap && opticalLayer !== 'rgb' && ' · Optical footprint is for RGB.'}</p>}
      <details className="layer-details"><summary>Opacity, metadata and quality</summary>
        <label className="field">Layer opacity<input type="range" min="0" max="1" step=".05" value={opacity} onChange={event => setOpacity(Number(event.target.value))} /></label>
        <p>{pct(observedSupport.coveragePct)} valid radar site area · {group.release} · {(group.centerFrequencyHz / 1e9).toFixed(4)} GHz</p>
        {measured.map(item => <p key={item.id}>{item.date} · {item.provenance ? <a href={item.provenance.downloadUrl} target="_blank" rel="noreferrer">{item.granuleId}</a> : item.granuleId}</p>)}
        {comparing && <p>{pair.screen}</p>}
        {group.notes.map(note => <p key={note}>{note}</p>)}
        <p><a href="https://rsis.ramsar.org/ris/2481" target="_blank" rel="noreferrer">Ramsar Site 2481</a> · ivory designation boundary</p>
      </details>
      {mode === 'Investigate' && <div className="toggle-row">
        <button type="button" aria-expanded={contextOpen} onClick={() => setContextOpen(!contextOpen)}>Evidence panel</button>
        <button type="button" aria-pressed={infrastructure} onClick={() => setInfrastructure(!infrastructure)}>Roads &amp; waterways</button>
      </div>}
    </section>}

    {step !== 0 && <section className="time-card floating" aria-label="Acquisition timeline">
      <div className="time-heading"><strong>Acquisition timeline</strong><span>{comparing ? 'Compatible pair' : 'UTC'}</span></div>
      <div className="date-buttons">{group.observations.map((item, index) => <button key={item.id} type="button"
        disabled={locked || comparing} aria-pressed={comparing ? measured.includes(item) : dateIndex === index}
        onClick={() => setDate(index)}>{observationDate(item.date)} <small>{pct(item.coveragePct)} valid</small></button>)}</div>
    </section>}

    {contextOpen && <aside className="info-card evidence floating" aria-label="Evidence panel">
      <button className="close" aria-label="Close evidence panel" onClick={() => setContextOpen(false)}>×</button>
      <h2>{location ? 'Location evidence' : 'Environmental context'}</h2>
      <h3>Observations</h3>
      {location ? <>
        <p>{location[1].toFixed(5)}° N · {location[0].toFixed(5)}° E · {group.maturity} · L-band {group.frequency} · {group.spacingM} m</p>
        {samples.value || samples.failed ? <Measurements key={`${location.join(',')}:${group.id}:${measured.map(item => item.id).join(',')}`}
          point={location} observations={measured} samples={samples.value?.[group.id]} /> : <p>Loading measurement catalog…</p>}
        <p>Native gamma-zero in dB. NoData marks locations without a usable sample in the exported raster. A difference requires valid values for that channel on both dates.</p>
      </> : <p>Click the map to inspect native HH/HV measurements.</p>}
      <h3>Environmental context</h3>
      {optical && <p><a href={optical.sourceUrl} target="_blank" rel="noreferrer">Sentinel-2 L2A · {observationDate(optical.acquiredAt)}</a>.
        RGB retains SCL classes 4, 5 and 6. Cloud, shadow and other excluded classes appear transparent. Optical reflectance supports spectral indices, while active radar measures scattering through most clouds, day or night.</p>}
      <RainfallContext rain={rainfall.value} dates={measured.map(item => item.date)} />
      {group.notes.slice(1).map(note => <p key={note}>{note}</p>)}
      <p>Gold roads and blue waterways show mapped geographic context when enabled. The ivory outline shows the Ramsar designation.</p>
      <h3>Interpretation</h3>
      <p>Radar returns can vary with moisture, roughness, vegetation structure, speckle and processing. Optical and radar dates differ. Repeated clear optical views, local water-level observations or field surveys can help distinguish explanations.</p>
    </aside>}
    {step !== null && <Tour step={step} onStep={tourStep} onComplete={finishTour} />}
  </main>
}

function App() {
  const { value, failed } = useAsset<Catalog>('data/catalog.json')
  const usable = value?.schemaVersion === 1 ? value.groups?.filter(group => group.observations.length) : undefined
  if (value && usable?.length) return <Workspace catalog={{ ...value, groups: usable }} />
  const empty = failed || Boolean(value)
  return <div className="loading"><h1>Neerthadam</h1><p role="status">{empty ? 'No observation catalog is available.' : 'Loading Pallikaranai Marsh…'}</p>
    {empty && <button type="button" onClick={() => location.reload()}>Try again</button>}</div>
}

createRoot(document.getElementById('root')!).render(<App />)
