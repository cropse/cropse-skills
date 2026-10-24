// Reply panel. The page template embeds the decisions (#decisions) and the UI strings (#dd-i18n).
(() => {
  const dataEl = document.getElementById('decisions')
  const i18nEl = document.getElementById('dd-i18n')
  if (!dataEl || !i18nEl) return
  const T = JSON.parse(i18nEl.textContent)
  let META = {}
  try { META = JSON.parse((document.getElementById('dd-meta') || { textContent: '{}' }).textContent) } catch (e) { /* defaults */ }
  const TOKEN = META.token || ''
  const INLINE = META.transport === 'inline'
  const list = JSON.parse(dataEl.textContent)
  if (!Array.isArray(list)) return
  const fmt = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => (v && v[k] != null ? v[k] : ''))

  // Not "you decide": the recommended option already means that. This is the user's way out when they do
  // not understand the question; it makes the AI explain more on the page, then ask again.
  const EXPLAIN = { id: 'explain', label: T.explainLabel, description: T.explainDesc }

  // Survive a reload while the user reads.
  const KEY = 'dd:' + location.pathname + ':' + TOKEN + ':' + list.map(d => d.id).join(',')
  let state = {}
  try { state = JSON.parse(sessionStorage.getItem(KEY) || '{}') } catch (e) { state = {} }
  const delivered = INLINE && window.openchamber && window.openchamber.answer
  if (delivered && delivered.token === TOKEN) {
    state = { __general: delivered.general || '', __feedback: {} }
    for (const a of delivered.answers || []) state[a.id] = { choice: a.choice ? a.choice.id : '', note: a.note || '' }
    for (const f of delivered.section_feedback || []) state.__feedback[f.section + ':' + f.kind] = { active: true, note: f.note || '' }
  }
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(state)) } catch (e) { /* storage off */ } }
  const valid = new Map(list.map(d => [d.id, new Set([...d.options.map(o => o.id), EXPLAIN.id])]))
  const slot = id => {
    const s = state[id] || (state[id] = { choice: '', note: '' })
    if (s.choice && !valid.get(id).has(s.choice)) s.choice = ''
    return s
  }
  const answered = d => { const s = slot(d.id); return !!s.choice || s.note.trim().length > 0 }

  const h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag)
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') el.className = v
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v)
      else if (v != null && v !== false) el.setAttribute(k, v === true ? '' : v)
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)))
    return el
  }

  let sent = false
  let conn = INLINE ? 'ok' : location.protocol === 'file:' ? 'file' : 'checking'
  let fails = 0
  let pingTimer = null

  const prog = h('span', { class: 'dd-prog' })
  const connEl = h('div', { class: 'dd-conn', role: 'status' })
  const msg = h('div', { class: 'dd-msg', role: 'status' })
  const copyBtn = h('button', { type: 'button', class: 'dd-copy' }, T.copy)
  const submit = h('button', { type: 'button', class: 'dd-submit' }, T.submit)
  let sending = false
  const general = h('textarea', { rows: '2', placeholder: T.generalHint })
  general.value = state.__general || ''
  general.addEventListener('input', () => { state.__general = general.value; save() })

  const cardEls = {}
  const noteEls = {}
  const cards = list.map((d, i) => {
    const s = slot(d.id)
    const radios = [...d.options, EXPLAIN].map(o => {
      const input = h('input', { type: 'radio', name: 'dd-' + d.id, value: o.id })
      input.checked = s.choice === o.id
      input.addEventListener('change', () => { s.choice = o.id; save(); refresh() })
      return h('label', { class: 'dd-opt' + (o === EXPLAIN ? ' dd-explain' : '') }, input,
        h('span', {}, h('b', {}, o.label), o.recommended ? h('em', { class: 'dd-rec' }, T.recommended) : null,
          o.description ? h('small', {}, o.description) : null))
    })
    const note = h('textarea', { rows: '2', placeholder: T.noteHint })
    note.value = s.note
    note.addEventListener('input', () => { s.note = note.value; save(); refresh() })
    noteEls[d.id] = note
    // Badge = the left-hand section number; several questions on one section become 4a, 4b, ...
    const sibs = list.filter(x => x.section === d.section)
    const badge = String(d.section) + (sibs.length > 1 ? String.fromCharCode(97 + sibs.indexOf(d)) : '')
    const secEl = document.getElementById('sec-' + d.section)
    const about = h('button', { type: 'button', class: 'dd-about', onclick: () => {
      if (!secEl) return
      secEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
      secEl.classList.add('sec-flash'); setTimeout(() => secEl.classList.remove('sec-flash'), 1400)
    } }, fmt(T.aboutSection, { n: d.section }))
    const card = h('section', { class: 'dd-card', 'data-decision': d.id, 'data-section': d.section },
      h('h3', {}, h('span', { class: 'dd-n' }, badge), d.title),
      about,
      h('p', { class: 'dd-q' }, d.question), radios, note)
    cardEls[d.id] = card
    return card
  })

  const feedbackState = state.__feedback || (state.__feedback = {})
  const feedbackCards = []
  for (const section of META.sections || []) {
    const previous = ['explain', 'comment'].map(kind => ({ kind, ...feedbackState[section.section + ':' + kind] })).find(s => s.active)
    const s = feedbackState[section.section] || (feedbackState[section.section] = previous || { active: false, kind: '', note: '' })
    const note = h('textarea', { rows: '2', 'aria-label': T.commentHint })
    note.value = s.note
    const updateHint = () => { note.placeholder = s.kind === 'explain' ? T.explainHint : T.commentHint }
    updateHint()
    note.addEventListener('input', () => { s.note = note.value; save(); refresh() })
    const choices = ['explain', 'comment'].map(kind => {
      const input = h('input', { type: 'radio', name: 'dd-feedback-' + section.section, value: kind })
      input.checked = s.kind === kind
      input.addEventListener('change', () => { s.kind = kind; updateHint(); save(); refresh() })
      return h('label', { class: 'dd-opt' }, input, h('span', {},
        h('b', {}, kind === 'explain' ? T.sectionExplain : T.sectionComment),
        h('small', {}, kind === 'explain' ? T.sectionExplainDesc : T.sectionCommentDesc)))
    })
    const card = h('section', { class: 'dd-card dd-feedback', 'data-feedback-section': section.section },
      h('h3', {}, h('span', { class: 'dd-n' }, section.section), section.title),
      h('p', { class: 'dd-q' }, T.feedbackQuestion), choices, note,
      h('button', { type: 'button', class: 'dd-about', onclick: () => toggle(false) }, T.removeFeedback))
    card.hidden = !s.active
    const buttons = []
    const toggle = active => {
      if (sent) return
      s.active = active; card.hidden = !active
      buttons.forEach(b => b.setAttribute('aria-pressed', String(active)))
      save(); refresh()
      if (active) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
    feedbackCards.push({ section: section.section, title: section.title, s, card, note })
    document.querySelectorAll('[data-section-feedback]').forEach(b => {
      if (Number(b.getAttribute('data-section-feedback')) !== section.section) return
      buttons.push(b); b.setAttribute('aria-pressed', String(s.active))
      b.addEventListener('click', () => toggle(!s.active))
    })
  }
  const activeFeedback = () => feedbackCards.filter(f => f.s.active).map(f => ({ section: f.section, kind: f.s.kind, note: f.s.note.trim() }))
  const invalidFeedback = () => feedbackCards.filter(f => f.s.active && (!f.s.kind || (f.s.kind === 'comment' && !f.s.note.trim())))

  const answersText = () => {
    const lines = ['DECISION_STAGE_ANSWERS (copied from the page, not sent by the server)']
    const ask = []
    for (const d of list) {
      const s = slot(d.id)
      const opt = [...d.options, EXPLAIN].find(o => o.id === s.choice)
      lines.push('', '[' + d.id + '] ' + d.title, opt ? '  choice: ' + opt.label + ' (id=' + opt.id + ')' : '  choice: (none, see note)')
      if (s.note.trim()) lines.push('  note: ' + s.note.trim().replace(/\r?\n/g, '\n        '))
      if (s.choice === EXPLAIN.id) ask.push(d.id)
    }
    for (const f of activeFeedback()) {
      lines.push('', `[section ${f.section}] ${f.kind}: ${f.note}`)
      if (f.kind === 'explain') ask.push('section-' + f.section)
    }
    if (general.value.trim()) lines.push('', 'general_note: ' + general.value.trim())
    lines.push('', 'needs_more_explanation: ' + (ask.length ? ask.join(', ') : '(none)'))
    return lines.join('\n')
  }

  copyBtn.addEventListener('click', async () => {
    const text = answersText()
    try { await navigator.clipboard.writeText(text) }
    catch (e) {
      const ta = h('textarea', { style: 'position:fixed;opacity:0' }); ta.value = text; document.body.append(ta); ta.select()
      let ok = false
      try { ok = document.execCommand('copy') } catch (err) { ok = false }
      ta.remove()
      if (!ok) { copyBtn.textContent = T.copyFailed; return }
    }
    copyBtn.textContent = T.copied
  })

  function refresh() {
    const missing = list.filter(d => !answered(d))
    const explain = list.filter(d => slot(d.id).choice === EXPLAIN.id)
    list.forEach(d => {
      cardEls[d.id].classList.toggle('dd-done', answered(d) && !explain.includes(d))
      cardEls[d.id].classList.toggle('dd-ask', explain.includes(d))
      noteEls[d.id].placeholder = explain.includes(d) ? T.explainHint : T.noteHint
    })
    prog.textContent = fmt(T.decidedOf, { n: list.length - missing.length - explain.length, m: list.length })
      + (explain.length ? fmt(T.explainCount, { k: explain.length }) : '')

    connEl.className = 'dd-conn dd-conn-' + (sent ? 'ok' : conn)
    connEl.textContent = sent ? T.sentMsg : conn === 'ok' ? T.connOk : conn === 'down' ? T.connDown : conn === 'ended' ? T.connEnded : conn === 'file' ? T.connFile : T.connChecking
    copyBtn.hidden = sent || !(conn === 'down' || conn === 'file' || conn === 'ended')
    if (sent) return

    submit.disabled = sending || missing.length > 0 || invalidFeedback().length > 0 || conn !== 'ok'
    msg.textContent = ''
    const issues = [
      ...missing.map(d => ({ card: cardEls[d.id], label: `${d.section} · ${d.title}：${T.decisionRequired}` })),
      ...invalidFeedback().map(f => ({ card: f.card, label: `${f.section} · ${f.title}：${f.s.kind ? T.feedbackNoteRequired : T.feedbackTypeRequired}` })),
    ]
    if (issues.length) {
      msg.append(h('strong', {}, T.completeBeforeSend), h('ul', { class: 'dd-issues' }, issues.map(issue =>
        h('li', {}, h('button', { type: 'button', class: 'dd-link', onclick: () => {
          issue.card.scrollIntoView({ behavior: 'smooth', block: 'center' })
          issue.card.classList.add('dd-flash')
          setTimeout(() => issue.card.classList.remove('dd-flash'), 1400)
        } }, issue.label)))))
    } else if (explain.length) msg.textContent = fmt(T.willExplain, { n: explain.length })
  }

  async function ping() {
    if (sent) return
    try {
      const r = await fetch('/ping', { cache: 'no-store' })
      if (!r.ok) throw new Error('HTTP ' + r.status)
      fails = 0
      // Same port, different round: the server answers, but it is not the server this page was made for.
      const next = TOKEN && (await r.text()).trim() !== TOKEN ? 'ended' : 'ok'
      if (conn !== next) { conn = next; refresh() }
    } catch (e) {
      fails++
      if (fails >= 2 && conn !== 'down') { conn = 'down'; refresh() }
    }
  }

  const panel = h('aside', { id: 'dd-panel', 'aria-label': T.panelTitle },
    h('header', {}, h('b', {}, T.panelTitle), prog),
    connEl,
    h('div', { class: 'dd-body' }, cards, feedbackCards.map(f => f.card)),
    h('footer', {}, general, msg, copyBtn, submit))

  async function send() {
    if (sent || sending || conn !== 'ok' || list.some(d => !answered(d)) || invalidFeedback().length) return
    sending = true
    submit.disabled = true
    msg.textContent = T.sending
    const answers = list.map(d => {
      const s = slot(d.id)
      const opt = [...d.options, EXPLAIN].find(o => o.id === s.choice)
      return { id: d.id, title: d.title, choice: opt ? { id: opt.id, label: opt.label } : null, note: s.note.trim() }
    })
    try {
      const payload = { token: TOKEN, submittedAt: new Date().toISOString(), page: document.title, answers, section_feedback: activeFeedback(), general: general.value.trim() }
      if (INLINE) {
        if (!window.openchamber || typeof window.openchamber.submit !== 'function') throw new Error('OpenChamber submit unavailable')
        await window.openchamber.submit(payload, T.submitSummary)
      } else {
        const r = await fetch('/submit', {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
        })
        if (!r.ok) throw new Error('HTTP ' + r.status)
      }
      sent = true
      clearInterval(pingTimer)
      panel.classList.add('dd-sent')
      panel.querySelectorAll('input,textarea').forEach(el => { el.disabled = true })
      submit.disabled = true
      submit.textContent = T.sent
      msg.textContent = ''
      refresh()
      try { sessionStorage.removeItem(KEY) } catch (e) { /* storage off */ }
    } catch (e) {
      msg.textContent = fmt(T.failed, { e: e.message })
      conn = INLINE ? 'ok' : 'down'
      sending = false
      refresh()
      msg.textContent = fmt(T.failed, { e: e.message })
    }
  }
  submit.addEventListener('click', () => send())

  document.body.append(panel)
  // Left-hand "N questions on the right" tag jumps to the first card for that section.
  document.querySelectorAll('[data-goto-decision]').forEach(a => a.addEventListener('click', ev => {
    ev.preventDefault()
    const card = panel.querySelector('.dd-card[data-section="' + a.getAttribute('data-goto-decision') + '"]')
    if (!card) return
    card.scrollIntoView({ behavior: 'smooth', block: 'center' })
    card.classList.add('dd-flash'); setTimeout(() => card.classList.remove('dd-flash'), 1400)
  }))
  if (delivered && delivered.token === TOKEN) {
    sent = true
    submit.disabled = true
    submit.textContent = T.sent
    panel.classList.add('dd-sent')
    for (const el of [general, ...Object.values(noteEls), ...feedbackCards.map(f => f.note)]) el.disabled = true
    panel.querySelectorAll('input,textarea,button').forEach(el => { el.disabled = true })
  }
  refresh()
  if (conn === 'checking') { ping(); pingTimer = setInterval(ping, 2500) }
})()
