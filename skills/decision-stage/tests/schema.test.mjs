import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { normalize, render } from '../scripts/render.mjs'
const template = () => JSON.parse(fs.readFileSync(new URL('../template.spec.json', import.meta.url), 'utf8'))
test('explanation follow-up may contain only informational sections', () => {
  const raw = template(); raw.decisions = []
  const spec = normalize(raw)
  const html = render(spec, { transport: 'inline' })
  assert.match(html, /data-section-feedback=/)
  assert.equal(spec.decisions.length, 0)
})
test('large multi-section page remains readable without merging all sections into a truncated line', () => {
  const raw = template()
  raw.sections = Array.from({length: 7}, (_, i) => ({title: `Section ${i}`, blocks: Array.from({length: 12}, (_, j) => ({type:'text', text:`段落 ${i}-${j} ` + '說明'.repeat(60)}))}))
  raw.decisions = []
  const html = render(normalize(raw), {transport:'inline'})
  const lines = html.split('\n')
  assert.ok(lines.filter(line => line.startsWith('<section id="sec-')).length === 7)
  assert.ok(Math.max(...lines.map(line => line.length)) < 2000)
  assert.match(html,/段落 6-11/)
})
test('a stable explicit decision ID is required', () => {
  const spec = template(); delete spec.decisions[0].id
  assert.throws(() => normalize(spec), /id.*required/)
})
test('section badges link correctly and explanation-only sections have no question', () => {
  const spec = normalize(template()); const html = render(spec)
  assert.match(html, /id="sec-2"/)
  assert.match(html, /data-goto-decision="2"/)
  assert.match(html, /sec-read/)
})
