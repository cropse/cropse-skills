import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const script = fileURLToPath(new URL('../scripts/decision-stage.mjs', import.meta.url))
const keys = ['OPENCHAMBER_AGENT_TOOL_URL','OPENCHAMBER_AGENT_TOOL_TOKEN','OPENCODE_SESSION_ID','CLAUDECODE','CLAUDE_CODE_CHILD_SESSION','CODEX_THREAD_ID']
function select(extra = {}, args = []) {
  const env = { ...process.env }; for (const k of keys) delete env[k]
  const r = spawnSync(process.execPath, [script, '--select', ...args], { env: { ...env, ...extra }, encoding:'utf8', timeout:5000 })
  assert.equal(r.status,0,r.stderr)
  return { value:JSON.parse(r.stdout), text:r.stdout }
}
const oc = {OPENCHAMBER_AGENT_TOOL_URL:'http://127.0.0.1:1234/api/openchamber/agent-tool',OPENCHAMBER_AGENT_TOOL_TOKEN:'secret-token',OPENCODE_SESSION_ID:'session-secret'}
test('selector identifies hosts using fixed process markers',()=>{
  for (const [env,host,transport] of [[{},'unknown','browser'],[oc,'openchamber','inline'],[{CLAUDECODE:'1'},'claude','browser'],[{CLAUDE_CODE_CHILD_SESSION:'1'},'claude','browser'],[{CODEX_THREAD_ID:'thread'},'codex','browser']]) {
    assert.deepEqual(select(env).value,{host,transport})
  }
})
test('missing blank and false markers do not imply a host',()=>{
  for(const env of [{OPENCHAMBER_AGENT_TOOL_URL:oc.OPENCHAMBER_AGENT_TOOL_URL},{OPENCHAMBER_AGENT_TOOL_TOKEN:'secret'},{...oc,OPENCODE_SESSION_ID:' '},{CLAUDECODE:'0'},{CLAUDECODE:'false'},{CODEX_THREAD_ID:' '}]) assert.equal(select(env).value.host,'unknown')
})
test('conflicting markers fall back without guessed priority',()=>{
  for(const env of [{...oc,CLAUDECODE:'1'},{...oc,CODEX_THREAD_ID:'thread'},{CLAUDECODE:'1',CODEX_THREAD_ID:'thread'}]) assert.deepEqual(select(env).value,{host:'ambiguous',transport:'browser'})
  assert.equal(select({CLAUDECODE:'1',CLAUDE_CODE_CHILD_SESSION:'1'}).value.host,'claude')
})
test('selector never prints credentials and explicit browser or expose overrides inline',()=>{
  const result=select(oc);assert.doesNotMatch(result.text,/secret|1234|session-/)
  assert.deepEqual(select(oc,['--browser']).value,{host:'openchamber',transport:'browser'})
  assert.equal(select(oc,['--expose']).value.transport,'browser')
})
