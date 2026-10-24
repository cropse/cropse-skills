import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { STR } from '../scripts/render.mjs'
class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.listeners = {}; this.attrs = {}; this.nodeType = 1; this.value = ''; this.hidden = false; this.disabled = false; this.classList = { add() {}, toggle() {}, remove() {} } }
  setAttribute(k,v) { this.attrs[k] = v }
  getAttribute(k) { return this.attrs[k] }
  addEventListener(k,v) { this.listeners[k] = v }
  append(...kids) { this.children.push(...kids) }
  querySelectorAll() { return [] }
  scrollIntoView() {}
  focus() {}
  set textContent(value) { this._textContent = value; this.children = [] }
  get textContent() { return this._textContent || '' }
}
const walk = e => [e, ...(e.children || []).flatMap(walk)]
async function fixture(transport = 'browser', bridge = async () => {}, noDecisions = false, answerDecision = true) {
  const body = new Element('body'), requests = [], actions = [new Element('button')]; actions[0].attrs['data-section-feedback'] = '2'
  const ids = { decisions: { textContent: JSON.stringify([{ id:'a',section:1,title:'Q',question:'Q?',options:[{id:'yes',label:'Yes'}] }]) }, 'dd-i18n': {textContent:JSON.stringify(STR.en)}, 'dd-meta': {textContent:JSON.stringify({token:'round',transport,sections:[{section:2,title:'Context'}]})} }
  const context = { document: {getElementById:id=>ids[id],createElement:t=>new Element(t),createTextNode:text=>({nodeType:3,text}),body,querySelectorAll:s=>s==='[data-section-feedback]'?actions:[]}, location:{protocol:'https:',pathname:'/'},sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},setInterval:()=>1,clearInterval(){},setTimeout,navigator:{},window:{openchamber:{submit:bridge}},fetch:async(url,opts)=>{requests.push({url,body:opts?.body?JSON.parse(opts.body):null});return{ok:true,text:async()=> 'round'}} }
  if (noDecisions) ids.decisions.textContent = '[]'
  vm.runInNewContext(fs.readFileSync(new URL('../assets/panel.js',import.meta.url),'utf8'),context)
  await new Promise(r=>setImmediate(r))
  const nodes=()=>walk(body), send=()=>nodes().find(e=>e.className==='dd-submit')
  if (!noDecisions && answerDecision) { const note=nodes().find(e=>e.tag==='textarea'&&e.attrs.placeholder===STR.en.noteHint);note.value='own answer';note.listeners.input() }
  return {body,actions,requests,nodes,send,context}
}
test('one feedback card requires a single type and retains text when switching or reopening',async()=>{
  const f=await fixture()
  f.actions[0].listeners.click()
  const cards=f.nodes().filter(e=>e.className==='dd-card dd-feedback')
  assert.equal(cards.length,1)
  assert.equal(f.send().disabled,true)
  const card=cards[0], note=walk(card).find(e=>e.tag==='textarea')
  const radios=walk(card).filter(e=>e.tag==='input')
  assert.equal(radios.length,2)
  assert.equal(radios[0].attrs.name,radios[1].attrs.name)
  radios[0].listeners.change();assert.equal(f.send().disabled,false)
  radios[1].listeners.change();assert.equal(f.send().disabled,true)
  note.value='Correction';note.listeners.input()
  radios[0].listeners.change();radios[1].listeners.change();assert.equal(note.value,'Correction')
  f.actions[0].listeners.click();assert.equal(card.hidden,true)
  f.actions[0].listeners.click();assert.equal(note.value,'Correction')
  f.send().listeners.click();await new Promise(r=>setImmediate(r))
  const payload=f.requests.find(r=>r.url==='/submit').body
  assert.deepEqual(JSON.parse(JSON.stringify(payload.section_feedback)),[{section:2,kind:'comment',note:'Correction'}])
})
test('section-only follow-up can submit another explanation request',async()=>{
  const replies=[];const f=await fixture('inline',async data=>replies.push(data),true)
  f.actions[0].listeners.click()
  const card=f.nodes().find(e=>e.className==='dd-card dd-feedback')
  walk(card).find(e=>e.tag==='input').listeners.change()
  f.send().listeners.click()
  await new Promise(r=>setImmediate(r))
  assert.equal(replies.length,1);assert.equal(replies[0].answers.length,0)
  assert.equal(replies[0].section_feedback[0].kind,'explain')
})
test('inline transport submits through bridge without network and prevents double sends',async()=>{
  const received=[];const f=await fixture('inline',async(data,summary)=>received.push({data,summary}))
  assert.equal(f.send().disabled,false)
  f.send().listeners.click();f.send().listeners.click();await new Promise(r=>setImmediate(r))
  assert.equal(received.length,1);assert.equal(received[0].data.token,'round');assert.ok(received[0].summary)
  assert.equal(f.requests.length,0);assert.equal(f.send().disabled,true)
})
test('inline reload restores delivered replies as read-only without resending',async()=>{
  const f=await fixture('inline')
  f.context.window.openchamber.answer={token:'round',answers:[{id:'a',choice:{id:'yes'},note:'Saved answer'}],section_feedback:[{section:2,kind:'comment',note:'Saved correction'}],general:'Saved general'}
  const body=new Element('body');f.context.document.body=body
  vm.runInNewContext(fs.readFileSync(new URL('../assets/panel.js',import.meta.url),'utf8'),f.context)
  const nodes=walk(body)
  assert.equal(nodes.find(e=>e.className==='dd-submit').disabled,true)
  assert.ok(nodes.some(e=>e.tag==='textarea'&&e.value==='Saved correction'))
  assert.ok(nodes.filter(e=>e.tag==='textarea').every(e=>e.disabled))
  assert.equal(f.requests.length,0)
})

test('submit lists all missing decisions and feedback reasons with individual jump links',async()=>{
  const f=await fixture('inline',async()=>{},false,false)
  f.actions[0].listeners.click()
  const message=()=>f.nodes().find(e=>e.className==='dd-msg')
  const text=()=>walk(message()).map(e=>e.text||e.textContent||'').join(' ')
  const links=()=>walk(message()).filter(e=>e.className==='dd-link')
  assert.equal(links().length,2)
  assert.match(text(),/Q/);assert.match(text(),/Context/);assert.match(text(),/Choose a feedback type/)
  const card=f.nodes().find(e=>e.className==='dd-card dd-feedback')
  walk(card).filter(e=>e.tag==='input')[1].listeners.change()
  assert.equal(links().length,2);assert.match(text(),/Write your question or comment/)
  const feedbackNote=walk(card).find(e=>e.tag==='textarea');feedbackNote.value='test';feedbackNote.listeners.input()
  assert.equal(links().length,1);assert.equal(f.send().disabled,true)
  const decisionNote=f.nodes().find(e=>e.tag==='textarea'&&e.attrs.placeholder===STR.en.noteHint);decisionNote.value='answer';decisionNote.listeners.input()
  assert.equal(links().length,0);assert.equal(f.send().disabled,false)
})
test('inline failed submission retains drafts and allows retry',async()=>{
  let tries=0;const f=await fixture('inline',async()=>{if(++tries===1)throw new Error('unavailable')})
  f.send().listeners.click();await new Promise(r=>setImmediate(r))
  assert.equal(f.send().disabled,false)
  f.send().listeners.click();await new Promise(r=>setImmediate(r));assert.equal(tries,2)
})
