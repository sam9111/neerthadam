import { useEffect, useRef } from 'react'

const chapters = [
  ['A Wetland Surrounded by a City', 'The lime outline marks the Ramsar site. Amber footprints show mapped buildings, and cyan lines trace mapped waterways. The designation covers part of a wider wetland landscape.'],
  ['Why Radar?', 'Radar records scattering through most clouds. Use the divider to see how cloud obscured the optical image of the site.'],
  ['Reading the Radar Landscape', 'Open the labeled building and channel to see the independent map sources. Red shows HH, green shows HV, and blue shows their difference. Similar colors can occur over different landscapes.'],
  ['Watching the Marsh Through Time', 'Use Play or Pause to watch aligned Harmony observations in sequence. Drag the slider or use the arrow keys to pause and revisit a date.'],
  ['Exploring Potential Inundation', 'The map now shows the experimental inundation estimate for July 6. Read Why does this matter? to see how researchers could use it. Try Radar and Inundation beside the timeline to compare the same area.'],
  ['Explore Freely', 'Use the timeline to revisit an acquisition and Layers to explore the landscape. Switch to Inundation on July 6 or July 18 to revisit the experimental estimate.'],
]

export function Tour({ step, onStep, onComplete, context }: {
  step: number; onStep: (step: number) => void; onComplete: () => void; context?: string
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [step])
  return <section className="tour floating" aria-labelledby="tour-heading">
    <div className="tour-progress"><span>Guided tour · {step + 1} / {chapters.length}</span>
      <progress max={chapters.length} value={step + 1} aria-label="Tour progress" /></div>
    <h2 id="tour-heading" ref={heading} tabIndex={-1}>{chapters[step][0]}</h2>
    <p>{chapters[step][1]}{context && <> {context}</>}</p>
    <div className="tour-actions">
      <button type="button" disabled={step === 0} onClick={() => onStep(step - 1)}>Back</button>
      <button type="button" className="primary" onClick={() => step === chapters.length - 1 ? onComplete() : onStep(step + 1)}>
        {step === chapters.length - 1 ? 'Enter workspace' : 'Next'}
      </button>
    </div>
  </section>
}
