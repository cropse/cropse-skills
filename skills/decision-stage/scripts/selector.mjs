// Advisory process identity only, never authentication or proof of render capability.
// OpenChamber: installed agent-tool/runtime.js createChildEnv().
// Claude: https://code.claude.com/docs/en/env-vars (CLAUDECODE / CLAUDE_CODE_CHILD_SESSION).
// Codex: https://github.com/openai/codex/blob/main/codex-rs/core/src/exec_env.rs
const present = value => typeof value === 'string' && value.trim().length > 0

export function selectHost(env = process.env, { browser = false, expose = false } = {}) {
  const matches = []
  if (['OPENCHAMBER_AGENT_TOOL_URL', 'OPENCHAMBER_AGENT_TOOL_TOKEN', 'OPENCODE_SESSION_ID'].every(k => present(env[k]))) matches.push('openchamber')
  if (env.CLAUDECODE === '1' || env.CLAUDE_CODE_CHILD_SESSION === '1') matches.push('claude')
  if (present(env.CODEX_THREAD_ID)) matches.push('codex')
  const host = matches.length > 1 ? 'ambiguous' : matches[0] || 'unknown'
  return { host, transport: host === 'openchamber' && !browser && !expose ? 'inline' : 'browser' }
}
