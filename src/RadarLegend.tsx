import type { Group } from './catalog'
import type { RadarExample } from './radarExamples'

export type RadarSwatches = Record<Group['frequency'], { samples: string[]; sources: string[] }>

const channels = [
  ['#ff777a', 'Red · HH (horizontal → horizontal)', 'NISAR sends horizontally polarized radar and measures the horizontal return. This channel responds to surface roughness, moisture, vegetation structure and built structures.'],
  ['#9bd77a', 'Green · HV (horizontal → vertical)', 'NISAR sends horizontally polarized radar and measures the vertical return. This channel can respond to complex scattering within vegetation and other irregular structures.'],
  ['#86b9ff', 'Blue · HH−HV contrast', 'Blue shows HH minus HV in decibels. More blue indicates stronger relative HH–HV contrast on the display’s normalized scale.'],
]

const colors = [
  ['Magenta / purple', 'Prominent HH and contrast', 'Common in parts of the marsh. Several surface or vegetation conditions can produce this mix, including scattering from structures.', '#b851a7'],
  ['Olive green', 'Prominent HV contribution', 'Grasses, shrubs and other irregular surfaces can scatter radar into HV. Vegetation identification requires independent evidence.', '#78813e'],
  ['Dark blue', 'Prominent polarization contrast', 'Smooth or weakly scattering surfaces, including some open water, may look dark blue. Water presence requires independent evidence.', '#263b89'],
  ['Pale pink', 'Mixed scattering with prominent HH', 'This mix appears in parts of the marsh and around some mapped buildings. Several surface types can produce it.', '#dca3bd'],
]

export function RadarLegend({ frequency, swatches, expanded, onToggle, examples, onExample }: {
  frequency: Group['frequency']; swatches?: RadarSwatches; expanded: boolean; onToggle: () => void
  examples: RadarExample[]; onExample: (id: string) => void
}) {
  const samples = swatches?.[frequency].samples
  return <section className="reading floating" aria-labelledby="reading-title" data-expanded={expanded}>
    <button className="reading-toggle" aria-expanded={expanded} aria-controls="radar-interpretation" onClick={onToggle}>
      <strong id="reading-title">Reading the radar</strong><span aria-hidden="true">{expanded ? '−' : '+'}</span>
    </button>
    <div className="radar-key">HH · HV · HH−HV | NISAR L-band</div>
    <p>In this false-color radar image, colors combine backscatter measurements to show how the landscape reflects microwave signals.</p>
    <div id="radar-interpretation" hidden={!expanded}>
      <div className="interpretation-note">
        <strong>Radar colors are clues, not land-cover classifications.</strong>
        <p>Different surfaces can produce similar responses. Moisture, vegetation structure, roughness, viewing geometry and display normalization affect the colors.</p>
      </div>
      <div className="channel-list">
        {channels.map(([color, label, body]) => <details key={label}>
          <summary><i className="interpretation-swatch" style={{ background: color }} />{label}</summary>
          <p>{body}</p>
        </details>)}
      </div>
      <ul className="interpretation-cards">{colors.map(([label, signal, body, color], index) => <li key={label}>
        <i aria-hidden="true" style={{ background: samples?.[index] ?? color }} />
        <div><strong>{label}</strong><p>{signal}. {body}</p></div>
      </li>)}</ul>
      {examples.length > 0 && <div className="radar-examples">
        <strong>Radar examples</strong>
        <ul>{examples.map(example => <li key={example.id}>
          <span>{example.number}. {example.title}</span>
          <button type="button" aria-label={`View ${example.title.toLowerCase()} on map`}
            onClick={() => onExample(example.id)}>View on map</button>
        </li>)}</ul>
      </div>}
      <p><a href="https://science.nasa.gov/mission/nisar/polarimetry/" target="_blank" rel="noreferrer">NASA guide to radar polarization</a></p>
    </div>
  </section>
}
