# Decision Stage regression tests

Run from the skill directory:

```powershell
node --test tests/*.test.mjs
```

Tests use Node's built-in runner and actual child servers; no npm install is needed.
They never open a browser or dispatch prompts. Each fixture has its own random session ID.
Cleanup stops only child-process handles created by that fixture and removes exact fixture paths.
It never enumerates/kills processes or uses wildcard deletion for session locks/memory.

Inline and feedback coverage: one header feedback action, single-choice types and draft retention, optional explanation notes, required comments, bridge-only submission, retry and reload, canonical section targets, explanation-only follow-up, unique round artifacts, acceptance/replacement guard, stale and duplicate acceptance. The lightweight DOM fixture is not a real browser; actual OpenChamber delivery still needs a user round.

Coverage: canonical answer validation, stable decision IDs, round IDs, lock identity, safe replacement,
stale-token rejection, session isolation, loopback default, opt-in exposure, auto-exit and section links.
LAN checks are performed from this machine; they do not prove another device can cross the firewall.
AI reply brevity/deduplication is a skill instruction, not a guarantee tested by these runtime tests.
