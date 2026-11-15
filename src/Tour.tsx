import { useEffect, useRef } from 'react'

const chapters = [
  ['A Wetland Surrounded by a City', 'The lime outline marks the Ramsar site. Amber footprints show mapped buildings, and cyan lines trace mapped waterways. The designation covers part of a wider wetland landscape.'],
  ['Why Radar?', 'Radar records scattering through most clouds. Use the divider to see how cloud obscured the optical image of the site.'],
  ['Reading the Radar Landscape', 'Open the labeled building and channel to see the independent map sources. Red shows HH, green shows HV, and blue shows their difference. Similar colors can occur over different landscapes.'],
  ['Watching the Marsh Through Time', 'Step through the archive with the timeline. Playback uses aligned Harmony crops with shared coverage. Repeated observations can reveal patterns worth investigating.'],
  ['Move Between Observations', 'Drag the timeline slider or use the arrow keys to revisit an acquisition. Moisture, roughness, vegetation structure, viewing conditions and processing can all affect radar appearance.'],
  ['Explore Freely', 'Use the slider to choose a date or play a compatible sequence. Use Layers to switch views and show landscape labels. The radar legend explains the colors, and Imagery Details records how the image was made.'],
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
