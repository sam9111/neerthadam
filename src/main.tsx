import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { asset, observationDate, type Catalog, type Comparison, type Group, type Polarization, type Stats } from './catalog'
import { RadarMap } from './Map'
import './style.css'

function Brand() {
  return <div className="brand">
    <svg width="37" height="37" viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <rect x=".5" y=".5" width="35" height="35" rx="10" stroke="#547f72" fill="#203e3a"/>
      <path d="M7 15c4.5 0 6.6-4 11-4s6.5 4 11 4M7 20c4.5 0 6.6-4 11-4s6.5 4 11 4M7 25c4.5 0 6.6-4 11-4s6.5 4 11 4" stroke="#c6e0a3" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
    <span>Neerthadam<small>Pallikaranai Marsh Observatory</small></span>
  </div>
}

function day(date: string) {
  return observationDate(date, { year: undefined })
}

function amount(value: number | null, signed = false) {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${signed && value > 0 ? '+' : ''}${value.toFixed(2)}`
}

function area(value: number) {
  if (Math.abs(100 - value) < 0.005) return '100%'
  return `${value.toFixed(1)}%`
}

function Trend({ group, activeId, pol, select }: {
  group: Group; activeId: string; pol: Polarization; select: (id: string) => void
}) {
  const dateValues = group.observations.map(item => Date.parse(item.date))
  const datesValid = dateValues.every(Number.isFinite)
  const start = Math.min(...dateValues)
  const end = Math.max(...dateValues)
  const xs = group.observations.map((_, i) => {
    if (group.observations.length === 1) return 114
    return datesValid && end > start
      ? 22 + 184 * (dateValues[i] - start) / (end - start)
      : 22 + 184 * i / (group.observations.length - 1)
  })
  const values = group.observations.map(item => item.fixedFootprint[pol].median)
  const valid = values.filter((v): v is number => v !== null && Number.isFinite(v))
  if (!valid.length) return <p className="empty-trend">No median available for the fixed footprint.</p>
  const min = Math.min(...valid)
  const max = Math.max(...valid)
  const span = Math.max(max - min, 0.75)
  const center = (min + max) / 2
  const ys = values.map(v => v === null ? null : 36 - 44 * (v - center) / span)
  return <div className="trend">
    <svg viewBox="0 0 228 72" role="img" aria-label={`Fixed-footprint median HH/HV series, ${pol}`}>
      {[14, 36, 58].map(y => <path key={y} d={`M15 ${y}H213`} stroke="#304744" strokeDasharray="3 4" />)}
      {xs.map((x, i) => i > 0 && ys[i] !== null && ys[i - 1] !== null &&
        <path key={x} d={`M${xs[i-1]} ${ys[i-1]}L${x} ${ys[i]}`} stroke="#c7e2a5" strokeWidth="1.4" strokeDasharray="3 4" />)}
      {group.observations.map((item, i) => ys[i] !== null && <circle key={item.id}
        cx={xs[i]} cy={ys[i]!} r={activeId === item.id ? 4.4 : 3.3}
        fill={activeId === item.id ? '#c7e2a5' : '#223d38'} stroke="#c7e2a5" strokeWidth="1.5">
        <title>{observationDate(item.date)} · {amount(values[i])} dB</title>
      </circle>)}
    </svg>
    <div className="trend-dates">{group.observations.map((item, i) => <button type="button" key={item.id}
      aria-pressed={activeId === item.id} onClick={() => select(item.id)}>
      {day(item.date)} <strong>{amount(values[i])}</strong>
    </button>)}</div>
  </div>
}

function Maturity({ value }: { value: Group['maturity'] }) {
  return <span className={`maturity ${value}`}><i aria-hidden="true" />{value}</span>
}

type Rainfall = {
  source: string; sourceUrl: string; longitude: number; latitude: number; units: 'mm'
  windows: Record<string, { start: string; end: string; total: number | null; validDays: number }>
}
function Precipitation({ dates }: { dates: string[] }) {
  const [data, setData] = useState<Rainfall | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    fetch(asset('context/rainfall.json'), { signal: controller.signal }).then(async response => {
      if (response.ok) setData(await response.json())
    }).catch(() => {})
    return () => controller.abort()
  }, [])
  if (!data) return null
  const windows = dates.map(date => ({ date, item: data.windows[date.slice(0, 10)] }))
  return <section className="rain-card">
    <h3>Gridded rainfall context</h3>
    {windows.map(({ date, item }) => <p key={date}>{day(date)} · <strong>
      {item?.total != null ? `${item.total.toFixed(1)} mm` : 'Unavailable'}
    </strong>{item && ` · ${item.validDays}/7 days`}</p>)}
    <p>Seven UTC days before each observation. <a href={data.sourceUrl} target="_blank" rel="noreferrer">{data.source}</a></p>
  </section>
}

function StatsPanel({ stats, comparison, coverage, group, selectedId, pol, select, rainDates }: {
  stats: Stats; comparison?: Comparison; coverage: number; group: Group
  selectedId: string; pol: Polarization; select: (id: string) => void; rainDates: string[]
}) {
  return <aside className="stats-panel">
    <header className="panel-heading"><h2>Observation statistics</h2><span>{pol}</span></header>
    <div className="primary-stat">
      <span>{comparison ? 'Median change' : 'Median backscatter'}</span>
      <div>{amount(stats.median, !!comparison)} <small>dB</small></div>
    </div>
    <dl className="stats-grid">
      <div><dt>5th percentile</dt><dd>{amount(stats.p05, !!comparison)} <small>dB</small></dd></div>
      <div><dt>95th percentile</dt><dd>{amount(stats.p95, !!comparison)} <small>dB</small></dd></div>
      <div><dt>Fixed-footprint cells</dt><dd>{stats.count.toLocaleString('en-GB')}</dd></div>
      <div><dt>{comparison ? 'Pair coverage' : 'Scene coverage'}</dt><dd>{area(coverage)}</dd></div>
    </dl>
    <section className="time-series">
      <header><h3>Acquisition series</h3><span>dB</span></header>
      <p>Median over the same {area(group.coveragePct)} of the site across this group.</p>
      <Trend group={group} activeId={selectedId} pol={pol} select={select} />
    </section>
    <Precipitation dates={rainDates} />
    <div className="study-note"><span aria-hidden="true">ⓘ</span><p>
      {group.maturity === 'provisional' && 'Provisional calibration and geometry may affect the signal. '}
      Backscatter reflects surface and vegetation conditions. The physical causes of mapped changes remain unverified.
    </p></div>
  </aside>
}

function Explorer({ catalog }: { catalog: Catalog }) {
  const [groupId, setGroupId] = useState(catalog.groups[0].id)
  const [observationId, setObservationId] = useState(catalog.groups[0].observations.at(-1)!.id)
  const [pol, setPol] = useState<Polarization>('HH')
  const [mode, setMode] = useState<'observation'|'change'>('observation')
  const [pairIndex, setPairIndex] = useState(0)
  const [coverage, setCoverage] = useState(false)
  const [candidates, setCandidates] = useState(true)
  const [opacity, setOpacity] = useState(.92)
  const [about, setAbout] = useState(false)
  const [coverageFootprint, setCoverageFootprint] = useState<'active'|'fixed'>('active')
  const processedCount = new Set(catalog.groups.flatMap(item => item.observations.map(o => o.granuleId))).size
  const group = catalog.groups.find(item => item.id === groupId)!
  const selected = group.observations.find(item => item.id === observationId) ?? group.observations.at(-1)!
  const pair = mode === 'change' ? group.comparisons[pairIndex] : undefined
  const later = (pair && group.observations.find(item => item.id === pair.laterId)) || selected
  const earlier = pair && group.observations.find(item => item.id === pair.earlierId)
  const active = pair ?? selected
  const layer = active.layers[pol]
  function switchGroup(id: string) {
    const group = catalog.groups.find(item => item.id === id)!
    setGroupId(id)
    setObservationId(group.observations.at(-1)!.id)
    setPairIndex(0)
    if (!group.comparisons.length) setMode('observation')
  }
  function switchObservation(id: string) {
    setObservationId(id)
    setMode('observation')
  }
  return <>
    <header className="topbar">
      <Brand />
      <button type="button" className="guide-button" onClick={() => setAbout(v => !v)} aria-expanded={about}>
        <span aria-hidden="true">ⓘ</span> Methods
      </button>
    </header>
    <main>
      <div className="page-heading">
        <div><p className="location"><span></span> CHENNAI, INDIA</p><h1>Radar time series</h1>
          <p>Explore NISAR observations across the Pallikaranai Marsh Ramsar site.</p>
          <p className="scope-count">{processedCount} processed acquisitions across {catalog.groups.length} compatible series</p></div>
        <div className="group-picker">
          <label htmlFor="group">Acquisition group</label>
          <select id="group" value={group.id} onChange={event => switchGroup(event.target.value)}>
            {catalog.groups.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
          <Maturity value={group.maturity} />
        </div>
      </div>
      {about && <section className="guide-panel">
        <h2>How to read the map</h2>
        <p>Backscatter is measured in decibels. Compare dates within a compatible group. The chart uses the overlap of valid HH and HV across all processed dates in that group.</p>
        <p>In change mode, positive values mean a stronger return on the later date. The raster shows native differences. Exploratory candidate outlines use a separate noise-screened 3 × 3 analysis. Coverage identifies usable measurements. Rainfall is contextual and does not establish a cause.</p>
        <div><a href="https://nisar-docs.asf.alaska.edu/gcov/" target="_blank" rel="noreferrer">About NISAR GCOV ↗</a>
          <a href="https://rsis.ramsar.org/ris/2481" target="_blank" rel="noreferrer">Ramsar Site 2481 ↗</a></div>
      </section>}
      <div className="workspace">
        <section className="map-panel" aria-label="Observation explorer">
          <div className="toolbar">
            <div className="seg" aria-label="Map mode">
              <button type="button" aria-pressed={!pair} onClick={() => setMode('observation')}>Backscatter</button>
              <button type="button" aria-pressed={!!pair} onClick={() => setMode('change')} disabled={!group.comparisons.length}>Pair change</button>
            </div>
            <div className="seg polar" aria-label="Polarization">
              {(['HH', 'HV'] as const).map(val => <button type="button" key={val} aria-pressed={pol === val} onClick={() => setPol(val)}>{val}</button>)}
            </div>
            <div className="map-meta">L-band {group.frequency}<b>·</b>{group.spacingM} m pixels</div>
          </div>
          <RadarMap site={catalog.site} layer={layer}
            coverage={coverageFootprint === 'fixed' ? group.footprintUrl : active.coverageUrl}
            candidateUrl={pair?.candidateUrl} showCoverage={coverage} showCandidates={candidates}
            mode={pair ? 'change' : 'observation'} opacity={opacity} polarization={pol}
            onCoverage={() => setCoverage(v => !v)} />
          <div className="layerbar">
            <div className="legend-block">
              <span><b>{pol}</b> {pair ? 'native change' : 'backscatter'} <small>dB</small></span>
              <div className="legend"><div className={pair ? 'gradient delta' : 'gradient'} />
                <div><span>{layer.min}</span><span>{pair && layer.min < 0 && layer.max > 0 ? 0 : ((layer.min + layer.max) / 2).toFixed(1)}</span><span>{layer.max}</span></div>
              </div>
            </div>
            <div className="layer-controls">
              {coverage && <select aria-label="Coverage footprint" value={coverageFootprint}
                onChange={e => setCoverageFootprint(e.target.value === 'fixed' ? 'fixed' : 'active')}>
                <option value="active">{pair ? 'Pair coverage' : 'Scene coverage'}</option>
                <option value="fixed">Fixed series footprint</option>
              </select>}
              {pair?.candidateUrl && <label className="checkbox"><input type="checkbox" checked={candidates} onChange={event => setCandidates(event.target.checked)} />3 × 3 candidates</label>}
              <label className="opacity">Opacity<input type="range" min=".15" max="1" step=".01"
                value={opacity} onChange={e => setOpacity(Number(e.target.value))} /></label>
            </div>
          </div>
        </section>
        <StatsPanel stats={active.fixedFootprint[pol]} comparison={pair}
          coverage={active.coveragePct} group={group} selectedId={later.id} pol={pol} select={switchObservation} rainDates={earlier ? [earlier.date, later.date] : [later.date]} />
      </div>
      <section className="timeline" aria-label="Timeline">
        <header><h2>Acquisition timeline</h2>
          <span>{group.observations.length} {group.observations.length === 1 ? 'observation' : 'observations'}</span></header>
        {pair ? <div className="pair-picker">
          <label htmlFor="pair">Compare dates</label>
          <select id="pair" value={pairIndex} onChange={e => setPairIndex(Number(e.target.value))}>
            {group.comparisons.map((comparison, i) => <option key={i} value={i}>
              {observationDate(group.observations.find(o => o.id === comparison.earlierId)!.date)} → {observationDate(group.observations.find(o => o.id === comparison.laterId)!.date)}
            </option>)}
          </select>
          {pair.screen && <p>{pair.screen}</p>}
        </div> : <div className="timeline-track">
          {group.observations.map(item => <button type="button" key={item.id} aria-pressed={selected.id === item.id}
            onClick={() => switchObservation(item.id)}>
            <span className="timeline-dot" aria-hidden="true" />
            <strong>{observationDate(item.date)}</strong><small>{area(item.coveragePct)} site coverage</small>
          </button>)}
        </div>}
      </section>
      <details className="provenance">
        <summary>Data provenance <span>{group.release}</span></summary>
        <p>NISAR L2 GCOV · {group.direction} · Track {group.track} · Frame {group.frame} · {(group.centerFrequencyHz / 1e9).toFixed(4)} GHz center frequency.</p>
        {earlier && <p className="granule">{earlier.granuleId}</p>}
        <p className="granule">{later.granuleId}</p>
        {group.notes.map(note => <p key={note}>{note}</p>)}
      </details>
    </main>
    <footer><span>Neerthadam · NASA Space Apps Challenge 2026</span><a href="https://rsis.ramsar.org/ris/2481" target="_blank" rel="noreferrer">Ramsar Site {catalog.site.id} ↗</a></footer>
  </>
}

function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [failure, setFailure] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    fetch(asset('data/catalog.json'), { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Catalog unavailable')
      const data: Catalog = await response.json()
      if (data.schemaVersion !== 1 || !data.groups?.length || data.groups.some(group => !group.observations.length)) {
        throw new Error('Catalog has no supported observations')
      }
      setCatalog(data)
    }).catch(error => { if (error.name !== 'AbortError') setFailure(true) })
    return () => controller.abort()
  }, [])
  return catalog ? <Explorer catalog={catalog} /> : <div className="load"><Brand />
    <p role="status">{failure ? 'The observation catalog could not be loaded.' : 'Loading NISAR observations…'}</p>
    {failure && <button type="button" onClick={() => location.reload()}>Try again</button>}
  </div>
}

createRoot(document.getElementById('root')!).render(<App />)
