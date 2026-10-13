// Spec (JSON) -> validated, normalized spec -> one self-contained HTML page.
// The AI writes content only. Layout, the reply panel, widgets and every rule live here, so they cannot be forgotten.
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const assetDir = path.join(here, '..', 'assets')
const read = f => fs.readFileSync(path.join(assetDir, f), 'utf8')

export class SpecError extends Error {
  constructor(list) { super(list.join('\n')); this.name = 'SpecError'; this.list = list }
}

const LANGS = ['zh-TW', 'en']
const TONES = ['info', 'ok', 'warn', 'bad', 'neutral']
const BLOCK_TYPES = ['text', 'callout', 'table', 'flow', 'compare', 'slider', 'html']
// "Recommended" already means "you decide". An option saying so only hides the user's real way out: asking for more explanation.
const BANNED_OPTION = /你決定|你看著辦|隨便|you decide|up to you|your call/i
const FORMULA = /^[0-9x+\-*/().\s]+$/
const RESERVED_OPTION_IDS = ['explain']
const ID = /^[A-Za-z0-9_-]+$/

export const STR = {
  'zh-TW': {
    summary: '核心衝突，一句話：', verified: '已查證', unverified: '還沒查證',
    claim: '內容', source: '依據（這次讀過、跑過什麼）', howToVerify: '怎麼驗證', none: '（沒有）',
    simulated: '模擬', pickOne: '選一個看看', result: '結果',
    panelTitle: '你的回覆', decidedOf: '{n} / {m} 已決定', explainCount: '，{k} 題要解釋',
    hist: '先前的決策紀錄', histHint: '腳本自動記錄，不是 AI 寫的。你每次送出就更新；沒答的標「還沒定」。', histQ: '問題', histA: '答案', histOpen: '還沒定',
    session: '來自 Session：', hasQ: '右側有 {n} 題', readOnly: '僅供說明，不用回答', aboutSection: '對應左邊第 {n} 節', recommended: '建議', explainLabel: '需要更多解釋',
    explainDesc: '我看不懂這題在問什麼。AI 會在左邊補上更清楚的說明，再問你一次。',
    noteHint: '備註，或不在選項裡的答案（也可以只寫這個）', explainHint: '哪個部分看不懂？（選填）', generalHint: '其他想補充的（選填）',
    submit: '送出回覆', sending: '送出中…', sent: '已送出', sentMsg: '已送出。回到 OpenCode，AI 會收到你的回覆。',
    missing: '還有 {n} 題沒回答，點此跳到第一題', willExplain: '送出後 AI 會補充左邊的說明，再把 {n} 題問你一次。',
    failed: '送出失敗：{e}', connChecking: '連線中…', connOk: '已連線。按「送出回覆」後，AI 會在 OpenCode 收到答案。',
    connDown: '這一頁已結束（已送出、逾時，或被新的一頁取代），無法再送出。請回 OpenCode 告訴 AI 重新開啟。你的選擇還在，也可以先按「複製答案」貼給 AI。',
    connEnded: '這一頁已被同一個 Session 的新一輪取代，無法再送出。請改用最新那一頁，或重新整理本頁。',
    connFile: '這是直接開啟的檔案，沒有連到伺服器，無法送出。請回 OpenCode 告訴 AI 重新開啟，或先按「複製答案」貼給 AI。',
    copy: '複製答案', copied: '已複製，貼到 OpenCode 即可。', copyFailed: '複製失敗，請手動選取文字。',
  },
  en: {
    summary: 'The core conflict, in one sentence: ', verified: 'Verified', unverified: 'Not verified yet',
    claim: 'Claim', source: 'Basis (what was read or run this session)', howToVerify: 'How to verify', none: '(none)',
    simulated: 'simulated', pickOne: 'Pick one to see it', result: 'Result',
    panelTitle: 'Your reply', decidedOf: '{n} / {m} decided', explainCount: ', {k} need explaining',
    hist: 'Earlier decisions', histHint: 'Recorded by the script, not written by the AI. Updated every time you submit; unanswered ones say "not decided".', histQ: 'Question', histA: 'Answer', histOpen: 'not decided',
    session: 'From session: ', hasQ: '{n} question(s) on the right', readOnly: 'For reading only, no answer needed', aboutSection: 'About section {n} on the left', recommended: 'recommended', explainLabel: 'Explain this more',
    explainDesc: "I don't understand what this is asking. The AI will add a clearer explanation on the left and ask again.",
    noteHint: 'A note, or your own answer if none of the options fit (you may write only this)', explainHint: 'Which part is unclear? (optional)', generalHint: 'Anything else (optional)',
    submit: 'Send replies', sending: 'Sending…', sent: 'Sent', sentMsg: 'Sent. Go back to OpenCode; the AI has your replies.',
    missing: '{n} not answered yet. Click to jump to the first one', willExplain: 'After you send, the AI will expand the explanation and ask {n} again.',
    failed: 'Send failed: {e}', connChecking: 'Connecting…', connOk: 'Connected. After you press "Send replies" the AI receives them in OpenCode.',
    connDown: 'This page has ended (answered, timed out, or replaced), so nothing can be sent. Tell the AI in OpenCode to reopen it. Your choices are kept; you can also press "Copy answers" and paste them to the AI.',
    connEnded: 'This page was replaced by a newer round of the same session, so nothing can be sent. Use the newest page, or reload this one.',
    connFile: 'This file was opened directly and is not connected to the server, so nothing can be sent. Tell the AI in OpenCode to reopen it, or press "Copy answers" and paste them to the AI.',
    copy: 'Copy answers', copied: 'Copied. Paste it into OpenCode.', copyFailed: 'Copy failed. Select the text manually.',
  },
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const inline = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
const paras = s => String(s).split(/\n{2,}/).map(p => `<p>${inline(p.trim()).replace(/\n/g, '<br>')}</p>`).join('')
const jsonForScript = v => JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
const isStr = v => typeof v === 'string' && v.trim().length > 0
const isNum = v => typeof v === 'number' && Number.isFinite(v)

/** Validate and fill defaults. Throws SpecError listing EVERY problem at once so one fix pass is enough. */
export function normalize(raw) {
  const errors = []
  const e = (where, msg) => errors.push(`${where}: ${msg}`)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new SpecError(['spec must be a JSON object'])

  const lang = raw.lang === undefined ? 'zh-TW' : raw.lang
  if (!LANGS.includes(lang)) e('lang', `must be one of ${LANGS.join(', ')}`)
  if (!isStr(raw.title)) e('title', 'required, a short page title')
  if (!isStr(raw.summary)) e('summary', 'required, the core conflict in one sentence')
  if (raw.subtitle !== undefined && typeof raw.subtitle !== 'string') e('subtitle', 'must be a string')

  const sections = []
  if (!Array.isArray(raw.sections) || raw.sections.length === 0) e('sections', 'required, at least one section')
  else raw.sections.forEach((s, i) => {
    const w = `sections[${i}]`
    if (!s || typeof s !== 'object') return e(w, 'must be an object')
    if (!isStr(s.title)) e(`${w}.title`, 'required')
    if (!Array.isArray(s.blocks) || s.blocks.length === 0) return e(`${w}.blocks`, 'required, at least one block')
    const blocks = s.blocks.map((b, j) => normalizeBlock(b, `${w}.blocks[${j}]`, e))
    sections.push({ title: s.title, blocks })
  })

  const listOf = (key, fields) => {
    const v = raw[key]
    if (!Array.isArray(v)) { e(key, 'required array (use [] only if there is truly nothing; the page still states that)'); return [] }
    return v.map((item, i) => {
      const w = `${key}[${i}]`
      if (!item || typeof item !== 'object') { e(w, 'must be an object'); return {} }
      fields.forEach(f => { if (!isStr(item[f])) e(`${w}.${f}`, 'required') })
      return item
    })
  }
  const verified = listOf('verified', ['claim', 'source'])
  const unverified = listOf('unverified', ['claim', 'howToVerify'])
  if (Array.isArray(raw.verified) && Array.isArray(raw.unverified) && !raw.verified.length && !raw.unverified.length) {
    e('verified/unverified', 'both empty. List what you checked and what you only inferred; this table is required on every page')
  }

  const decisions = []
  if (!Array.isArray(raw.decisions) || raw.decisions.length === 0) e('decisions', 'required, at least one decision for the user')
  else {
    const seen = new Set()
    raw.decisions.forEach((d, i) => {
      const w = `decisions[${i}]`
      if (!d || typeof d !== 'object') return e(w, 'must be an object')
      const id = d.id
      if (!isStr(id)) e(`${w}.id`, 'required: a stable ID, kept when rewording this question')
      if (!ID.test(String(id))) e(`${w}.id`, 'letters, digits, - and _ only')
      if (seen.has(id)) e(`${w}.id`, `duplicate id "${id}"`)
      seen.add(id)
      // Every question points at the left-hand section it is about, so the numbers on both sides match.
      if (!Number.isInteger(d.section) || d.section < 1 || d.section > sections.length) e(`${w}.section`, `required: the number (1 to ${sections.length}) of the left-hand section this question is about`)
      if (!isStr(d.title)) e(`${w}.title`, 'required, short')
      if (isStr(d.title) && [...d.title].length > 30) e(`${w}.title`, 'keep it to 30 characters or fewer')
      if (!isStr(d.question)) e(`${w}.question`, 'required, a full sentence that makes sense without the page')
      if (!Array.isArray(d.options) || d.options.length < 2 || d.options.length > 5) { e(`${w}.options`, 'needs 2 to 5 options'); return }
      const optIds = new Set()
      let recommended = 0
      const options = d.options.map((o, j) => {
        const ow = `${w}.options[${j}]`
        if (!o || typeof o !== 'object') { e(ow, 'must be an object'); return {} }
        const oid = o.id === undefined ? 'o' + (j + 1) : o.id
        if (!ID.test(String(oid))) e(`${ow}.id`, 'letters, digits, - and _ only')
        if (RESERVED_OPTION_IDS.includes(oid)) e(`${ow}.id`, `"${oid}" is reserved; the panel adds the explain option itself`)
        if (optIds.has(oid)) e(`${ow}.id`, `duplicate id "${oid}"`)
        optIds.add(oid)
        if (!isStr(o.label)) e(`${ow}.label`, 'required')
        else if (BANNED_OPTION.test(o.label)) e(`${ow}.label`, 'do not offer a "you decide" option. The recommended option already means that; the panel adds an "explain this more" option for a user who is lost')
        if (!isStr(o.description)) e(`${ow}.description`, 'required: say what this option costs, not only what it is')
        if (o.recommended === true) recommended++
        return { id: oid, label: o.label, description: o.description, recommended: o.recommended === true }
      })
      if (recommended > 1) e(`${w}.options`, 'at most one option may be recommended')
      decisions.push({ id, section: d.section, title: d.title, question: d.question, options })
    })
  }

  if (errors.length) throw new SpecError(errors)
  decisions.sort((a, b) => a.section - b.section) // stable: the panel reads in the same order as the page
  // Not an error, but the user's stated priority: a diagram or something to touch beats more text.
  const VISUAL = ['flow', 'compare', 'slider', 'html']
  const warnings = []
  // Something the user can click or drag, with no question attached, reads as "answer me" but nothing asks. Tell the author.
  const asked = new Set(decisions.map(d => d.section))
  sections.forEach((s, i) => {
    if (!asked.has(i + 1) && s.blocks.some(b => ['compare', 'slider', 'html'].includes(b.type))) {
      warnings.push(`section ${i + 1} ("${s.title}") has something to click or drag but no question points at it. Either add a decision with "section": ${i + 1}, or make it a plain flow/table; the page marks it "for reading only".`)
    }
  })
  if (!sections.some(s => s.blocks.some(b => VISUAL.includes(b.type)))) {
    warnings.push('the page has no visual block (flow, compare, slider or html). The user prefers a diagram or something to click or drag over more text; add at least one that shows the difference between the options.')
  }
  return { lang, title: raw.title, subtitle: raw.subtitle, summary: raw.summary, sections, verified, unverified, decisions, warnings }
}

function normalizeBlock(b, w, e) {
  if (!b || typeof b !== 'object') { e(w, 'must be an object'); return { type: 'text', text: '' } }
  if (!BLOCK_TYPES.includes(b.type)) { e(`${w}.type`, `must be one of ${BLOCK_TYPES.join(', ')} (got ${JSON.stringify(b.type)})`); return b }
  const need = f => { if (!isStr(b[f])) e(`${w}.${f}`, 'required') }
  const tone = (v, where) => { if (v !== undefined && !TONES.includes(v)) e(where, `must be one of ${TONES.join(', ')}`) }
  switch (b.type) {
    case 'text': need('text'); break
    case 'callout': need('text'); tone(b.tone, `${w}.tone`); break
    case 'html':
      need('html')
      if (b.script !== undefined) {
        if (typeof b.script !== 'string') e(`${w}.script`, 'must be a string')
        else { try { new vm.Script(b.script) } catch (err) { e(`${w}.script`, 'does not parse: ' + err.message) } }
      }
      break
    case 'table': {
      if (!Array.isArray(b.head) || !b.head.length || !b.head.every(isStr)) { e(`${w}.head`, 'required, an array of column titles'); break }
      if (!Array.isArray(b.rows) || !b.rows.length) { e(`${w}.rows`, 'required, an array of rows'); break }
      b.rows.forEach((r, i) => {
        if (!Array.isArray(r) || r.length !== b.head.length) e(`${w}.rows[${i}]`, `needs exactly ${b.head.length} cells`)
        else if (!r.every(c => typeof c === 'string')) e(`${w}.rows[${i}]`, 'cells must be strings')
      })
      if (b.highlightRow !== undefined && !(Number.isInteger(b.highlightRow) && b.highlightRow >= 0 && b.highlightRow < b.rows.length)) e(`${w}.highlightRow`, 'must be a row index')
      break
    }
    case 'flow': {
      if (!Array.isArray(b.rows) || !b.rows.length) { e(`${w}.rows`, 'required, an array of rows'); break }
      b.rows.forEach((r, i) => {
        const rw = `${w}.rows[${i}]`
        if (!r || !Array.isArray(r.nodes) || !r.nodes.length) return e(`${rw}.nodes`, 'required, at least one node')
        r.nodes.forEach((n, j) => {
          if (!n || !isStr(n.text)) e(`${rw}.nodes[${j}].text`, 'required')
          else tone(n.tone, `${rw}.nodes[${j}].tone`)
        })
      })
      break
    }
    case 'compare': {
      if (!Array.isArray(b.modes) || b.modes.length < 2) { e(`${w}.modes`, 'needs at least 2 modes'); break }
      const ids = new Set()
      b.modes.forEach((m, i) => {
        const mw = `${w}.modes[${i}]`
        if (!m || typeof m !== 'object') return e(mw, 'must be an object')
        const id = m.id === undefined ? 'm' + (i + 1) : m.id
        if (!ID.test(String(id)) || ids.has(id)) e(`${mw}.id`, 'letters, digits, - and _, unique')
        ids.add(id)
        if (!isStr(m.label)) e(`${mw}.label`, 'required')
        if (!isStr(m.result)) e(`${mw}.result`, 'required: what the user sees or hears in this mode')
        tone(m.tone, `${mw}.tone`)
      })
      break
    }
    case 'slider': {
      if (!isStr(b.label)) e(`${w}.label`, 'required')
      if (![b.min, b.max, b.step, b.value].every(isNum)) { e(`${w}`, 'min, max, step and value must all be numbers'); break }
      if (!(b.min < b.max) || !(b.step > 0) || b.value < b.min || b.value > b.max) e(`${w}`, 'need min < max, step > 0 and min <= value <= max')
      if (!Array.isArray(b.outputs) || !b.outputs.length) { e(`${w}.outputs`, 'required, at least one {label, formula}'); break }
      b.outputs.forEach((o, i) => {
        const ow = `${w}.outputs[${i}]`
        if (!o || !isStr(o.label)) e(`${ow}.label`, 'required')
        if (!o || !isStr(o.formula) || !FORMULA.test(o.formula)) e(`${ow}.formula`, 'required, only digits, x, + - * / ( ) and spaces')
        else { try { const v = new Function('x', 'return (' + o.formula + ')')(b.value); if (!Number.isFinite(v)) e(`${ow}.formula`, 'does not give a finite number') } catch (err) { e(`${ow}.formula`, 'does not parse: ' + err.message) } }
      })
      if (b.limit !== undefined) {
        const l = b.limit
        if (!l || !isNum(l.value) || !Number.isInteger(l.output) || l.output < 0 || l.output >= b.outputs.length) e(`${w}.limit`, 'needs a numeric value and an output index')
      }
      break
    }
  }
  return b
}

const blockHtml = (b, t, n) => {
  switch (b.type) {
    case 'text': return `<div class="txt">${paras(b.text)}</div>`
    case 'callout': return `<div class="call tone-${b.tone || 'info'}">${paras(b.text)}</div>`
    case 'html': return `<div class="raw">${b.html}</div>${b.script ? `<script>${b.script.replace(/<\/script/gi, '<\\/script')}</script>` : ''}`
    case 'table': {
      const head = b.head.map(h => `<th>${inline(h)}</th>`).join('')
      const rows = b.rows.map((r, i) => `<tr${b.highlightRow === i ? ' class="hl"' : ''}>${r.map(c => `<td>${inline(c).replace(/\n/g, '<br>')}</td>`).join('')}</tr>`).join('')
      return `<div class="tbl"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`
    }
    case 'flow': return '<div class="flow">' + b.rows.map(r => {
      const nodes = r.nodes.map((nd, i) => `${i ? '<span class="arr" aria-hidden="true">→</span>' : ''}<div class="node tone-${nd.tone || 'neutral'}"><b>${inline(nd.text)}</b>${nd.sub ? `<small>${inline(nd.sub)}</small>` : ''}</div>`).join('')
      return `<div class="frow">${r.label ? `<div class="flabel">${inline(r.label)}</div>` : ''}<div class="fnodes">${nodes}</div>${r.note ? `<div class="fnote">${inline(r.note)}</div>` : ''}</div>`
    }).join('') + '</div>'
    case 'compare': {
      const name = 'cmp' + n
      const modes = b.modes.map((m, i) => ({ ...m, id: m.id === undefined ? 'm' + (i + 1) : m.id }))
      return `<div class="cmp" data-compare>${b.title ? `<div class="cmp-t">${inline(b.title)} <em>${esc(t.simulated)}</em></div>` : ''}`
        + `<div class="modes">${modes.map((m, i) => `<label${i === 0 ? ' class="on"' : ''}><input type="radio" name="${name}" value="${esc(m.id)}"${i === 0 ? ' checked' : ''}><b>${inline(m.label)}</b>${m.description ? `<small>${inline(m.description)}</small>` : ''}</label>`).join('')}</div>`
        + `<div class="cmp-r tone-${modes[0].tone || 'neutral'}" data-result>${paras(modes[0].result)}</div>`
        + modes.map(m => `<template data-mode="${esc(m.id)}" data-tone="${m.tone || 'neutral'}">${paras(m.result)}</template>`).join('') + '</div>'
    }
    case 'slider': {
      const cfg = { outputs: b.outputs.map(o => ({ formula: o.formula, decimals: Number.isInteger(o.decimals) ? o.decimals : 1 })), limit: b.limit ? { value: b.limit.value, output: b.limit.output } : null }
      const outs = b.outputs.map((o, i) => `<div class="sout" data-out="${i}"><span>${inline(o.label)}</span><b data-num></b>${o.unit ? `<i>${esc(o.unit)}</i>` : ''}</div>`).join('')
      const lim = b.limit ? `<div class="sbar"><i data-bar></i><u data-line></u></div><p class="slim" data-limmsg data-over="${esc(b.limit.over || '')}" data-under="${esc(b.limit.under || '')}"></p>` : ''
      return `<div class="sld" data-slider data-cfg='${esc(JSON.stringify(cfg)).replace(/'/g, '&#39;')}'><label>${inline(b.label)}：<b data-val></b>${b.unit ? ` ${esc(b.unit)}` : ''} <em>${esc(t.simulated)}</em></label>`
        + `<input type="range" min="${b.min}" max="${b.max}" step="${b.step}" value="${b.value}">${outs}${lim}</div>`
    }
  }
  return ''
}

const fmtN = (s, n) => s.replace('{n}', n)

export function render(spec, opts = {}) {
  const t = STR[spec.lang]
  const sessionTitle = typeof opts.sessionTitle === 'string' ? opts.sessionTitle.trim() : ''
  // Decisions from earlier rounds of this session, kept by the script so nothing depends on the AI's memory.
  const hist = Array.isArray(opts.history) ? opts.history : []
  const histHtml = hist.length
    ? `<section class="hist"><h2><i>☰</i>${esc(t.hist)}</h2><p class="sub">${esc(t.histHint)}</p><table><thead><tr><th>${esc(t.histQ)}</th><th>${esc(t.histA)}</th></tr></thead><tbody>${hist.map(x => `<tr><td>${esc(x.title)}</td><td>${x.status === 'decided'
      ? `<b>${esc(x.choice || '')}</b>`
      : `<span class="hist-open">${esc(t.histOpen)}</span>${x.choice ? ' ' + esc(x.choice) : ''}`}${x.note ? ` <small>${esc(x.note)}</small>` : ''}</td></tr>`).join('')}</tbody></table></section>`
    : ''
  let n = 0
  const sections = spec.sections.map((s, i) => {
    const k = spec.decisions.filter(d => d.section === i + 1).length
    const tag = k
      ? `<a class="sec-tag sec-ask" href="#" data-goto-decision="${i + 1}">${esc(fmtN(t.hasQ, k))}</a>`
      : `<span class="sec-tag sec-read">${esc(t.readOnly)}</span>`
    return `<section id="sec-${i + 1}"><h2><i>${i + 1}</i>${inline(s.title)}${tag}</h2>${s.blocks.map(b => blockHtml(b, t, ++n)).join('')}</section>`
  }).join('')
  const vv = (items, cols) => items.length
    ? `<table><thead><tr>${cols.map(c => `<th>${esc(t[c])}</th>`).join('')}</tr></thead><tbody>${items.map(it => `<tr>${cols.map(c => `<td>${inline(it[c === 'claim' ? 'claim' : c === 'source' ? 'source' : 'howToVerify'])}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    : `<p class="none">${esc(t.none)}</p>`
  const dict = { ...t }
  return `<!doctype html>
<html lang="${spec.lang === 'en' ? 'en' : 'zh-Hant'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${sessionTitle ? esc(sessionTitle) + ' · ' : ''}${esc(spec.title)}</title>
<style>${read('page.css')}</style>
</head>
<body>
<main>
${sessionTitle ? `<div class="sess"><span>${esc(t.session)}</span>${esc(sessionTitle)}</div>` : ''}
<h1>${inline(spec.title)}</h1>
${spec.subtitle ? `<p class="sub">${inline(spec.subtitle)}</p>` : ''}
<div class="call tone-info"><b>${esc(t.summary)}</b>${inline(spec.summary)}</div>
${sections}
<section class="vv"><h2><i>✓</i>${esc(t.verified)} / ${esc(t.unverified)}</h2>
<div class="vvgrid"><div><h3 class="ok">${esc(t.verified)}</h3>${vv(spec.verified, ['claim', 'source'])}</div>
<div><h3 class="warn">${esc(t.unverified)}</h3>${vv(spec.unverified, ['claim', 'howToVerify'])}</div></div></section>
${histHtml}
</main>
<script type="application/json" id="decisions">${jsonForScript(spec.decisions)}</script>
<script type="application/json" id="dd-meta">${jsonForScript({ token: typeof opts.token === 'string' ? opts.token : '' })}</script>
<script type="application/json" id="dd-i18n">${jsonForScript(dict)}</script>
<script>${read('widgets.js')}</script>
<style id="dd-style">${read('panel.css')}</style>
<script id="dd-script">${read('panel.js')}</script>
</body>
</html>
`
}
