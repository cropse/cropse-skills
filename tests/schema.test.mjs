import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { normalize, render } from '../scripts/render.mjs'
const template = () => JSON.parse(fs.readFileSync(new URL('../template.spec.json', import.meta.url), 'utf8'))
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
