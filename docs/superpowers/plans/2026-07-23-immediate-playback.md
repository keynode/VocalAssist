# Immediate Playback and Live MIDI Track Switching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the playback count-in and keep active playback running when MIDI visualization tracks change.

**Architecture:** Keep the existing single animation loop and quarter-note clock. Start it immediately in `play()`, and hot-swap MIDI-derived arrays by capturing and re-anchoring the current position without calling `pause()` or starting a second loop.

**Tech Stack:** Single-page HTML/CSS/JavaScript, Web Audio API, Node.js source-regression tests.

## Global Constraints

- Pressing Play or Space starts immediately at the current position.
- Track selection changes must preserve active playback and current position.
- Already-started Web Audio voices may finish naturally.
- Opening a different song may still pause.
- No new dependencies or unrelated refactors.

---

### Task 1: Add Transport Regression Coverage

**Files:**
- Create: `tests/immediate-playback.test.js`
- Modify: `tests/midi-track-ui.test.js`

**Interfaces:**
- Consumes: `index.html` transport functions and `applyMidiTrackSelection(nextKeys)`.
- Produces: source-level contracts for immediate `play()` and continuous live MIDI rebuilding.

- [ ] **Step 1: Write the failing immediate-playback test**

Create a Node assertion test that reads `index.html`, extracts `play()` and `tick()`, and asserts that `countin`, `click`, `withCount`, `setTimeout`, `q0-4`, `startQ0Play`, and `play(true)` are absent while `play()` assigns `startAcTime=ac.currentTime` and requests the existing tick loop.

```js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function extractFunction(name) {
  const start = html.indexOf(`function ${name}(`);
  assert(start >= 0, `missing function ${name}`);
  const open = html.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}' && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error(`unterminated function ${name}`);
}

const play = extractFunction('play');
const tick = extractFunction('tick');
assert(!html.includes('id="countin"'));
assert(!html.includes('.countin'));
assert(!html.includes('function click('));
assert(!html.includes('startQ0Play'));
assert(!html.includes('play(true)'));
for (const delayed of ['withCount', 'setTimeout', 'q0-4']) assert(!play.includes(delayed));
assert(play.includes('startAcTime=ac.currentTime'));
assert(play.includes('raf=requestAnimationFrame(tick)'));
assert(!tick.includes('countEl'));
```

- [ ] **Step 2: Strengthen the live-selection test**

Replace the old pause assertion with checks for `const wasPlaying=playing`, a captured live position, `startQ=boundedQ`, `startAcTime=ac.currentTime`, refreshed `curIdx`/`accIdx`, an inactive `setPos(boundedQ)` branch, and the absence of `pause()`, `stopSound()`, and `requestAnimationFrame` inside `applyMidiTrackSelection()`.

```js
for (const fragment of [
  'const wasPlaying=playing',
  'const q=wasPlaying?Math.max(nowQ(),0):startQ',
  'const boundedQ=Math.min(wasPlaying?Math.max(nowQ(),q):q,totalQ)',
  'startQ=boundedQ',
  'startAcTime=ac.currentTime',
  'curIdx=idxAfter(MELODY,boundedQ)',
  'accIdx=idxAfter(ACC,boundedQ)',
  'else setPos(boundedQ)',
]) assert(liveSelection.includes(fragment));
for (const forbidden of ['pause()', 'stopSound()', 'requestAnimationFrame']) {
  assert(!liveSelection.includes(forbidden));
}
```

- [ ] **Step 3: Run both tests and confirm the expected failures**

Run:

```powershell
node tests/immediate-playback.test.js
node tests/midi-track-ui.test.js
```

Expected: both commands fail against the old delayed/pause behavior.

### Task 2: Implement Immediate Transport Start

**Files:**
- Modify: `index.html`
- Test: `tests/immediate-playback.test.js`

**Interfaces:**
- Consumes: existing `play()`, `tick()`, `pause()`, `jumpTo()`, tempo, transpose, octave, and keyboard handlers.
- Produces: parameterless `play()` with immediate clock anchoring.

- [ ] **Step 1: Remove count-in presentation and audio**

Delete `.countin` styles, its DOM element, the `click(hi)` synthesizer, the countdown branch in `tick()`, and all `countEl` operations. Rewrite localized help text to say playback starts immediately.

```js
footerHtml:'Воспроизведение начинается сразу — вступай, когда загорится первая клавиша. ...'
footerHtml:'Playback starts immediately — come in when the first key lights up. ...'
```

- [ ] **Step 2: Simplify the transport clock**

Make `play()` set `startAcTime=ac.currentTime`, compute indices from `startQ`, and request `tick()` immediately. Remove `startQ0Play`; re-anchor tempo, transposition, octave, and seek changes using `startQ` only.

```js
function play(){
  unlockMedia(); initAudio(); if(ac.state==='suspended')ac.resume();
  playing=true; updatePlayButton();
  hitN=0; hitT=0; $('hitPct').textContent='—';
  startAcTime=ac.currentTime;
  curIdx=idxFor(MELODY,startQ); accIdx=idxFor(ACC,startQ);
  raf=requestAnimationFrame(tick);
}
```

- [ ] **Step 3: Update input handlers**

Change the Play button and Space shortcut from `play(true)` to `play()`.

```js
$('play').onclick=()=>{playing?pause():play();};
if(e.code==='Space'){e.preventDefault();if(e.target.tagName==='BUTTON')e.target.blur();playing?pause():play();}
```

- [ ] **Step 4: Run the immediate-playback test**

Run `node tests/immediate-playback.test.js`.

Expected: `Immediate playback checks passed`.

### Task 3: Implement Continuous MIDI Track Hot-Swap

**Files:**
- Modify: `index.html`
- Test: `tests/midi-track-ui.test.js`

**Interfaces:**
- Consumes: `nowQ()`, `idxFor(arr,q)`, `setPos(q)`, `rebuildMidiSong()`, and existing render/update helpers.
- Produces: `applyMidiTrackSelection(nextKeys)` that preserves active transport state.

- [ ] **Step 1: Capture transport state before rebuilding**

Store `const wasPlaying=playing` and capture `q` from `nowQ()` only when active.

```js
const wasPlaying=playing;
const q=wasPlaying?Math.max(nowQ(),0):startQ;
```

- [ ] **Step 2: Rebuild the selected MIDI layers**

Keep existing preference persistence, `VOCAL`/`ACC`/`PHR`/`MELODY` replacement, duration, lyrics, ticks, DOM rebuild, selector, and shelf refresh behavior.

```js
const layers=rebuildMidiSong(CURRENT_SONG,keys);
VOCAL=layers.raw; ACC=layers.acc; PHR=layers.phr;
calcTotal();
MELODY=buildMelody();
buildLyrics();
buildTicks();
rebuild();
updDur();
```

- [ ] **Step 3: Re-anchor active playback without pausing**

Clamp the old position as `boundedQ`. When `wasPlaying`, assign `startQ=boundedQ`, `startAcTime=ac.currentTime`, refresh `curIdx` and `accIdx` strictly after that instant, clear keyboard state, and refresh HUD/render/note/lyrics views. Otherwise call `setPos(boundedQ)`.

```js
function idxAfter(arr,q){let i=0;while(i<arr.length&&arr[i][0]<=q+1e-6)i++;return i;}

const boundedQ=Math.min(wasPlaying?Math.max(nowQ(),q):q,totalQ);
loopP=phraseAt(boundedQ);
if(wasPlaying){
  startQ=boundedQ; startAcTime=ac.currentTime;
  curIdx=idxAfter(MELODY,boundedQ); accIdx=idxAfter(ACC,boundedQ);
  clearKeys();
  for(const [s,d,m] of activeTargetNotes(MELODY,boundedQ)){
    active.set(m,Math.max(active.get(m)??-Infinity,s+d)); updateKeyHighlight(m);
  }
  updHud(boundedQ); render(boundedQ); updNoteBox(boundedQ);
  if(hView) drawHView(boundedQ);
  if(LYR) seekLyrics(boundedQ);
}else setPos(boundedQ);
```

- [ ] **Step 4: Run the live-selection test**

Run `node tests/midi-track-ui.test.js`.

Expected: `MIDI track selector UI checks passed`.

### Task 4: Verify and Publish

**Files:**
- Verify: `index.html`
- Verify: `tests/*.test.js`
- Verify: `docs/superpowers/specs/2026-07-22-midi-track-selection-design.md`
- Verify: `docs/superpowers/specs/2026-07-23-immediate-playback-design.md`

**Interfaces:**
- Consumes: completed implementation and localhost application.
- Produces: tested `main` commit synchronized with `origin/main`.

- [ ] **Step 1: Run automated verification**

Run `git diff --check`, every `tests/*.test.js` file with Node, and parse the inline application script with `vm.Script`.

```powershell
git diff --check
Get-ChildItem tests/*.test.js | Sort-Object Name | ForEach-Object { node $_.FullName; if($LASTEXITCODE){exit $LASTEXITCODE} }
node --experimental-vm-modules -e "const fs=require('fs'),vm=require('vm');const h=fs.readFileSync('index.html','utf8');const s=h.match(/<script>([\s\S]*?)<\/script>/)[1];new vm.Script(s);console.log('inline script syntax OK')"
```

- [ ] **Step 2: Run browser QA**

Reload `http://127.0.0.1:8236/`, start a MIDI song, confirm the timeline moves immediately with no countdown, toggle a MIDI track while playing, and confirm the Pause state and advancing timeline are preserved with no console errors.

```text
Expected: no #countin element; Play changes to Pause immediately; timeline percentage increases before and after a MIDI checkbox change; console error count remains zero.
```

- [ ] **Step 3: Commit and push**

Stage only the two specs, this plan, tests, and `index.html`; commit the verified behavior and push `main` to `origin`.

```powershell
git add -- index.html tests/immediate-playback.test.js tests/midi-track-ui.test.js docs/superpowers/specs/2026-07-22-midi-track-selection-design.md docs/superpowers/specs/2026-07-23-immediate-playback-design.md docs/superpowers/plans/2026-07-23-immediate-playback.md
git commit -m "Ускорить запуск и смену MIDI-дорожек"
git push origin main
```

- [ ] **Step 4: Confirm remote parity**

Fetch `origin`, compare `HEAD` with `origin/main`, and confirm the worktree is clean.

```powershell
git fetch origin main
git rev-parse HEAD
git rev-parse origin/main
git status --short --branch
```
