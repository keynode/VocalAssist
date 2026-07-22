# MIDI Track Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a compact, persistent MIDI track/channel selector that can route one or several groups into VocalAssist's visualized and scored vocal layer without changing automatic behavior.

**Architecture:** Keep the existing single-file application structure. Add pure MIDI selection/splitting helpers in `index.html`, retain compact MIDI group metadata in cached song records, centralize layer rebuilding for initial load and live selection changes, and add a second view inside the existing settings popover. Polyphonic manual selections remain complete in `VOCAL`, while microphone scoring chooses the nearest currently active target.

**Tech Stack:** Static HTML/CSS/JavaScript, browser `localStorage`, Web Audio, Node.js source/extracted-function tests, Python local HTTP server for browser QA.

## Global Constraints

- No new runtime dependencies or build step.
- Automatic MIDI detection and its monophonic output must remain byte-for-byte equivalent when `midiTracks` is absent.
- The selector is available only for MIDI songs with usable non-percussion groups.
- The selection unit and stored key are the existing MIDI track/channel group: `${tr}:${ch}`.
- Manual mode always contains at least one group; reset deletes `midiTracks`.
- MusicXML behavior remains unchanged.
- The settings surface remains a compact, non-modal popover.
- Russian and English UI strings and accessible names are required.

---

### Task 1: Pure MIDI group selection and polyphonic splitting

**Files:**
- Create: `tests/midi-track-selection.test.js`
- Modify: `index.html:1384-1555`

**Interfaces:**
- Produces: `midiGroupKey(group) -> string`
- Produces: `midiCandidates(mid) -> Array<Group>` excluding channel index 9 and empty groups
- Produces: `pickMidiAutoGroup(mid, candidates) -> Group`
- Produces: `findPolyPhrases(raw, tempo) -> number[]`
- Changes: `splitMidiSong(mid, selectedKeys = null) -> {raw, acc, phr, midiGroups, midiAutoKey}`
- Consumes later: cached `midiGroups` entries shaped as `{key,tr,ch,name,prog,notes}`

- [ ] **Step 1: Write failing parser and split tests**

Create `tests/midi-track-selection.test.js` with the existing balanced-brace extractor pattern. Evaluate `round3`, `catOfProg`, `findPhrases`, `midiGroupKey`, `midiCandidates`, `pickMidiAutoGroup`, `findPolyPhrases`, and `splitMidiSong` in one `Function`. Use this fixture:

```js
const mid = {
  bpm: 120,
  trackNames: ['Lead Vocal', 'Harmony', 'Drums'],
  groups: [
    {tr:0,ch:0,prog:53,notes:[{q:0,d:1,m:60},{q:1,d:1,m:62},{q:2,d:1,m:64}]},
    {tr:1,ch:1,prog:52,notes:[{q:0,d:1,m:67},{q:0,d:1,m:71},{q:2,d:1,m:69}]},
    {tr:2,ch:9,prog:0,notes:[{q:0,d:.25,m:36}]},
  ],
};
```

Assert that automatic mode selects the named lead and collapses same-onset notes as before; manual keys `['0:0','1:1']` preserve both harmony notes at `q=0`; accompaniment contains no selected or percussion notes; `midiGroups` excludes percussion and includes stable keys/names; and `findPolyPhrases` groups simultaneous onsets without losing notes.

- [ ] **Step 2: Run the test and verify RED**

Run: `node tests/midi-track-selection.test.js`

Expected: FAIL with `missing function midiGroupKey`.

- [ ] **Step 3: Extract automatic scoring and add manual split behavior**

Implement the helpers in `index.html`. `pickMidiAutoGroup` must contain the current scoring formula unchanged. In `splitMidiSong`, use `selectedKeys == null` for automatic mode and retain the current collapse/truncation loop exactly. For manual mode, merge and sort every selected note by onset then pitch without collapse or truncation. Convert unselected candidate groups to accompaniment with `catOfProg`. Return normalized metadata:

```js
const midiGroups=cands.map(g=>({
  key:midiGroupKey(g), tr:g.tr, ch:g.ch,
  name:(mid.trackNames&&mid.trackNames[g.tr])||g.name||'',
  prog:g.prog, notes:g.notes
}));
return {raw,acc,phr,midiGroups,midiAutoKey:midiGroupKey(best)};
```

- [ ] **Step 4: Run the focused test and existing tests**

Run:

```text
node tests/midi-track-selection.test.js
node tests/full-width-contour.test.js
node tests/settings-help.test.js
node tests/mic-latency.test.js
```

Expected: all four commands exit 0.

### Task 2: Preference validation, caching, and centralized layer rebuild

**Files:**
- Modify: `tests/midi-track-selection.test.js`
- Modify: `index.html:1106-1263`
- Modify: `index.html:1557-1621`

**Interfaces:**
- Produces: `validateMidiTrackKeys(song, storedKeys) -> {keys, changed, staleAll}` where `keys === null` means automatic mode
- Produces: `midiSource(song) -> {groups,trackNames,bpm,autoKey}`
- Produces: `rebuildMidiSong(song, selectedKeys) -> split result`
- Produces state: `CURRENT_SONG`, the applied song record used by live selector rebuilds
- Stores: `LIB.prefs[songId].midiTracks: string[]`
- Stores on MIDI songs: `midiGroups`, `midiAutoKey`

- [ ] **Step 1: Add failing validation and source-retention assertions**

Extend the test to assert:

```js
assert.deepStrictEqual(validateMidiTrackKeys(song, undefined), {keys:null,changed:false,staleAll:false});
assert.deepStrictEqual(validateMidiTrackKeys(song, ['0:0','missing','0:0']), {keys:['0:0'],changed:true,staleAll:false});
assert.deepStrictEqual(validateMidiTrackKeys(song, ['missing']), {keys:null,changed:true,staleAll:true});
```

Add source assertions that `parseSongData` assigns `midiGroups` and `midiAutoKey`, local `entry` stores them, repository cache data stores them, `openRepoSong` forwards them, and `PARSE_V` is incremented from 4 to 5.

- [ ] **Step 2: Run the test and verify RED**

Run: `node tests/midi-track-selection.test.js`

Expected: FAIL with `missing function validateMidiTrackKeys` or the first missing retention assertion.

- [ ] **Step 3: Implement validation and retained metadata**

Add `validateMidiTrackKeys` using the current song's `midiGroups` keys, stable-order de-duplication, and invalid-key removal. Add `midiSource`/`rebuildMidiSong` so cached songs can reuse `splitMidiSong`. Persist `midiGroups` and `midiAutoKey` in `parseSongData`, `loadFile`, repository cache creation, and the object passed to `applySong`. Set `PARSE_V=5`.

In `applySong`, validate `pref.midiTracks` before assigning layers. Rewrite a partially stale preference, delete a fully stale preference, show `t('midiTracksUnavailable')` only for the fully stale case, and derive `VOCAL`, `ACC`, and `PHR` from the validated override. Keep the existing `raw/acc/phr` path for MusicXML and legacy local entries without MIDI metadata.

- [ ] **Step 4: Run focused and regression tests**

Run the four Node commands from Task 1. Expected: all exit 0.

### Task 3: Compact settings subview and localized controls

**Files:**
- Create: `tests/midi-track-ui.test.js`
- Modify: `index.html:252-369`
- Modify: `index.html:437-512`
- Modify: `index.html:1766-1788`

**Interfaces:**
- Produces DOM IDs: `settingsMain`, `midiTracksBtn`, `midiTracksView`, `midiTracksBack`, `midiTracksState`, `midiTracksAuto`, `midiTrackList`
- Produces: `renderMidiTrackControls()`, `openMidiTrackView()`, `closeMidiTrackView(returnFocus)`, `setMidiTrackSelection(keys)`
- Consumes: `CURRENT_SONG` metadata and `LIB.prefs[curSongId].midiTracks`

- [ ] **Step 1: Write failing structure and behavior tests**

Create `tests/midi-track-ui.test.js` and assert that the required IDs exist, `.midi-tracks-entry` spans the settings grid, `.midi-track-list` has bounded scrolling, both translation dictionaries contain all selector labels/toast text, native checkbox creation exists, the last selected checkbox is disabled, back restores focus to `midiTracksBtn`, and selector visibility depends on `CURRENT_SONG.midiGroups` rather than file extension text.

- [ ] **Step 2: Run the test and verify RED**

Run: `node tests/midi-track-ui.test.js`

Expected: FAIL because `id="midiTracksBtn"` is absent.

- [ ] **Step 3: Add the same-popover selector view**

Wrap the current `.more-body` as `#settingsMain`, add the full-width hidden entry button, and add a hidden sibling `#midiTracksView`. Render each group with a native checkbox and associated label showing fallback name, one-based channel, one-based program, note count, and pitch range. In automatic mode check/mark `midiAutoKey`; in manual mode check the persisted keys. Disable only the sole checked item. Reset deletes `midiTracks`.

Add CSS for a fixed-height scroll area, compact rows, state badge, and full-width grid entry without changing `#morePanel` positioning or modality. Add all Russian and English strings, call `renderMidiTrackControls()` from `applyLang` and song application, and make Escape return from the selector before it closes settings.

- [ ] **Step 4: Run UI and regression tests**

Run:

```text
node tests/midi-track-ui.test.js
node tests/midi-track-selection.test.js
node tests/full-width-contour.test.js
node tests/settings-help.test.js
node tests/mic-latency.test.js
```

Expected: all five commands exit 0.

### Task 4: Live selection rebuild and nearest-target microphone scoring

**Files:**
- Modify: `tests/midi-track-selection.test.js`
- Modify: `tests/midi-track-ui.test.js`
- Modify: `index.html:514-531`
- Modify: `index.html:743-873`
- Modify: `index.html:1577-1598`
- Modify: `index.html:1629-1633`
- Modify: `index.html:1999-2020`

**Interfaces:**
- Produces: `activeTargetNotes(melody, q) -> Array<note>`
- Produces: `nearestTargetDiff(midiPitch, targets) -> number|null`
- Produces: `applyMidiTrackSelection(keys) -> void`
- Replaces single `curNoteG` scoring state with `curNotesG`

- [ ] **Step 1: Add failing polyphonic scoring tests**

Assert:

```js
assert.deepStrictEqual(activeTargetNotes([[0,2,60],[0,1,67],[2,1,64]], .5), [[0,2,60],[0,1,67]]);
assert.strictEqual(nearestTargetDiff(66.6, [[0,2,60],[0,1,67]]), -0.4);
assert.strictEqual(nearestTargetDiff(66.6, []), null);
```

Add source assertions that `processPitch` uses `nearestTargetDiff(mf,curNotesG)` and that `applyMidiTrackSelection` captures the current position, pauses active playback, rebuilds layers/ticks/lyrics/range, and calls `setPos` with the preserved bounded position.

- [ ] **Step 2: Run tests and verify RED**

Run the two MIDI test files. Expected: failure for missing `activeTargetNotes`.

- [ ] **Step 3: Implement live rebuilding and nearest scoring**

Add the pure helpers. Update `updNoteBox` to assign every active note to `curNotesG` and keep one note only for the compact current-note text. Change `processPitch` to use the signed nearest difference. Implement `applyMidiTrackSelection` to pause, persist/delete `midiTracks`, call the centralized rebuild, recalculate `VOCAL`/`ACC`/`PHR`/`MELODY`/duration/ticks/lyrics/range, preserve the bounded playhead, and rerender the selector. Wire checkbox/reset actions to it.

- [ ] **Step 4: Run the full Node test suite**

Run: `Get-ChildItem tests/*.test.js | Sort-Object Name | ForEach-Object { node $_.FullName; if($LASTEXITCODE){exit $LASTEXITCODE} }`

Expected: all test scripts report their pass message and PowerShell exits 0.

### Task 5: Browser QA, final verification, commit, and push

**Files:**
- Modify only if QA exposes a defect: `index.html`, the relevant MIDI test file

**Interfaces:**
- No new interfaces; verifies the completed feature.

- [ ] **Step 1: Run a clean local server and desktop QA**

Open `http://127.0.0.1:8236/`, choose a repository MIDI song, open ⚙, enter MIDI tracks, select at least two groups, verify both appear in the waterfall/contour, start playback, change selection, and verify it pauses at the same position. Reset to automatic mode, reopen the song, and verify the manual selection or reset state persists as appropriate.

- [ ] **Step 2: Run narrow viewport and accessibility QA**

At a narrow viewport, confirm the selector remains inside the compact popover, the list scrolls, checkbox labels are legible, keyboard Tab/Space works, Back restores focus, Escape returns to settings first, and MusicXML shows no selector.

- [ ] **Step 3: Inspect browser console**

Expected: no new JavaScript errors while opening songs, switching tracks, changing language, or resetting selection.

- [ ] **Step 4: Run final verification from a clean status review**

Run:

```text
git diff --check
Get-ChildItem tests/*.test.js | Sort-Object Name | ForEach-Object { node $_.FullName; if($LASTEXITCODE){exit $LASTEXITCODE} }
git status --short --branch
```

Expected: diff check and all tests exit 0; status lists only the intended plan, tests, and `index.html` before commit.

- [ ] **Step 5: Commit and push main**

Stage only `index.html`, `tests/midi-track-selection.test.js`, `tests/midi-track-ui.test.js`, and this plan. Commit with `Добавить выбор MIDI-дорожек`, push `main`, then verify `git rev-parse HEAD` equals `git rev-parse origin/main` and the worktree is clean.
