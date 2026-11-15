import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { asset, observationDate, type Catalog, type Group } from './catalog'
import { RadarMap, type Annotation } from './Map'
import {
  applyHarmonySeries, buildArchive, defaultSeries, parseCatalog, playbackSequence,
  type Acquisition, type CompositeCatalog, type HarmonySeriesManifest, type ProductMetadata, type SampleCatalog, type Series,
} from './archive'
import type { ContextRaster, OpticalCatalog } from './context'
import { loadRaster } from './RasterSwipe'
import { RadarLegend, type RadarSwatches } from './RadarLegend'
import { Tour } from './Tour'
import './style.css'

const viewLabel = { A: 'Detailed Marsh', B: 'Wider Landscape' }
const seenKey = 'neerthadam-landscape-tour-v2'
const pct = (value: number) => `${Number(value.toFixed(2))}%`
const shortDate = (date: string) => observationDate(date, { year: undefined })
const dateKey = (date: string) => new Date(date).toISOString().slice(0, 10)
const noAnnotations: Annotation[] = []

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

type Entry = { group: Series; item: Acquisition }
type InundationCatalog = { observations: Record<string, ContextRaster>; colors: string[] }
const inundationClasses = ['Classified as non-inundated', 'Likely open water', 'Possible inundated vegetation']

type CloudExample = ContextRaster & { source: string; acquiredAt: string; usable: number; tested: number }

function Workspace({ site, archive, ranges }: {
  site: Catalog['site']; archive: Series[]; ranges: CompositeCatalog['ranges']
}) {
  const defaults = useMemo(() => ({ A: defaultSeries(archive, 'A'), B: defaultSeries(archive, 'B') }), [archive])
  const initial = defaults.A ?? defaults.B
  const [track, setTrack] = useState<number | undefined>(initial?.group.track)
  const [selectedId, setSelectedId] = useState(initial?.sequence[0]?.acquisitionId)
  const [step, setStep] = useState<number | null>(initialTour)
  const [playAnchor, setPlayAnchor] = useState<string>()
  const [cameraRevision, setCameraRevision] = useState(0)
  const [layersOpen, setLayersOpen] = useState(false)
  const [legendOpen, setLegendOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [displayMode, setDisplayMode] = useState<'radar' | 'inundation'>('radar')
  const [overlays, setOverlays] = useState({ buildings: true, waterways: true, boundary: true, labels: false, optical: false })
  const swatches = useAsset<RadarSwatches>('context/radar-swatches.json').value
  const annotations = useAsset<Annotation[]>('context/landscape-annotations.json').value
  const optical = useAsset<OpticalCatalog>('context/sentinel/manifest.json').value?.observations[0]
  const inundation = useAsset<InundationCatalog>('context/inundation/manifest.json')
  const cloudy = useAsset<CloudExample>('context/sentinel/cloud-example.json')
  const entries = useMemo(() => archive.flatMap(group => group.observations.map(item => ({ group, item })))
    .sort((a, b) => Date.parse(a.item.timestamp) - Date.parse(b.item.timestamp)), [archive])
  const active = entries.find(entry => entry.item.acquisitionId === selectedId) ?? entries.find(entry => entry.item.imagery)
  const group = active?.group
  const observation = active?.item
  const frequency = group?.frequency ?? 'A'
  const selectedDay = observation ? dateKey(observation.timestamp) : undefined
  const timeline = useMemo(() => {
    const dates = new Map<string, Entry[]>()
    for (const entry of entries) {
      if ((track !== undefined && entry.group.track !== track) ||
          entry.group.frequency !== frequency || !entry.item.imagery) continue
      const day = dateKey(entry.item.timestamp)
      const products = dates.get(day) ?? []
      products.push(entry)
      dates.set(day, products)
    }
    return Array.from(dates, ([day, products]) => ({ day, products }))
  }, [entries, track, frequency])
  const timelineIndex = timeline.findIndex(date => date.day === selectedDay)
  const alternatives = timeline[timelineIndex]?.products ?? []
  const sequence = useMemo(() => group && observation ? playbackSequence(group, playAnchor ?? observation.id) : [],
    [group, playAnchor, observation?.id])
  const showCloud = step === 1 && overlays.optical ? cloudy.value : undefined
  const cloudyRadar = showCloud ? entries.find(({ item }) =>
    item.frequency === 'A' && item.imagery && dateKey(item.timestamp) === dateKey(showCloud.acquiredAt))?.item : undefined
  useEffect(() => {
    if (cloudyRadar) setSelectedId(cloudyRadar.acquisitionId)
  }, [cloudyRadar])
  const opticalRaster = useMemo(() => optical ? { url: optical.assets.rgb, coordinates: optical.coordinates } : undefined, [optical])
  const cloudyExample = showCloud && cloudyRadar?.imagery ? showCloud : undefined
  const opticalFrame = overlays.optical ? cloudyExample ?? opticalRaster : undefined
  const radarFrame = cloudyExample ? cloudyRadar : observation
  const opticalDate = cloudyExample?.acquiredAt ?? optical?.acquiredAt
  const swipe = opticalFrame && opticalDate && radarFrame?.imagery ? {
    raster: radarFrame.imagery,
    left: `NISAR · ${shortDate(radarFrame.timestamp)}`,
    right: `Sentinel-2 · ${shortDate(opticalDate)}`,
  } : undefined
  const inundationFrame = displayMode === 'inundation' && observation?.frequency === 'A'
    ? inundation.value?.observations[observation.granuleId] : undefined
  const raster = swipe ? opticalFrame : inundationFrame ?? observation?.imagery ?? undefined

  function manualSelect(id: string) {
    setPlayAnchor(undefined)
    setSelectedId(id)
  }

  function selectDate(index: number) {
    const available = timeline[index]?.products
    const next = available?.find(entry => entry.group.id === group?.id) ?? available?.[0]
    if (next) manualSelect(next.item.acquisitionId)
  }

  const previous = timelineIndex - 1
  const next = timelineIndex + 1 < timeline.length ? timelineIndex + 1 : -1
  const sliderLabels = timeline.length > 5 ? [timeline[0], timeline.at(-1)!] : timeline

  useEffect(() => {
    if (!observation) return
    let current = true
    let timer: number | undefined
    const position = sequence.findIndex(item => item.id === observation.id)
    const neighbors = [timeline[previous]?.products[0]?.item,
      timeline[next]?.products[0]?.item,
      sequence[(position + 1) % sequence.length],
      sequence[(position + sequence.length - 1) % sequence.length]]
    for (const item of neighbors) {
      const image = item?.imagery
      if (image) void loadRaster(image).catch(() => {})
    }
    if (playAnchor && sequence.length > 1 && observation.imagery) {
      void loadRaster(observation.imagery).catch(() => undefined).then(() => {
        if (current) timer = window.setTimeout(() => {
          setSelectedId(sequence[(position + 1) % sequence.length].acquisitionId)
        }, 2200)
      })
    }
    return () => { current = false; window.clearTimeout(timer) }
  }, [observation, sequence, playAnchor, timeline, previous, next, frequency])

  function togglePlay() {
    if (playAnchor) { setPlayAnchor(undefined); return }
    if (!observation || sequence.length < 2) return
    setPlayAnchor(observation.id)
  }

  function changeFrequency(nextFrequency: Group['frequency']) {
    const sameDate = timeline[timelineIndex]?.products.filter(entry => entry.group.frequency === nextFrequency && entry.item.imagery)
    const sameGeometry = sameDate?.find(entry => entry.group.track === group?.track && entry.group.frame === group.frame)
    const sameDay = sameGeometry ?? sameDate?.[0]
    const inTrack = entries.find(entry => entry.item.imagery && entry.group.frequency === nextFrequency && entry.group.track === track)
    const nextId = sameDay?.item.acquisitionId ?? (track === undefined
      ? defaults[nextFrequency]?.sequence[0]?.acquisitionId : inTrack?.item.acquisitionId)
    if (nextId) manualSelect(nextId)
  }

  function changeTrack(nextTrack: number | undefined) {
    setTrack(nextTrack)
    if (nextTrack === undefined || nextTrack === group?.track) return
    const available = entries.filter(entry => entry.item.imagery && entry.group.track === nextTrack)
    const preferred = available.find(entry => entry.group.frequency === frequency) ?? available[0]
    if (preferred) manualSelect(preferred.item.acquisitionId)
  }

  function tourStep(nextStep: number | null) {
    const defaultObservation = initial?.sequence[0]
    setStep(nextStep)
    setDisplayMode(nextStep === 4 ? 'inundation' : 'radar')
    setTrack(initial?.group.track)
    setSelectedId(defaultObservation?.acquisitionId)
    setPlayAnchor(nextStep === 3 && (initial?.sequence.length ?? 0) > 1 ? defaultObservation?.id : undefined)
    setOverlays({ buildings: true, waterways: true, boundary: true, labels: nextStep === 2, optical: nextStep === 1 })
    setLegendOpen(nextStep === 2)
    setDetailsOpen(false)
    setLayersOpen(false)
    if (nextStep === 0 || nextStep === 5 || nextStep === null) setCameraRevision(value => value + 1)
    if (nextStep === null) {
      try { localStorage.setItem(seenKey, 'done') } catch { /* In-memory completion. */ }
    }
  }

  const sensorChapter = step === 1
  const tourContext = sensorChapter ? !overlays.optical
    ? 'Enable Optical imagery in Layers to open the divider.'
    : cloudyExample && cloudyRadar
    ? `${observationDate(cloudyExample.acquiredAt)} · Sentinel-2 ${cloudyExample.acquiredAt.slice(11, 16)} UTC, NISAR ${cloudyRadar.timestamp.slice(11, 16)} UTC. Cloud screening retained ${cloudyExample.usable.toLocaleString()} of ${cloudyExample.tested.toLocaleString()} tested Sentinel-2 site centers.`
    : cloudy.failed || showCloud ? 'The archived radar and optical example is unavailable.' : 'Loading the archived cloudy optical example.'
    : step === 3 ? `${timeline.length} dates in the published archive. ${sequence.length > 1 ? `${sequence.length} observations in this playback sequence.` : 'Compatible playback is unavailable.'}`
    : undefined
  const visibleAnnotations = useMemo(() => overlays.labels && !(step === 3 && playAnchor)
    ? annotations?.filter(item => !item.observationId ||
      (!overlays.optical && !inundationFrame && item.observationId === observation?.acquisitionId)) ?? noAnnotations
    : noAnnotations, [annotations, overlays.labels, overlays.optical, inundationFrame, step, playAnchor, observation?.acquisitionId])
  const viewSwitch = [
    ['boundary', 'Ramsar site boundary'], ['buildings', 'Buildings'], ['waterways', 'Waterways'],
    ['optical', 'Optical imagery'], ['labels', 'Landscape labels'],
  ] as const

  return <main className={`explorer ${step === null ? '' : `tour-active chapter-${step + 1}`} ${swipe ? 'comparison-open' : ''}`}>
    <RadarMap site={site} raster={raster} swipe={swipe} cameraRevision={cameraRevision}
      hideBasemap={Boolean(cloudyExample && swipe)} annotations={visibleAnnotations}
      buildings={overlays.buildings} waterways={overlays.waterways} boundary={overlays.boundary} />
    <header className="brand floating">
      <div className="brand-mark" aria-hidden="true"><i /><i /><i /></div>
      <div><h1>Neerthadam <span lang="ta">நீர்த்தடம்</span></h1><p>Pallikaranai Marsh <span>· Chennai, India</span></p></div>
    </header>
    <div className="view-switch floating" aria-label="Map controls">
      <button type="button" aria-expanded={layersOpen} aria-controls="layer-menu" onClick={() => setLayersOpen(!layersOpen)}>Layers</button>
      <button type="button" title="Replay guided tour" onClick={() => tourStep(0)}>Help</button>
    </div>

    {layersOpen && <section id="layer-menu" className="control-card floating" aria-label="Map layers">
      <header><h2>Layers</h2><button className="dismiss" type="button" aria-label="Close layers" onClick={() => setLayersOpen(false)}>×</button></header>
      <fieldset><legend>Radar view</legend>
        {(['A', 'B'] as const).map(band => <label key={band}>
          <input type="radio" name="radar-view" checked={frequency === band} disabled={sensorChapter || !entries.some(({ item, group }) => item.imagery && group.frequency === band && (track === undefined || track === group.track))}
            onChange={() => changeFrequency(band)} />
          <span>{viewLabel[band]}<small>Frequency {band} · {defaults[band]?.group.spacingM ?? '—'} m</small></span>
        </label>)}
      </fieldset>
      <fieldset><legend>Acquisition track</legend>
        <select aria-label="Acquisition track" disabled={sensorChapter} value={track ?? 'all'}
          onChange={event => changeTrack(event.target.value === 'all' ? undefined : Number(event.target.value))}>
          <option value="all">All tracks</option>
          {Array.from(new Map(entries.filter(entry => entry.item.imagery)
            .map(({ group }) => [group.track, group.direction]))).sort(([a], [b]) => a - b)
            .map(([number, direction]) => <option key={number} value={number}>Track {number} · {direction}</option>)}
        </select>
      </fieldset>
      <fieldset><legend>Landscape overlays</legend>
        {viewSwitch.map(([key, label]) => <label key={key}><input type="checkbox" checked={overlays[key]}
          disabled={key === 'optical' && !optical && !(sensorChapter && cloudy.value) || key === 'labels' && !annotations}
          onChange={event => {
            const checked = event.target.checked
            if (key === 'optical') {
              setPlayAnchor(undefined)
              if (checked) setDisplayMode('radar')
            }
            setOverlays(state => ({ ...state, [key]: checked }))
          }} /> {label}</label>)}
      </fieldset>
      {cloudyExample && <p><a href={cloudyExample.source}>Sentinel-2 · {observationDate(cloudyExample.acquiredAt)}</a>
        {' · '}Cloud example. {cloudyExample.usable.toLocaleString()} of {cloudyExample.tested.toLocaleString()} tested site centers passed screening.</p>}
      {overlays.optical && optical && !cloudyExample && <p><a href={optical.sourceUrl}>Sentinel-2 · {observationDate(optical.acquiredAt)}</a>
        {' · '}{pct(optical.coveragePercent)} usable site pixel centers after cloud screening.</p>}
      {!optical && <p>Optical imagery is unavailable.</p>}
      <p>Buildings and waterways from OpenStreetMap.</p>
    </section>}

    {displayMode === 'inundation' ? <section className="reading floating inundation-key" aria-label="Inundation estimate">
      <strong>Inundation estimate</strong>
      {inundationFrame && observation ? <>
        <p>{observationDate(observation.timestamp)} · 10 m · Experimental</p>
        <ul>{inundationClasses.map((label, index) => <li key={label}>
          <i aria-hidden="true" style={{ background: inundation.value?.colors[index] }} />{label}
        </li>)}</ul>
        <p>Thresholds still need local validation. Areas without classified data show the basemap.</p>
      </> : <p role="status">{inundation.value || inundation.failed
        ? 'Estimate unavailable for this observation. Radar shown.'
        : 'Loading inundation estimates…'}</p>}
      <details key={step === 4 ? 'tour' : 'workspace'} className="inundation-info" open={step === 4}>
        <summary>Why does this matter?</summary>
        <div>
          <p>Mapping potential inundation across multiple observations could eventually help researchers understand seasonal water distribution, investigate conditions near Okkiyam Maduvu, and evaluate areas targeted for wetland restoration.</p>
          <p>The current prototype identifies candidate inundation signatures. Water depth and confirmed flooding require additional evidence.</p>
          <p>NISAR’s L-band radar responds to water and vegetation differently from optical imagery. Neerthadam uses an experimental classification algorithm to highlight radar signatures consistent with open water or potentially inundated vegetation.</p>
          <p>These preliminary results provide a starting point for investigating water conditions across Pallikaranai Marsh.</p>
        </div>
      </details>
    </section> : <RadarLegend frequency={frequency} swatches={swatches} expanded={legendOpen}
      onToggle={() => setLegendOpen(!legendOpen)} />}

    <div className="map-dock">
      <section className="acquisition-card floating" aria-label="Selected acquisition">
        {observation && group ? <>
          <p className="acquisition-sensor"><span className="status-dot" />NISAR <span>·</span> <time dateTime={observation.timestamp}>{observationDate(observation.timestamp)}</time></p>
          <p className="acquisition-view">{viewLabel[frequency]} <span>· {observation.postingM} m</span></p>
          <p className="acquisition-quality">{observation.maturity} <span>· {pct(observation.coveragePct)} site coverage</span></p>
          {group.exploratoryPairs && <p className="context-quality">Harmony · preliminary radar</p>}
          <button className="details-trigger" aria-expanded={detailsOpen} aria-controls="imagery-details"
            onClick={() => setDetailsOpen(!detailsOpen)}>Imagery Details <span aria-hidden="true">{detailsOpen ? '−' : '+'}</span></button>
          {detailsOpen && <div id="imagery-details" className="imagery-details floating">
            <h2>Imagery Details</h2>
            <dl>
              <dt>Acquired UTC</dt><dd>{observation.timestamp}</dd>
              <dt>Sensor</dt><dd>Frequency {frequency} · {observation.band}-band · {observation.polarizations.join(' / ') || 'Channels unknown'}</dd>
              <dt>Geometry</dt><dd>Track {observation.track} · Frame {observation.frame} · {observation.direction} · {observation.lookDirection ?? 'unknown'} look</dd>
              <dt>Processing</dt><dd>{group.release} · {observation.processingVersion ?? 'processor version unknown'}</dd>
              <dt>Coverage</dt><dd>{pct(observation.coveragePct)} valid site area · <a href={asset(observation.validDataFootprint)}>Footprint</a></dd>
            </dl>
            <h3>False-color display ranges</h3>
            <ul>{([['red', 'HH'], ['green', 'HV'], ['blue', 'HH−HV']] as const).map(([color, channel]) =>
              <li key={color}>{color} · {channel} · {ranges[color].join(' to ')} dB</li>)}</ul>
            {group.notes.map(note => <p key={note}>{note}</p>)}
            <p>{observation.productMetadata?.collection ?? observation.provenance?.collection ?? 'Source collection unknown'}</p>
            <p className="granule">{observation.granuleId}</p>
            {(observation.provenance?.downloadUrl || observation.productMetadata?.source) && <a
              href={observation.provenance?.downloadUrl ?? observation.productMetadata?.source ?? undefined}>Source product</a>}
          </div>}
        </> : <p>Radar imagery unavailable.</p>}
      </section>

      <section className="time-card floating" aria-label="Acquisition timeline">
        <div className="time-heading">
          <div><h2>Acquisition timeline</h2><p>{timeline.length} dates <span>·</span> {track !== undefined ? `Track ${track}` : 'All tracks'} <span>·</span> {timeline[0]?.day.slice(0, 4) === timeline.at(-1)?.day.slice(0, 4) && <>{timeline[0]?.day.slice(0, 4)} <span>·</span> </>}Observation index</p></div>
          <div className="time-actions">
            <button className="step-button" disabled={previous < 0 || sensorChapter} aria-label="Previous acquisition" onClick={() => selectDate(previous)}>‹</button>
            <button className="step-button" disabled={next < 0 || sensorChapter} aria-label="Next acquisition" onClick={() => selectDate(next)}>›</button>
            <button className="primary play-button" disabled={sequence.length < 2 || sensorChapter}
              onClick={togglePlay}>{playAnchor ? 'Pause' : 'Play'}</button>
          </div>
        </div>
        <div className="timeline-controls">
          <div className="display-mode" role="group" aria-label="Map display">
            {(['radar', 'inundation'] as const).map(mode => <button key={mode} type="button"
              aria-pressed={displayMode === mode} disabled={sensorChapter}
              onClick={() => {
                if (mode === displayMode) return
                setPlayAnchor(undefined)
                setDisplayMode(mode)
                if (mode === 'inundation') setOverlays(state => ({ ...state, optical: false }))
              }}>{mode === 'radar' ? 'Radar' : 'Inundation'}</button>)}
          </div>
          <div className="timeline-slider">
            <input type="range" min={0} max={Math.max(0, timeline.length - 1)} step={1}
              value={Math.max(0, timelineIndex)} disabled={sensorChapter || timeline.length < 2}
              aria-label="Acquisition date" aria-valuetext={selectedDay && observationDate(selectedDay)}
              onChange={event => selectDate(Number(event.target.value))} />
            <div className="slider-dates" aria-hidden="true">
              {sliderLabels.map(({ day }) => <time key={day} dateTime={day}
                className={day === selectedDay ? 'current' : undefined}>{shortDate(day)}</time>)}
            </div>
          </div>
        </div>
        <div className="time-footer">
          <span>{sequence.length > 1 ? `${sequence.length} ${group?.exploratoryPairs ? 'Harmony passes' : 'compatible passes'} · ${shortDate(sequence[0].timestamp)} to ${shortDate(sequence.at(-1)!.timestamp)}`
            : group?.qualityScreen === 'harmony' ? 'Browse only · full quality masks unavailable'
              : 'Playback requires compatible observations'}</span>
          {alternatives.length > 1 && <label>Product <select value={observation?.acquisitionId}
            onChange={event => manualSelect(event.target.value)}>{alternatives.map(({ item }) =>
              <option key={item.acquisitionId} value={item.acquisitionId}>{item.timestamp.slice(11, 19)} UTC · Track {item.track}</option>)}</select></label>}
        </div>
      </section>
    </div>
    {step !== null && <Tour step={step} context={tourContext} onStep={tourStep} onComplete={() => tourStep(null)} />}
  </main>
}

function App() {
  const catalog = useAsset<Catalog>('data/catalog.json')
  const composites = useAsset<CompositeCatalog>('data/composites.json')
  const samples = useAsset<SampleCatalog>('data/samples.json')
  const harmony = useAsset<HarmonySeriesManifest>('data/track149-harmony.json')
  const products = useAsset<ProductMetadata>('data/product-metadata.json')
  const parsed = useMemo(() => {
    try { return catalog.value && parseCatalog(catalog.value) } catch { return undefined }
  }, [catalog.value])
  const archive = useMemo(() => {
    if (!parsed || !harmony.value) return
    return applyHarmonySeries(buildArchive(parsed, composites.value, samples.value, products.value), harmony.value)
  }, [parsed, composites.value, samples.value, products.value, harmony.value])
  if (parsed && archive?.length && composites.value) return <Workspace site={parsed.site} archive={archive} ranges={composites.value.ranges} />
  const failed = catalog.failed || composites.failed || harmony.failed || (catalog.value && !parsed) || (archive && !archive.length)
  return <div className="loading"><h1>Neerthadam</h1><p role="status">{failed ? 'The radar archive is unavailable.' : 'Loading Pallikaranai Marsh…'}</p>
    {failed && <button type="button" onClick={() => location.reload()}>Try again</button>}</div>
}

createRoot(document.getElementById('root')!).render(<App />)
