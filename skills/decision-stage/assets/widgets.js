// Behavior for the template's "compare" and "slider" blocks. Pure DOM, no dependencies.
(() => {
  document.addEventListener('change', e => {
    const box = e.target.closest && e.target.closest('[data-compare]')
    if (!box || e.target.type !== 'radio') return
    box.querySelectorAll('.modes label').forEach(l => l.classList.toggle('on', l.querySelector('input').checked))
    const tpl = [...box.querySelectorAll('template')].find(t => t.dataset.mode === e.target.value)
    const out = box.querySelector('[data-result]')
    if (!tpl || !out) return
    out.innerHTML = tpl.innerHTML
    out.className = 'cmp-r tone-' + (tpl.dataset.tone || 'neutral')
  })

  const fmt = (v, d) => v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })
  const update = box => {
    const cfg = JSON.parse(box.dataset.cfg)
    const input = box.querySelector('input[type=range]')
    const x = Number(input.value)
    box.querySelector('[data-val]').textContent = fmt(x, 0)
    const values = cfg.outputs.map((o, i) => {
      let v = NaN
      try { v = new Function('x', 'return (' + o.formula + ')')(x) } catch (err) { /* validated at render */ }
      const el = box.querySelector('[data-out="' + i + '"] [data-num]')
      if (el) el.textContent = Number.isFinite(v) ? fmt(v, o.decimals) : '?'
      return v
    })
    if (!cfg.limit) return
    const v = values[cfg.limit.output], lim = cfg.limit.value
    const scale = Math.max(lim * 4, Number.isFinite(v) ? v * 1.05 : 0, 1)
    const bar = box.querySelector('[data-bar]'), line = box.querySelector('[data-line]'), msg = box.querySelector('[data-limmsg]')
    const over = Number.isFinite(v) && v > lim
    bar.style.width = Math.min(100, (Number.isFinite(v) ? v : 0) / scale * 100) + '%'
    bar.style.background = over ? '#ef6a6a' : '#4cc38a'
    line.style.left = (lim / scale * 100) + '%'
    msg.className = 'slim ' + (over ? 'bad' : 'ok')
    msg.textContent = (over ? msg.dataset.over : msg.dataset.under) || ''
  }
  document.querySelectorAll('[data-slider]').forEach(box => {
    box.querySelector('input[type=range]').addEventListener('input', () => update(box))
    update(box)
  })
})()
