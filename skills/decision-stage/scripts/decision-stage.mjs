#!/usr/bin/env node
// The single entry point. One call does everything, so nothing depends on the AI remembering a step:
//   validate spec -> render page -> start server -> open the browser -> wait for ONE submit -> print answers -> exit.
// usage:
//   node decision-stage.mjs --new <name>            create a work dir in the OS temp folder with a copy of the template; prints the spec path
//   node decision-stage.mjs <spec.json> --check     validate only (no files written, no server)
//   node decision-stage.mjs <spec.json> [--minutes 60] [--no-open] [--replace] [--expose]
// --expose: also reachable from other devices on the LAN (default: this machine only). Use it only when the user asks.
// One session may have ONE live page. A second start is refused (exit 5, DECISION_STAGE_BUSY) and prints the live URL;
// --replace stops the session's old page first (use it only to deliberately supersede an unanswered page).
// Every generated file (page, answers) lives under <tmp>/decision-stage/, never in the user's repo. Dirs older than 7 days are deleted on start.
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { normalize, render, SpecError } from './render.mjs'

const argv = process.argv.slice(2)
const has = n => argv.includes(n)
const flag = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d }
const out = s => process.stdout.write(Buffer.from(s + '\n', 'utf8')) // raw UTF-8: console.log turns CJK into "?" on IBM437 consoles
const err = s => process.stderr.write(Buffer.from(s + '\n', 'utf8'))
const fail = (code, msg) => { err(msg); process.exit(code) }

const ROOT = path.join(os.tmpdir(), 'decision-stage')
const MAX_AGE_MS = 7 * 24 * 3600 * 1000
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-')

function sweep() {
  try {
    for (const d of fs.readdirSync(ROOT, { withFileTypes: true })) {
      if (!d.isDirectory() || d.name === 'locks' || d.name === 'memory') continue
      const p = path.join(ROOT, d.name)
      if (Date.now() - fs.statSync(p).mtimeMs > MAX_AGE_MS) fs.rmSync(p, { recursive: true, force: true })
    }
    // memory files are rewritten on every use, so their own mtime says whether the session is still alive
    const memDir = path.join(ROOT, 'memory')
    for (const f of fs.existsSync(memDir) ? fs.readdirSync(memDir) : []) {
      const p = path.join(memDir, f)
      if (Date.now() - fs.statSync(p).mtimeMs > MAX_AGE_MS) fs.rmSync(p, { force: true })
    }
  } catch (e) { /* nothing to sweep */ }
}

if (has('--new')) {
  const name = (flag('--new', '') || '').replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 40)
  if (!name) fail(2, 'DECISION_STAGE_ERROR usage: node decision-stage.mjs --new <name>')
  sweep()
  const dir = path.join(ROOT, `${stamp()}-${name}`)
  fs.mkdirSync(dir, { recursive: true })
  const spec = path.join(dir, 'spec.json')
  fs.copyFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'template.spec.json'), spec)
  out(`DECISION_STAGE_SPEC=${spec}`)
  out('Edit that file (content only), then run it with --check, then without --check. The page and answers go to a runs/ folder in the OS temp directory, never into the repo.')
  process.exit(0)
}

const specArg = argv.find((a, i) => !a.startsWith('--') && !['--minutes', '--new'].includes(argv[i - 1]))
// (--replace is a bare flag, so it never swallows the spec path)
if (!specArg) fail(2, 'DECISION_STAGE_ERROR usage: node decision-stage.mjs --new <name>  |  node decision-stage.mjs <spec.json> [--check] [--minutes N] [--no-open]')
const specPath = path.resolve(specArg)
if (!fs.existsSync(specPath) || !fs.statSync(specPath).isFile()) fail(2, 'DECISION_STAGE_ERROR spec file not found: ' + specPath)

// ---- per-session decision log (written by this script, never by the AI) -----------------------------------------
// One short entry per question title: decided (with the answer) or open. Lives 7 days, one file per session.
// It exists so that after many rounds, or after the AI's context is compressed, the conclusions are still on disk.
const SESSION_KEY = (process.env.OPENCODE_SESSION_ID || 'cwd-' + crypto.createHash('sha1').update(process.cwd()).digest('hex').slice(0, 10)).replace(/[^A-Za-z0-9_-]/g, '-')
const memPath = path.join(ROOT, 'memory', SESSION_KEY + '.json')
const readMem = () => { try { const m = JSON.parse(fs.readFileSync(memPath, 'utf8')); return Array.isArray(m.entries) ? m.entries : [] } catch (e) { return [] } }
const writeMem = entries => { fs.mkdirSync(path.dirname(memPath), { recursive: true }); fs.writeFileSync(memPath, JSON.stringify({ entries }, null, 2), 'utf8') }
const upsert = (entries, rec) => { const i = entries.findIndex(x => x.id === rec.id); if (i >= 0) entries[i] = rec; else entries.push(rec) }
const entryText = x => x.status === 'decided' ? `${x.choice || '(own answer)'}${x.note ? ' (note: ' + x.note.replace(/\s+/g, ' ') + ')' : ''}` : `NOT DECIDED${x.choice ? ' ' + x.choice : ''}${x.note ? ' (note: ' + x.note.replace(/\s+/g, ' ') + ')' : ''}`
let earlier = [] // entries from before this page, shown at the bottom of it

// The title of the OpenChamber session that started this page, shown at the top so several open tabs can be told apart.
// Best effort: no env / no answer within 3 s -> no banner. --session-title "..." overrides. Never blocks the page.
async function lookupSessionTitle() {
  const manual = flag('--session-title', '')
  if (manual) return manual
  const url = process.env.OPENCHAMBER_AGENT_TOOL_URL, token = process.env.OPENCHAMBER_AGENT_TOOL_TOKEN, sid = process.env.OPENCODE_SESSION_ID
  if (!url || !token || !sid) return ''
  try {
    const r = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ input: { action: 'session.list', all: true, limit: 200 } }), signal: AbortSignal.timeout(3000) })
    const j = await r.json()
    const s = j.ok && (j.data.sessions || []).find(x => x.id === sid)
    return s && typeof s.title === 'string' ? s.title.trim() : ''
  } catch (e) { return '' }
}

// Random per run. The page carries it, /ping reports it and /submit requires it, so a tab left over from an earlier
// round (same session, same fixed port) can neither submit into this round nor look alive: it shows "ended".
const TOKEN = crypto.randomBytes(12).toString('hex')

let spec, html, sessionTitle = ''
try {
  const text = fs.readFileSync(specPath, 'utf8').replace(/^\uFEFF/, '')
  let raw
  try { raw = JSON.parse(text) } catch (e) { throw new SpecError(['spec is not valid JSON: ' + e.message]) }
  spec = normalize(raw)
  if (!has('--check')) sessionTitle = await lookupSessionTitle()
  const here = new Set(spec.decisions.map(d => d.id))
  earlier = readMem().filter(x => !here.has(x.id))
  html = render(spec, { sessionTitle, history: earlier, token: TOKEN })
} catch (e) {
  if (e instanceof SpecError) fail(2, 'DECISION_STAGE_ERROR the spec has ' + e.list.length + ' problem(s). Fix all of them and run again:\n' + e.list.map(x => '  - ' + x).join('\n'))
  fail(2, 'DECISION_STAGE_ERROR ' + (e && e.stack || e))
}
for (const w of spec.warnings || []) out('DECISION_STAGE_WARNING ' + w)
if (has('--check')) { out(`DECISION_STAGE_OK ${spec.decisions.length} decisions, ${spec.sections.length} sections. Nothing was written.`); process.exit(0) }

// ---- one live page per session ------------------------------------------------------------------------------
// The lock is a file named after the session id, created atomically ("wx"), so two commands started in the same turn
// cannot both win. A lock is stale when its process is gone or its port no longer answers /ping (pid reuse, killed
// process); stale locks are removed silently. Without a session id (plain shell) the working directory is the key.
const LOCK_DIR = path.join(ROOT, 'locks')
const lockPath = path.join(LOCK_DIR, SESSION_KEY + '.json')
const alive = pid => { try { process.kill(pid, 0); return true } catch (e) { return e.code === 'EPERM' } }
async function identityMatches(lock) {
  if (!lock.token || lock.session !== SESSION_KEY) return false
  try {
    const r = await fetch(`http://127.0.0.1:${lock.port}/identity`, { signal: AbortSignal.timeout(1500) })
    const identity = await r.json()
    return r.ok && identity.session === SESSION_KEY && identity.pid === lock.pid && identity.token === lock.token
  } catch { return false }
}
const readLock = () => { try { return JSON.parse(fs.readFileSync(lockPath, 'utf8')) } catch (e) { return null } }
const writeLock = extra => fs.writeFileSync(lockPath, JSON.stringify({ session: SESSION_KEY, token: TOKEN, pid: process.pid, spec: specPath, startedAt: Date.now(), ...extra }))

async function acquireLock() {
  fs.mkdirSync(LOCK_DIR, { recursive: true })
  for (let attempt = 0; attempt < 3; attempt++) {
    try { fs.writeFileSync(lockPath, JSON.stringify({ session: SESSION_KEY, token: TOKEN, pid: process.pid, spec: specPath, startedAt: Date.now() }), { flag: 'wx' }); return } catch (e) { if (e.code !== 'EEXIST') throw e }
    const old = readLock()
    const live = old && old.pid !== process.pid && alive(old.pid)
    if (live) {
      const verified = old.port && await identityMatches(old)
      if (!verified) fail(5, 'DECISION_STAGE_BUSY lock identity is not verified; leave the process and lock untouched. It may be starting or belong to another process.')
      if (!has('--replace')) {
        fail(5, `DECISION_STAGE_BUSY this session already has a page waiting for the user: ${old.url || '(starting up)'}\n`
          + `  spec: ${old.spec}\n  started: ${new Date(old.startedAt).toISOString()}\n`
          + 'Do not start another one. Wait for the user to press Submit (this command\'s output arrives by itself).\n'
          + 'Only if you deliberately want to throw the unanswered page away, run the same command again with --replace, and tell the user the old page is dead.')
      }
      try {
        const r = await fetch(`http://127.0.0.1:${old.port}/replace`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token: old.token }), signal: AbortSignal.timeout(1500),
        })
        if (!r.ok) throw new Error('replacement refused')
        for (let n = 0; n < 40 && alive(old.pid); n++) await new Promise(r => setTimeout(r, 50))
        if (alive(old.pid)) throw new Error('old server has not exited')
      } catch (e) { fail(5, 'DECISION_STAGE_BUSY safe replacement failed: ' + e.message) }
    }
    // Do not unlink a lock another contender installed while this request was awaiting a response.
    const current = readLock()
    if (JSON.stringify(current) === JSON.stringify(old)) fs.rmSync(lockPath, { force: true })
  }
  fail(5, 'DECISION_STAGE_ERROR could not take the session lock: ' + lockPath)
}
await acquireLock()
process.on('exit', () => { const l = readLock(); if (l && l.pid === process.pid) fs.rmSync(lockPath, { force: true }) })

// Outputs go to the temp folder, one dir per run, even if the spec itself lives somewhere else.
sweep()
const runDir = path.join(ROOT, 'runs', `${stamp()}-${path.basename(path.dirname(specPath)).slice(0, 40).replace(/[^A-Za-z0-9_-]/g, '-')}`)
fs.mkdirSync(runDir, { recursive: true })
const pagePath = path.join(runDir, 'page.html')
const outPath = path.join(runDir, 'answers.json')
fs.writeFileSync(pagePath, html, 'utf8') // a copy to look at; the server serves from memory

const minutes = Number(flag('--minutes', '60'))
let port = 0
let done = false

function answersBlock(body) {
  const lines = ['DECISION_STAGE_ANSWERS_BEGIN', `round_id: ${TOKEN}`, `page: ${spec.title}`, `answers_file: ${outPath} (temporary; record the decisions in the project's own log, not here)`]
  for (const a of body.answers) {
    lines.push('', `[${a.id}] ${a.title}`)
    lines.push(a.choice ? `  choice: ${a.choice.label} (id=${a.choice.id})` : '  choice: (none, see note)')
    if (a.note) lines.push(`  note: ${a.note.replace(/\r?\n/g, '\n        ')}`)
  }
  if (body.general) lines.push('', `general_note: ${body.general}`)
  const ask = body.answers.filter(a => a.choice && a.choice.id === 'explain').map(a => a.id)
  // An "explain" choice is not an answer. Spell it out so it cannot be mistaken for a decision.
  lines.push('', ask.length ? `needs_more_explanation: ${ask.join(', ')}` : 'needs_more_explanation: (none)')
  if (!ask.length) {
    lines.push('', 'CONSOLIDATION_HINT: If the discussion is settled and you have no further questions, read the decision_log and reflect the agreed conclusions in the current plan or spec; if neither exists, briefly summarize the outcome. Otherwise continue clarifying. Answers and notes are not blanket approval or authorization to implement.', `decision_log: ${memPath}`)
  }
  lines.push('DECISION_STAGE_ANSWERS_END')
  return lines.join('\n')
}

// The finished command's output reaches the session only as a system block, so the user never sees their own
// reply in the chat. When OpenChamber's agent tool is reachable, also post it as a real user message.
// Uses the env the shell already has; with no env (plain OpenCode) it does nothing and the output path still works.
async function sendToSession(text) {
  const url = process.env.OPENCHAMBER_AGENT_TOOL_URL, token = process.env.OPENCHAMBER_AGENT_TOOL_TOKEN, sid = process.env.OPENCODE_SESSION_ID
  if (has('--no-send')) return 'skipped (--no-send)'
  if (!url || !token || !sid) return 'skipped (not running inside OpenChamber: missing env)'
  const call = async input => {
    const r = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ input }), signal: AbortSignal.timeout(8000) })
    const j = await r.json()
    if (!j.ok) throw new Error(j.error && j.error.message || 'not ok')
    return j
  }
  try {
    // The send needs the session's own directory, which can differ from this shell's cwd.
    let directory = process.cwd()
    try {
      const listed = await call({ action: 'session.list', all: true, limit: 200 })
      const s = (listed.data.sessions || []).find(x => x.id === sid)
      if (s && s.location && s.location.directory) directory = s.location.directory
    } catch (e) { /* fall back to cwd */ }
    await call({ action: 'session.send', sessionId: sid, directory, prompt: text })
    return 'sent'
  } catch (e) { return 'failed: ' + e.message }
}

function recordOpen() { // this page's questions are "open" until the user answers them
  try {
    const e = readMem()
    // A question that was already decided keeps its answer until the user actually replies again.
    for (const d of spec.decisions) if (!e.some(x => x.id === d.id && x.status === 'decided')) upsert(e, { id: d.id, title: d.title, status: 'open', choice: '', note: '', at: new Date().toISOString() })
    writeMem(e)
  } catch (err) { /* the log is a convenience; never block the page */ }
}
function recordAnswers(body) {
  try {
    const e = readMem()
    for (const a of body.answers) {
      const explain = a.choice && a.choice.id === 'explain'
      const decided = !explain && (a.choice || a.note)
      upsert(e, { id: a.id, title: a.title, status: decided ? 'decided' : 'open', choice: explain ? '(asked for more explanation)' : a.choice ? a.choice.label : '', note: a.note || '', at: new Date().toISOString() })
    }
    writeMem(e)
  } catch (err) { /* see above */ }
}

async function report(body) {
  recordAnswers(body)
  const block = answersBlock(body)
  const prompt = 'The user pressed Submit on the decision-stage reply panel. Handle this round once, identified by round_id. Briefly restate each answer, then respond to their notes and any clarification requests. Avoid extra test reports or device questions.\n\n' + block
  const delivery = await sendToSession(prompt)
  if (delivery === 'sent') {
    out(`DECISION_STAGE_DELIVERED round_id: ${TOKEN}. Answers were sent to the session. This is a receipt only: do not reply or process this round again.`)
  } else {
    out(block) // Fallback: the command completion is the sole full-answer notification.
  }
  out('DECISION_STAGE_SESSION_SEND ' + delivery)
}

function canonicalBody(b) {
  if (!b || !Array.isArray(b.answers) || b.answers.length !== spec.decisions.length
    || (b.general !== undefined && typeof b.general !== 'string')) throw new Error('answers do not match this page')
  const answers = spec.decisions.map((d, i) => {
    const a = b.answers[i]
    if (!a || a.id !== d.id || typeof a.note !== 'string') throw new Error('answers do not match this page')
    const note = a.note.trim()
    let choice = null
    if (a.choice !== null) {
      const option = a.choice && (a.choice.id === 'explain'
        ? { id: 'explain', label: spec.lang === 'en' ? 'Explain this more' : '需要更多解釋' }
        : d.options.find(o => o.id === a.choice.id))
      if (!option) throw new Error('unknown choice')
      choice = { id: option.id, label: option.label }
    }
    if (!choice && !note) throw new Error('answer or note required')
    return { id: d.id, title: d.title, choice, note }
  })
  return { roundId: TOKEN, submittedAt: new Date().toISOString(), page: spec.title, answers, general: (b.general || '').trim() }
}

// LAN exposure is OFF by default: the page listens on 127.0.0.1 only. --expose (only when the user asks for it) makes it
// reachable from other devices on the same network at http://<this machine's IP>:<port>/. Anyone who can reach the port
// can then read the page and answer it, so this is for a trusted home/office network only.
const LOCAL_ONLY = !has('--expose')
const lanAddrs = () => {
  const list = []
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) for (const a of addrs || []) {
    if (a.family !== 'IPv4' || a.internal) continue
    if (a.address.startsWith('169.254.')) continue // link-local: not routable, usually a VPN adapter without a real address
    list.push({ name, address: a.address, virtual: /vethernet|wsl|docker|virtual|vmware|vbox|hyper-v|loopback|tailscale/i.test(name) })
  }
  return list
}
const lan = LOCAL_ONLY ? [] : lanAddrs()
const primaryLan = (lan.find(x => !x.virtual) || lan[0] || {}).address || ''
const ownHosts = new Set(['127.0.0.1', 'localhost', ...lan.map(x => x.address)])
const hostAllowed = h => { // "host:port" with a host that is one of this machine's own addresses and OUR port
  const m = /^(.+):(\d+)$/.exec(h || '')
  return !!m && Number(m[2]) === port && ownHosts.has(m[1].toLowerCase())
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  // DNS-rebinding guard: only answer to this machine's own addresses (a rebound attacker name is not one of them).
  if (req.headers.host && !hostAllowed(req.headers.host)) { res.writeHead(403); res.end('forbidden host'); return }
  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
    res.end(html); return
  }
  if (req.method === 'GET' && url.pathname === '/ping') { res.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store' }); res.end(TOKEN); return }
  if (req.method === 'GET' && url.pathname === '/identity') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    res.end(JSON.stringify({ session: SESSION_KEY, pid: process.pid, token: TOKEN })); return
  }
  if (req.method === 'POST' && url.pathname === '/replace') {
    // Internal replacement command is loopback-only, authenticated to this exact round, and never kills a PID.
    if (req.socket.remoteAddress !== '127.0.0.1' || req.headers.origin || done) { res.writeHead(403); res.end(); return }
    let data = ''
    req.on('data', chunk => { data += chunk; if (data.length > 1024) req.destroy() })
    req.on('end', () => {
      try {
        if (JSON.parse(data).token !== TOKEN) { res.writeHead(403); res.end(); return }
        done = true
        res.writeHead(200); res.end('replaced')
        out('DECISION_STAGE_REPLACED this page was deliberately superseded')
        setTimeout(() => process.exit(0), 100)
      } catch { res.writeHead(400); res.end() }
    })
    return
  }
  if (req.method === 'GET' && url.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return }
  if (req.method === 'POST' && url.pathname === '/submit') {
    const origin = req.headers.origin // any web page can POST to localhost; accept only our own origin
    if (origin && !hostAllowed(origin.replace(/^https?:\/\//i, ''))) { res.writeHead(403); res.end('forbidden origin'); return }
    const chunks = []
    let size = 0
    req.on('data', c => { size += c.length; if (size > 1_000_000) req.destroy(); else chunks.push(c) })
    req.on('end', () => {
      try {
        if (done) { res.writeHead(409, { 'content-type': 'application/json' }); res.end('{"ok":false,"error":"already submitted"}'); return }
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        if (!body || body.token !== TOKEN) { res.writeHead(409, { 'content-type': 'application/json' }); res.end('{"ok":false,"error":"this page is from an earlier round and has ended"}'); return }
        const canonical = canonicalBody(body)
        fs.writeFileSync(outPath, JSON.stringify(canonical, null, 2), 'utf8')
        done = true
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end('{"ok":true}')
        report(canonical).finally(() => setTimeout(() => process.exit(0), 400))
      } catch (e) {
        res.writeHead(400, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: String(e.message) }))
      }
    })
    return
  }
  res.writeHead(404); res.end()
})

function openBrowser(url) {
  try {
    const [cmd, args] = process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
      : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]]
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true })
    child.on('error', () => out('DECISION_STAGE_WARNING could not open a browser automatically. Tell the user to open the URL above.'))
    child.unref()
    return true
  } catch (e) { return false }
}

// A session gets the same port every round (hash of its key) so its link stays stable. Taken or refused (in use,
// Windows reserved range) -> try the next few, then let the OS pick. "Fixed" is best effort, never a guarantee.
const PORT_BASE = 41000, PORT_SPAN = 1000, PORT_TRIES = 25
const startPort = crypto.createHash('sha1').update(SESSION_KEY).digest().readUInt32BE(0) % PORT_SPAN
const candidates = Array.from({ length: PORT_TRIES }, (_, i) => PORT_BASE + (startPort + i) % PORT_SPAN).concat(0)
function listen(i) {
  const onError = e => {
    if (i + 1 < candidates.length && ['EADDRINUSE', 'EACCES', 'EADDRNOTAVAIL'].includes(e.code)) listen(i + 1)
    else fail(4, 'DECISION_STAGE_ERROR server failed: ' + e.message)
  }
  server.once('error', onError)
  server.listen(candidates[i], LOCAL_ONLY ? '127.0.0.1' : '0.0.0.0', () => { server.off('error', onError); onListening() })
}
function onListening() {
  port = server.address().port
  const localUrl = `http://127.0.0.1:${port}/`
  // The link handed to the user is the LAN one when there is one, so it also works from a phone or another computer.
  const url = primaryLan ? `http://${primaryLan}:${port}/` : localUrl
  writeLock({ port, url })
  recordOpen()
  out(`DECISION_STAGE_URL=${url}`)
  if (primaryLan) {
    out(`DECISION_STAGE_LOCAL_URL=${localUrl}`)
    const others = lan.filter(x => x.address !== primaryLan).map(x => `http://${x.address}:${port}/ (${x.name})`)
    if (others.length) out('DECISION_STAGE_OTHER_URLS ' + others.join('  '))
    out('DECISION_STAGE_LAN this page is reachable by other devices on the same network. Windows Firewall may still block them; that is not checked.')
  }
  if (earlier.length) out(`DECISION_STAGE_LOG ${memPath}\n` + earlier.map(x => `  - ${x.title}: ${entryText(x)}`).join('\n'))
  const opened = has('--no-open') ? false : openBrowser(localUrl)
  out(opened
    ? `DECISION_STAGE_OPENED the page is open in the default browser. Waiting for the user to press Submit (up to ${minutes} minutes). Do not poll; this command exits when the answers arrive. Reply to the user with the URL only: no summary of the page, no list of questions, no recommendations.`
    : `DECISION_STAGE_WAITING the page is served at ${url}. Waiting for the user to press Submit (up to ${minutes} minutes).`)
}
listen(0)
setTimeout(() => { out('DECISION_STAGE_TIMEOUT no submit within ' + minutes + ' minutes'); process.exit(3) }, minutes * 60_000)
