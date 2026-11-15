import { useEffect, useState } from 'react'
import type { Acquisition } from './archive'
import { asset, observationDate } from './catalog'
import { db, sampleSeries } from './Inspection'
import type { RadarExample } from './radarExamples'

export function RadarExamplePopup({ example, observation }: { example: RadarExample; observation?: Acquisition }) {
  const [result, setResult] = useState<Awaited<ReturnType<typeof sampleSeries>>[number]>()
  useEffect(() => {
    if (!observation) return
    let current = true
    void sampleSeries(example.point, [observation], ['HH', 'HV']).then(([measurement]) => {
      if (current) setResult(measurement)
    })
    return () => { current = false }
  }, [example, observation])

  const measurement = result?.acquisitionId === observation?.acquisitionId ? result : undefined
  const day = observation && new Date(observation.timestamp).toISOString().slice(0, 10)
  const reading = measurement?.values
  return <div className="example-popup">
    <strong>{example.title}</strong>
    <p>{example.description}</p>
    {observation && <p className="example-acquisition">{observationDate(observation.timestamp)} · Track {observation.track} · Frequency {observation.frequency}</p>}
    <p className="example-reading" aria-live="polite">{reading?.HH !== undefined || reading?.HV !== undefined
      ? <>HH {reading.HH === undefined ? 'unavailable' : db(reading.HH)} · HV {reading.HV === undefined ? 'unavailable' : db(reading.HV)}</>
      : observation?.numeric && !measurement
        ? 'Loading radar measurements…'
        : 'Radar measurements unavailable for this observation.'}</p>
    <p>{example.evidence}</p>
    {day && day !== example.evidenceDate && <p>Optical evidence is from a different date. Surface conditions may differ.</p>}
    {example.note && <p>{example.note}</p>}
    <ul>{example.sources.map(source => <li key={source.href}>
      <a href={source.href.startsWith('https:') ? source.href : asset(source.href)} target="_blank" rel="noreferrer">{source.label}</a>
    </li>)}</ul>
  </div>
}
