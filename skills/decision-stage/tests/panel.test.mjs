import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { STR } from '../scripts/render.mjs'

// Small DOM fixture executes the actual panel script without an external browser dependency.
class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.listeners = {}; this.attrs = {}; this.nodeType = 1; this.disabled = false; this.value = ''; this.classList = { add() {}, toggle() {}, remove() {} } }
  setAttribute(k,v) { this.attrs[k] = v }
  addEventListener(k,v) { this.listeners[k] = v }
  append(...kids) { this.children.push(...kids) }
  querySelectorAll() { return [] }
  focus() {}
  remove() { this.removed = true }
  scrollIntoView() {}
}
const walk = e => [e, ...(e.children || []).flatMap(walk)]
test('panel has only one submit button and allows note-only replies', async () => {
  const body = new Element('body'), requests = []
  const ids = {
    decisions: { textContent: JSON.stringify([{ id: 'a', section: 1, title: 'Q', question: 'Q?', options: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }] }]) },
    'dd-i18n': { textContent: JSON.stringify(STR.en) },
    'dd-meta': { textContent: JSON.stringify({ token: 'round' }) },
  }
  const context = { document: { getElementById: id => ids[id], createElement: tag => new Element(tag), createTextNode: text => ({ nodeType: 3, text }), body, querySelectorAll: () => [] },
    location: { protocol: 'http:', pathname: '/' }, sessionStorage: { getItem: () => '{}', setItem() {}, removeItem() {} },
    setInterval: () => 1, clearInterval() {}, setTimeout, navigator: {},
    fetch: async (url, options) => { if (url === '/submit') requests.push(JSON.parse(options.body)); return { ok: true, text: async () => 'round' } },
  }
  vm.runInNewContext(fs.readFileSync(new URL('../assets/panel.js', import.meta.url), 'utf8'), context)
  await new Promise(r => setImmediate(r))
  const nodes = walk(body), send = nodes.find(e => e.className === 'dd-submit'), update = nodes.find(e => e.className === 'dd-submit dd-update')
  assert.ok(send); assert.equal(update, undefined)
  assert.equal(send.disabled, true)
  const note = nodes.find(e => e.tag === 'textarea' && e.attrs.rows === '2' && e !== nodes.find(n => n.tag === 'footer')?.children[0])
  note.value = 'The question is wrong'; note.listeners.input()
  assert.equal(send.disabled, false)
  send.listeners.click(); send.listeners.click()
  await new Promise(r => setImmediate(r))
  assert.equal(requests.length, 1); assert.equal(requests[0].answers[0].choice, null)
  assert.equal(requests[0].action, undefined)
  assert.equal(send.disabled, true)
})
