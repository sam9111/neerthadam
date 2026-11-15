import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { buildArchive, compatibleSequence, parseCatalog } from '../src/archive.ts'

const read = name => JSON.parse(readFileSync(new URL(`../public/data/${name}.json`, import.meta.url)))
const catalog = parseCatalog(read('catalog'))
const composites = read('composites')
const samples = read('samples')

test('July observations retain separate frequency identities and archived measurements', () => {
  const [a, b] = buildArchive(catalog, composites, samples)
  assert.notEqual(a.observations[0].acquisitionId, b.observations[0].acquisitionId)
  assert.ok(a.observations.every(item => item.capabilities.renderable && item.capabilities.inspectable))
  assert.equal(a.comparisons[0].fixedFootprint.HH.median.toFixed(3), '0.701')
  assert.equal(a.comparisons[0].fixedFootprint.HV.median.toFixed(3), '0.236')
  assert.deepEqual(composites.ranges, { red: [-22, 5], green: [-29, -3], blue: [0, 20] })
})

test('a growing archive keeps real dates ordered and does not grant implicit compatibility', () => {
  const fixture = structuredClone(catalog)
  const group = fixture.groups[0]
  const [source] = group.observations
  for (let i = 1; i <= 28; i++) {
    group.observations.unshift({ ...source, id: `fixture-${i}`, date: `2026-08-${String(i).padStart(2, '0')}` })
  }
  group.comparisons.push({ ...group.comparisons[0], laterId: 'absent' })
  const [series] = buildArchive(parseCatalog(fixture), composites, samples)
  assert.equal(series.observations.length, 30)
  assert.equal(series.observations.at(-1).id, 'fixture-28')
  assert.equal(series.comparisons.length, 1)
  assert.equal(compatibleSequence(series, source.id).length, 2)
  assert.deepEqual(series.observations.at(-1).capabilities, {
    discovered: true, renderable: false, inspectable: false, comparable: false, visualComparable: false, quantitativelyComparable: false, timeSeries: false,
  })
  assert.throws(() => parseCatalog({ schemaVersion: 99 }))
})

test('all 11 additional Harmony dates are browsable in both frequencies without verified comparisons', () => {
  const groups = buildArchive(catalog, composites, samples).filter(group => group.qualityScreen === 'harmony')
  assert.equal(groups.length, 4)
  assert.equal(new Set(groups.flatMap(group => group.observations.map(item => item.timestamp))).size, 11)
  for (const group of groups) {
    assert.equal(group.observations.length, group.track === 156 ? 9 : 2)
    assert.equal(group.comparisons.length, 0)
    for (const item of group.observations) {
      assert.equal(item.qualityMask, 'available Harmony masks')
      assert.equal(item.capabilities.renderable, true)
      assert.equal(item.capabilities.inspectable, true)
      assert.equal(item.capabilities.comparable, false)
      assert.equal(item.coveragePct, 100)
      const path = (asset) => new URL(`../public/${asset}`, import.meta.url)
      assert.ok(readFileSync(path(item.imagery.url)).length > 0)
      assert.equal(readFileSync(path(item.numeric.url)).length, item.numeric.width * item.numeric.height * 8)
      assert.ok(JSON.parse(readFileSync(path(item.coverageUrl))).features.length > 0)
    }
  }
  const fixture = structuredClone(catalog)
  const group = fixture.groups.find(item => item.qualityScreen === 'harmony')
  group.comparisons = [{...catalog.groups[0].comparisons[0],
    earlierId: group.observations[0].id, laterId: group.observations[1].id}]
  assert.equal(buildArchive(fixture).find(item => item.id === group.id).comparisons.length, 0)
})

test('default playback and visual comparison use only published compatible imagery', async () => {
  const { defaultSeries, playbackSequence, visualPairs } = await import('../src/archive.ts')
  const archive = buildArchive(catalog, composites, samples)
  const allDates = new Set(archive.flatMap(series => series.observations.map(item => item.timestamp.slice(0, 10))))
  assert.equal(allDates.size, 15)
  const detailed = defaultSeries(archive, 'A')
  assert.deepEqual(detailed.sequence.map(item => item.timestamp.slice(0, 10)), ['2026-07-06', '2026-07-18'])
  assert.equal(detailed.group.coveragePct, 100)
  const browseOnly = archive.find(series => series.qualityScreen === 'harmony')
  assert.equal(playbackSequence(browseOnly, browseOnly.observations[0].id).length, 1)
  assert.deepEqual(archive.flatMap(visualPairs).map(pair => pair.coveragePct), [100, 100, 39.12464])
  const incomplete = buildArchive(catalog, { ...composites, groups: {} }, samples)
  assert.equal(incomplete.flatMap(visualPairs).length, 0)
})

test('all four descending Harmony dates share one exploratory series per frequency', async () => {
  const { applyHarmonySeries, defaultSeries, visualPairs } = await import('../src/archive.ts')
  const archive = applyHarmonySeries(buildArchive(catalog, composites, samples), read('track149-harmony'))
  for (const frequency of ['A', 'B']) {
    const { group, sequence } = defaultSeries(archive, frequency)
    assert.equal(group.track, 149)
    assert.deepEqual(sequence.map(item => item.timestamp.slice(0, 10)),
      ['2026-07-06', '2026-07-18', '2026-08-11', '2026-10-10'])
    const pairs = visualPairs(group)
    assert.equal(pairs.length, 6)
    assert.ok(pairs.every(pair => pair.exploratory && pair.coveragePct === 100))
    assert.ok(sequence.every(item => item.capabilities.visualComparable && !item.capabilities.quantitativelyComparable))
  }
})
