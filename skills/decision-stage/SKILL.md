---
name: decision-stage
description: Use when the user explicitly requests decision-stage or a demo page, or when tangled decisions need diagrams, visual comparisons, or interactive demonstrations to become understandable. Do not use merely because there are multiple questions; simple questions belong in the question tool.
---

# Decision Stage

## Overview

When a user is lost, more chat text makes it worse. Make the situation visible in one page. Every open decision gets a reply box in a fixed panel on the right. The user answers all of them, presses **Submit once**, and the answers come back into this session as the output of one background command.

You write **content only**, as a JSON spec. One script validates it, builds the page, starts the server, opens the user's browser and waits for the answer. You never write HTML, CSS, a server, or the panel, and you never open the browser yourself.

Once using this page, do not duplicate its questions in chat or the `question` tool. Outside this workflow, use the question tool for simple questions that need no demonstration.

## When to Use

- "too complicated", "confusing", "I don't get it", "make me a demo / diagram"
- several problems or decisions are tangled in one message
- the user explicitly requests the page, even for one question

Question count alone is not a trigger. Simple independent questions belong in the question tool.

Not for: one simple question (just ask it), or a pure status report.

## Steps

1. **Separate the problems.** List each independent problem or decision in the user's own words. Inventory the entire relevant discussion, not just the last message or its final three questions. There is no question-count cap. Separate confirmed decisions, user decisions still needed, proposals not yet confirmed, and technical unknowns the AI must investigate. Merge only true duplicates; never silently omit items. If splitting into rounds, explicitly show what remains for later. If two share a root cause, say so but keep them separate.
2. **Sort every claim into verified vs unverified.** Verified = you read the code, ran it or read the docs this session (say which). Unverified = inference, memory, "should work". Never put an inference in the verified column.
3. **Create the work file:** `node <skill-dir>/scripts/decision-stage.mjs --new <short-name>`. It makes a folder in the OS temp directory, copies the template there and prints `DECISION_STAGE_SPEC=<path>`. Replace its content; keep only the blocks you need. **Never put the spec, page or answers in the user's repo**: they are throwaway and would become stale files.
4. **Check it:** `node <skill-dir>/scripts/decision-stage.mjs <spec.json> --check`. It lists **every** problem at once. Fix them all and run it again until it prints `DECISION_STAGE_OK`. Nothing is written.
5. **Run it for real, as a background command, exactly once:** `node <skill-dir>/scripts/decision-stage.mjs <spec.json>`. It opens the user's default browser itself. Do not open anything, do not read an output file for a URL. **Your whole reply after it starts is the printed `DECISION_STAGE_URL` and nothing else** (at most a few words such as "頁面已開：<URL>"). The page is already open in their browser and says everything itself. Do not summarize the page, list its sections or questions, repeat the decisions, give your recommendations, recap earlier rounds, or add headings or tables. The user can see the page; anything you write about it is noise. The one exception is a warning the script printed that affects them (`DECISION_STAGE_WARNING could not open a browser`, `DECISION_STAGE_BUSY`): say that in one line.
   - **One live page per session.** The script holds a lock per session. If one is already waiting, a second start exits with `DECISION_STAGE_BUSY` and prints the live URL. That is correct: do not retry, do not look for another way, wait for the answers. Only add `--replace` when you deliberately want to kill the unanswered page (e.g. you rewrote the spec), and tell the user the old tab is dead.
   - **By default the page is local only** (`127.0.0.1`, this machine). **Add `--expose` only when the user asks for it**: "expose", "LAN", "local ip", "open it on my phone/another device", or a message like `decision-stage: expose port ...`. Never add it on your own. With `--expose` the server listens on all interfaces and the printed `DECISION_STAGE_URL` is `http://<this machine's LAN IP>:<port>/` (give the user that one; it also works on this machine); `DECISION_STAGE_OTHER_URLS` lists other adapters if there are several. The script still opens the browser on the `127.0.0.1` form. Anyone on the network who can reach the port can read and answer the page, so say in one line that it is exposed to the network. If the user asks to expose a page that is already running, start it again with `--replace --expose` (the port stays the same for this session) and tell them the old tab is dead. Windows Firewall can still block other devices and that is not checked: if the link does not open from another device, suspect the firewall's inbound rule for node.exe, not the page.
   - **Each session gets the same port every round** (a hash of the session id, in 41000-41999). If it is taken or refused, the script tries the next 24, then lets the OS choose, so the link is stable but not guaranteed. A tab left over from an earlier round of the same session reconnects to the new server, notices the round token differs, and says it was replaced; its submit is rejected. The page and its process end by themselves: after answers are saved and session delivery finishes, or at the timeout. Verified `--replace` asks the old server to exit itself; it never kills a PID. If lock identity cannot be verified, it leaves the process and lock untouched. You never need to stop anything.
   - **Never stop decision-stage processes by name or pattern** (`Stop-Process`, `taskkill /im node.exe`, `pkill`, `Get-CimInstance ... | Stop-Process`, or "kill every decision-stage.mjs"). Other sessions may be running their own pages at the same time, and a name match kills their unanswered page too. The only ways to end a page are: the user submits (it exits by itself), the 60-minute timeout, or `--replace` from the session that owns it (the lock is per session, so it can only reach this session's own page). A process you did not start in this session is not yours: if it looks stuck, tell the user its URL and ask; do not kill it. When there is no session id (plain shell), the lock key is the working directory, so two sessions in the same directory would share it; in that case do not use `--replace` without asking.
   - Never re-run the command "to check" that the server is up. `--check` validates only; to see whether a page is live, read the lock or the background command's output, do not start another.
6. **Stop and wait.** Do not poll. When the user presses Submit the command exits and you are woken with the output between `DECISION_STAGE_ANSWERS_BEGIN` and `DECISION_STAGE_ANSWERS_END`. The answers are also saved in a temp folder (`answers_file:` in the output); that copy is temporary and deleted after 7 days.
7. **Handle each round once.** On successful session delivery, full answers arrive only as a session message; background completion contains `DECISION_STAGE_DELIVERED`, a receipt only. Do not reply to that receipt. If session delivery fails or is unavailable, full answers arrive through background-command output instead. Use `round_id` to guard against retries. On its first arrival, reply with one short line per decision: `<title>: <choice> (note, if any)`, include any general note, then continue the original task. If that `round_id` has already been handled, take no action and send no further reply. Do not add test reports or ask which device they used unless they asked for troubleshooting.
8. **Read `needs_more_explanation`.** Every decision listed there is **not answered**. The user did not understand the question, and the recommendation is not a substitute for their decision. Do not pick an option for them.
   - **"需要更多解釋" means: show me, do not tell me more.** The user's priority is a **diagram or an interactive demo they can touch**; extra text is the weakest fix. For each one, the revised page must gain a `flow`, `compare`, `slider` or `html` block (a diagram or something the user can drag or click) that makes the difference between the options visible. Prefer an `html` block with a small working simulation of the real thing (their actual UI, their actual numbers). Text may only introduce or caption that visual, never replace it. If your revision for a decision has only more words, it is wrong, redo it.
   - Read the user's note on that decision; it says what was unclear, and the visual must answer exactly that question.
   - Record the answered decisions now. Edit the spec so `decisions` holds **only the unanswered ones**, reword each `question` if it was part of the confusion, then run step 5 again. Repeat until none is left.
   - **The script keeps the decision log, not you.** Each session has a short log (`<tmp>/decision-stage/memory/<session id>.json`, 7 days) with one line per question title: the answer, or "not decided". It is written when the page opens (open) and when the user submits (decided / still open), and the next page shows it at the bottom as "earlier decisions". You do not write or edit it. After your context is compressed, or when you have lost track of earlier rounds, read the `DECISION_STAGE_LOG` lines the script prints at start-up (or that file) instead of guessing. Keep decision IDs stable across rounds: the log matches by ID. You may reword titles; a genuinely different question needs a new descriptive ID. Read the log before drafting the next round to reuse the right IDs.
9. **Continue naturally from the answers.** There is only one Send replies button. When no answer requests explanation, the conditional consolidation reminder is followed by `decision_log`, the path to accumulated decisions. Read it when consolidating to recover earlier conclusions rather than relying on session history. If explanation is requested, neither the reminder nor that path is attached; the log is still saved.
   - If any answer asks for more explanation, clarify it; the response deliberately omits the consolidation reminder because discussion is not finished.
   - Otherwise the response gently suggests consolidation ONLY if there are no further questions and the discussion is settled. Update the current plan if discussing a plan, or the current spec if discussing a spec. If neither exists, briefly summarize the outcome. Report the actual file updated. If questions remain, ask them instead; the reminder is not an instruction to end the conversation.
   - Notes may reject a question or proposal: they are not automatically agreement. Explain choices remain unresolved. Submission is never blanket approval or authorization to implement. Temp memory does not replace updating the document once conclusions are settled.

If the output ends with `DECISION_STAGE_TIMEOUT`, tell the user nothing was received and ask whether to run it again. Never treat silence as consent. If it prints `DECISION_STAGE_WARNING could not open a browser`, tell the user the URL.

The page shows the title of the OpenChamber session that opened it (a banner above the heading and in the browser tab title), so a user with several pages open can tell which session each belongs to. It is looked up automatically; if the lookup is unavailable the page simply has no banner. `--session-title "..."` sets it by hand.

## Spec reference

Top level: `lang` (`zh-TW` default, or `en`), `title`, `subtitle?`, `summary` (the core conflict in one sentence), `sections`, `verified`, `unverified`, `decisions`.

`sections[]` = `{ title, blocks[] }`. Block types:

| type | fields | use it for |
|---|---|---|
| `text` | `text` | plain explanation. `**bold**`, `` `code` ``, blank line = new paragraph |
| `callout` | `text`, `tone?` | the one thing to notice. tone: info ok warn bad neutral |
| `table` | `head[]`, `rows[][]`, `highlightRow?` | comparing options |
| `flow` | `rows[]` = `{label?, nodes[]={text, sub?, tone?}, note?}` | a sequence or data path. Arrows are drawn |
| `compare` | `title?`, `modes[]` = `{id?, label, description?, result, tone?}` | the user picks a mode and reads what they would see or hear |
| `slider` | `label, unit?, min, max, step, value, outputs[]={label, unit?, formula, decimals?}`, `limit?={value, output, over?, under?}` | numbers that change with a size; `formula` uses `x` and + - * / ( ) only |
| `html` | `html`, `script?` | last resort when none of the above can show it |

`verified[]` = `{claim, source}` and `unverified[]` = `{claim, howToVerify}`: required on every page, not both empty.

`decisions[]` = `{id, section, title (30 chars max), question, options[2-5]}`. **`section` is required**: the 1-based number of the left-hand section the question is about. The panel shows that number as the question's badge (two questions on section 4 become 4a, 4b), links back to the section, and the section's heading shows "N questions on the right". A section with no question is labelled "for reading only, no answer needed", so a section that only explains (decided items, evidence, a diagram) needs no question. The validator warns when a section has something to click or drag but no question points at it. Option = `{id?, label, description, recommended?}`. `description` must say what the option **costs**. At most one `recommended`.

The validator rejects, with a message: a missing field, a wrong type, a bad slider formula, `html` script that does not parse, duplicate ids, and any option that means "you decide". The panel already adds a free-text note and **需要更多解釋** to every decision, so do not add those. The recommended option already is "you decide".

Write each `question` so it stands alone without the page. The user may not understand it at all; that is what **需要更多解釋** is for, and the answer to it is a diagram or an interactive demo, not more text.

On a **first** page, give every decision at least one visual (`flow`, `compare`, `slider`, or an `html` demo) in the sections above it. The validator prints a `DECISION_STAGE_WARNING` when the page has no visual block at all; treat it as a failure and add one. (It cannot check that each decision has its own visual, that part is on you.)

## Page rules

Plain words first, jargon second; define a term the first time it appears. One section per problem, a diagram or interaction **only where words fail**. Label anything simulated as such (the template does). Do not repeat the decisions in the page body; they live in the panel.

## Common mistakes

| Mistake | Fix |
|---|---|
| Writing HTML, a server, or a form yourself | Write the spec; run `decision-stage.mjs` |
| Opening the browser or reading a URL from an output file | The script opens it. Do nothing |
| Skipping `--check` | It reports every spec problem in one pass |
| Asking the decisions in chat or with the `question` tool | Put them in `decisions` |
| Treating "需要更多解釋" as "take the recommendation" | The user is lost. Explain better, ask again |
| Answering "需要更多解釋" with more paragraphs | The user wants a diagram or something they can interact with. Add a visual first; text only captions it |
| Re-asking with the same wording after an explain request | Read the note, add what was missing, reword the question |
| Acting on the answers without restating them | The user cannot see the system block. Echo each answer first (step 7) |
| Polling the command output | Do nothing; its exit wakes you |
| Explaining the page in chat after starting it ("這一頁列出了…", a table of the questions, a recap) | Reply with the URL only. The page already shows everything and is already open |
| Adding `--expose` the user did not ask for | Local only is the default. Expose only on request |
| Cleaning up "leftover" decision-stage processes by name or by listing node processes | Forbidden: it kills other sessions' pages. Leave them; mention the URL to the user |
| Starting the script a second time (to "check", or because the first looked slow) | Blocked by the session lock (`DECISION_STAGE_BUSY`). Wait; use `--replace` only to deliberately supersede |
| Putting a question's number in its `title` ("1. ...") | Use `section`; the panel numbers it to match the left side |
| Mixing guesses into verified | Put them in unverified, with what would confirm them |
| Claiming the page works because the spec validated | Say what was not checked, such as sound or a real browser |
| Stopping the server yourself and not restarting it | If the user may still answer, leave it running. If you stop it, say so and start it again |
