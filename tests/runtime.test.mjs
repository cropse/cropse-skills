import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('../scripts/decision-stage.mjs', import.meta.url))
const root = path.join(os.tmpdir(), 'decision-stage')
const fixture = (id = 'decision-a', title = 'Question') => ({
  lang: 'en', title: 'Test page', summary: 'Test only',
  sections: [{ title: 'Example', blocks: [{ type: 'flow', rows: [{ nodes: [{ text: 'A' }, { text: 'B' }] }] }] }],
  verified: [{ claim: 'fixture', source: 'test' }], unverified: [],
  decisions: [{ id, section: 1, title, question: 'Choose?', options: [{ id: 'yes', label: 'Canonical Yes', description: 'Cost A' }, { id: 'no', label: 'Canonical No', description: 'Cost B' }] }],
})
async function setup(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'decision-stage-test-'))
  const sid = 'ses_test_' + crypto.randomBytes(10).toString('hex')
  const children = []
  t.after(async () => {
    for (const c of children) if (c.exitCode === null && c.signalCode === null) { const end = once(c, 'exit'); c.kill(); await end }
    // Only exact, uniquely-owned test paths. Never glob session files or list/kill processes.
    for (const p of [path.join(root, 'locks', sid + '.json'), path.join(root, 'memory', sid + '.json')]) await fs.rm(p, { force: true })
    await fs.rm(dir, { recursive: true, force: true })
  })
  async function start(spec = fixture(), args = []) {
    const input = path.join(dir, crypto.randomUUID() + '.json')
    await fs.writeFile(input, JSON.stringify(spec))
    const env = { ...process.env, OPENCODE_SESSION_ID: sid }
    delete env.OPENCHAMBER_AGENT_TOOL_URL
    delete env.OPENCHAMBER_AGENT_TOOL_TOKEN
    const c = spawn(process.execPath, [script, input, '--no-open', '--no-send', ...args], { env })
    children.push(c)
    c.output = ''
    c.stdout.on('data', d => { c.output += d }); c.stderr.on('data', d => { c.output += d })
    c.ended = once(c, 'exit')
    await new Promise((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error('startup timed out: ' + c.output)), 10000)
      const done = () => { clearTimeout(deadline); resolve() }
      c.stdout.on('data', () => { if (/DECISION_STAGE_URL=/.test(c.output)) done() })
      c.on('exit', done)
    })
    c.url = c.output.match(/DECISION_STAGE_URL=(\S+)/)?.[1]
    if (c.url) c.token = await (await fetch(c.url + 'ping')).text()
    return c
  }
  const memory = async () => JSON.parse(await fs.readFile(path.join(root, 'memory', sid + '.json'), 'utf8')).entries
  return { sid, start, memory }
}
const answer = (c, id = 'decision-a', choice = 'yes', extra = {}) => ({ token: c.token, answers: [{ id, title: 'FORGED TITLE', choice: { id: choice, label: 'FORGED LABEL' }, note: 'my note' }], general: '', ...extra })
const post = (c, body, endpoint = 'submit') => fetch(c.url + endpoint, { method: 'POST', headers: { 'content-type': 'application/json', origin: c.url.slice(0, -1) }, body: JSON.stringify(body) })
async function submit(c, body = answer(c)) { assert.equal((await post(c, body)).status, 200); await c.ended; assert.equal(c.exitCode, 0) }

test('unknown choices and unanswered entries are rejected without ending the page', async t => {
  const { start } = await setup(t); const c = await start()
  assert.equal((await post(c, answer(c, 'decision-a', 'made-up'))).status, 400)
  assert.equal((await post(c, { token: c.token, answers: [{ id: 'decision-a', choice: null, note: '   ' }] })).status, 400)
  assert.equal(c.exitCode, null)
  await submit(c)
})

test('stored answers and output use canonical titles and labels, with a round ID', async t => {
  const { start, memory } = await setup(t); const c = await start(); await submit(c)
  const entries = await memory()
  assert.equal(entries[0].title, 'Question'); assert.equal(entries[0].choice, 'Canonical Yes')
  assert.equal(entries[0].id, 'decision-a')
  assert.doesNotMatch(c.output, /FORGED/)
  assert.match(c.output, /round_id: [a-f0-9]{24}/)
})

test('same ID survives renaming; different IDs with the same title stay separate', async t => {
  const { start, memory } = await setup(t)
  const a = await start(); await submit(a)
  const b = await start(fixture('decision-a', 'Renamed')); await submit(b)
  assert.equal((await memory()).length, 1)
  assert.equal((await memory())[0].title, 'Renamed')
  const c = await start(fixture('decision-b', 'Renamed')); await submit(c, answer(c, 'decision-b'))
  assert.equal((await memory()).length, 2)
})

test('same-session duplicate is busy; verified replace changes token, keeps port, rejects stale submit', async t => {
  const { start, sid } = await setup(t); const a = await start()
  const lock = JSON.parse(await fs.readFile(path.join(root, 'locks', sid + '.json'), 'utf8'))
  assert.equal(lock.token, a.token); assert.equal(lock.session, sid)
  const identity = await (await fetch(a.url + 'identity')).json()
  assert.deepEqual(identity, { session: sid, pid: a.pid, token: a.token })
  const duplicate = await start(); await duplicate.ended
  assert.equal(duplicate.exitCode, 5)
  const b = await start(fixture(), ['--replace']); await a.ended
  assert.equal(b.url, a.url); assert.notEqual(b.token, a.token)
  assert.equal((await post(b, answer(a))).status, 409)
  await submit(b)
  await assert.rejects(fs.access(path.join(root, 'locks', sid + '.json')))
})

test('replace cannot stop a process when lock identity does not match', async t => {
  const { start, sid } = await setup(t)
  const foreign = http.createServer((req, res) => {
    if (req.url === '/ping') res.end('foreign-token')
    else { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ session: 'another-session', pid: process.pid, token: 'foreign-token' })) }
  })
  await new Promise(r => foreign.listen(0, '127.0.0.1', r)); t.after(() => foreign.close())
  const port = foreign.address().port
  const lock = { pid: process.pid, port, session: sid, token: 'expected-token', startedAt: Date.now() }
  await fs.mkdir(path.join(root, 'locks'), { recursive: true })
  await fs.writeFile(path.join(root, 'locks', sid + '.json'), JSON.stringify(lock))
  const c = await start(fixture(), ['--replace']); await c.ended
  assert.equal(c.exitCode, 5)
  assert.match(c.output, /identity/i)
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(root, 'locks', sid + '.json'), 'utf8')), lock)
  assert.equal((await fetch(`http://127.0.0.1:${port}/ping`)).status, 200)
})

test('resolved replies include a conditional consolidation reminder and memory path', async t => {
  const { start } = await setup(t); const c = await start(); await submit(c)
  assert.match(c.output, /decision_log: .*\.json/)
  assert.match(c.output, /CONSOLIDATION_HINT: If/)
  assert.match(c.output, /plan.*spec/)
})

test('explanation requests omit both memory path and consolidation reminder', async t => {
  const { start } = await setup(t); const c = await start(); await submit(c, answer(c, 'decision-a', 'explain'))
  assert.doesNotMatch(c.output, /decision_log:|CONSOLIDATION_HINT|DOCUMENT_UPDATE_REQUEST/)
})

test('successful session delivery does not echo the full answers into shell output', async t => {
  const source = await fs.readFile(script, 'utf8')
  const report = source.slice(source.indexOf('async function report(body)'), source.indexOf('function canonicalBody'))
  const { default: vm } = await import('node:vm')
  for (const delivery of ['sent', 'failed: unavailable', 'skipped (--no-send)']) {
    const output = [], dispatched = []
    const context = { recordAnswers() {}, answersBlock: () => 'FULL_ANSWERS round_id: round-test', out: s => output.push(s),
      TOKEN: 'round-test', sendToSession: async prompt => { dispatched.push(prompt); return delivery } }
    await vm.runInNewContext(report + '\nreport({})', context)
    assert.equal(dispatched.length, 1)
    assert.match(dispatched[0], /FULL_ANSWERS/)
    assert.equal(output.some(s => s.includes('FULL_ANSWERS')), delivery !== 'sent')
    assert.ok(output.some(s => s.includes('round-test')))
  }
})

test('normal submit remains a discussion response', async t => {
  const { start } = await setup(t); const c = await start(); await submit(c)
  assert.doesNotMatch(c.output, /action:|ACCUMULATED_DECISIONS_BEGIN|DOCUMENT_UPDATE_REQUEST/)
})

test('different sessions stay independent; default is loopback, expose is opt-in', async t => {
  const one = await setup(t), two = await setup(t)
  const a = await one.start(), b = await two.start(fixture(), ['--expose'])
  assert.notEqual(a.url, b.url)
  assert.equal(new URL(a.url).hostname, '127.0.0.1')
  const lan = Object.values(os.networkInterfaces()).flat().find(x => x.family === 'IPv4' && !x.internal && !x.address.startsWith('169.254.'))
  if (lan) {
    await assert.rejects(fetch(`http://${lan.address}:${new URL(a.url).port}/ping`, { signal: AbortSignal.timeout(2000) }))
    assert.equal((await fetch(`http://${lan.address}:${new URL(b.url).port}/ping`)).status, 200)
  }
  await submit(a)
  assert.equal((await fetch(b.url + 'ping')).status, 200)
  await submit(b)
})
