# Stable Note Status Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the jumping horizontal note-status display with a fixed-width three-row grid whose labels, notes, and cents stay aligned.

**Architecture:** Keep the existing upper-left overlay and update only its internal HTML, CSS, and note-value assignment. Each row owns the same explicit three-column grid; the microphone row remains conditionally hidden and therefore cannot move the first two rows.

**Tech Stack:** Single-page HTML/CSS/JavaScript and Node source-regression tests.

## Global Constraints

- Preserve the current upper-left position, translucent panel styling, and z-index.
- Display the complete current note once with `noteFull()`.
- Keep current, next, and detected notes in fixed columns.
- Keep cents in a separate fixed-width column.
- Show the detected row only while the microphone is enabled.
- Do not change playback, scoring, microphone timing, waterfall, contour, or keyboard behavior.
- Preserve Russian and English localization.

---

### Task 1: Stable vertical note-status grid

**Files:**
- Create: `tests/note-status-layout.test.js`
- Modify: `index.html:186-191`
- Modify: `index.html:324-326`
- Modify: `index.html:447-451`
- Modify: `index.html:1159-1161`
- Modify: `index.html:1208-1216`

**Interfaces:**
- Consumes: existing `noteFull(midi)` and translations `now`, `next`, and `sing`.
- Produces: `.note-status-row`, `.note-status-label`, `.note-status-note`, and `.note-status-cents`.
- Preserves DOM IDs: `curNN`, `nextNN`, `sungBox`, `sungNN`, and `sungCents`.
- Removes DOM ID: `curSub`.

- [ ] **Step 1: Write the failing source-regression test**

Create `tests/note-status-layout.test.js`:

```js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const style = (html.match(/<style>([\s\S]*?)<\/style>/)||[])[1]||'';
const boxStart = html.indexOf('<div class="nowbox">');
const boxEnd = html.indexOf('<div class="nowline">', boxStart);
const box = html.slice(boxStart, boxEnd);

assert(/\.nowbox\s*\{[^}]*display\s*:\s*grid/.test(style), 'note status must use a vertical grid');
assert(!/\.nowbox\s*\{[^}]*display\s*:\s*flex/.test(style), 'note status must not use horizontal flex');
assert(/\.note-status-row\s*\{[^}]*grid-template-columns\s*:\s*[^;}]+/.test(style), 'rows need fixed columns');
assert(/\.note-status-cents\s*\{[^}]*min-width\s*:/.test(style), 'cents need a stable slot');
assert.strictEqual((box.match(/class="note-status-row/g)||[]).length, 3, 'three rows are required');
assert(box.indexOf('data-i18n="now"') < box.indexOf('data-i18n="next"'));
assert(box.indexOf('data-i18n="next"') < box.indexOf('data-i18n="sing"'));
assert(box.includes('id="sungBox" style="display:none"'), 'microphone row stays hidden initially');
assert(!box.includes('id="curSub"'), 'duplicate current-note subtitle must be removed');

function extractFunction(name) {
  const start = html.indexOf(`function ${name}(`);
  const open = html.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}' && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error(`missing function ${name}`);
}

const update = extractFunction('updNoteBox');
const reset = extractFunction('reset');
assert(update.includes("$('curNN').textContent=cur?noteFull(cur[2]):'—'"));
assert(!update.includes('curSub'));
assert(!reset.includes('curSub'));

console.log('stable note status layout checks passed');
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node tests/note-status-layout.test.js
```

Expected: FAIL because `.nowbox` still uses `display:flex`.

- [ ] **Step 3: Implement fixed row styling**

Replace the current `.nowbox`, `.cur`, and `.nxt` rules with:

```css
.nowbox{position:absolute;top:10px;left:10px;z-index:5;display:grid;gap:3px;
  background:#12162acc;border:1px solid var(--line);border-radius:12px;padding:8px 12px;
  backdrop-filter:blur(6px)}
.note-status-row{display:grid;grid-template-columns:54px 64px 44px;align-items:baseline;min-height:18px}
.note-status-label{color:var(--muted);font-size:11px;white-space:nowrap}
.note-status-note{min-width:64px;font-size:14px;font-weight:650;color:var(--air);white-space:nowrap}
.note-status-row.current .note-status-note{font-family:"Unbounded",sans-serif;font-size:16px;color:var(--flame)}
.note-status-cents{min-width:44px;text-align:right;color:var(--muted);font-size:11px;white-space:nowrap}
.sung .note-status-note{color:var(--good)}
.sung.off .note-status-note{color:var(--bad)}
```

At the narrow breakpoint use:

```css
.nowbox{padding:5px 8px}
.note-status-row{grid-template-columns:48px 58px 38px;min-height:17px}
.note-status-row.current .note-status-note{font-size:14px}
.note-status-note{min-width:58px;font-size:12px}
.note-status-cents{min-width:38px;font-size:10px}
```

- [ ] **Step 4: Replace markup with three ordered rows**

Use:

```html
<div class="nowbox">
  <div class="note-status-row current">
    <span class="note-status-label" data-i18n="now">сейчас:</span>
    <b class="note-status-note" id="curNN">—</b>
  </div>
  <div class="note-status-row">
    <span class="note-status-label" data-i18n="next">дальше</span>
    <b class="note-status-note" id="nextNN">—</b>
  </div>
  <div class="note-status-row sung" id="sungBox" style="display:none">
    <span class="note-status-label" data-i18n="sing">пою</span>
    <b class="note-status-note" id="sungNN">—</b>
    <span class="note-status-cents" id="sungCents"></span>
  </div>
</div>
```

- [ ] **Step 5: Remove duplicate current-note updates**

Change `updNoteBox(q)` to:

```js
$('curNN').textContent=cur?noteFull(cur[2]):'—';
$('nextNN').textContent=next?noteFull(next[2]):'—';
```

Change `reset()` so it resets only `curNN` and `nextNN`; remove every `curSub` access.

- [ ] **Step 6: Run focused and complete verification**

Run:

```powershell
node tests/note-status-layout.test.js
Get-ChildItem -LiteralPath tests -Filter '*.test.js' | Sort-Object Name | ForEach-Object { node $_.FullName; if($LASTEXITCODE -ne 0){ throw "Failed: $($_.Name)" } }
git diff --check
```

Expected: every test prints its pass message and `git diff --check` is silent.

- [ ] **Step 7: Commit and publish**

```powershell
git add -- index.html tests/note-status-layout.test.js
git commit -m "Стабилизировать блок текущих нот"
git push origin main
git fetch origin main
if((git rev-parse HEAD) -ne (git rev-parse origin/main)){throw 'HEAD and origin/main differ'}
```

Expected: push succeeds and local `HEAD` equals `origin/main`.
