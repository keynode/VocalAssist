# High-Quality MIDI Audio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add SpessaSynth-powered MIDI playback with an IndexedDB-persisted custom Timbres of Heaven bank and a bundled GeneralUser GS fallback.

**Architecture:** Keep VocalAssist's existing quarter-note transport and visualization as the source of truth. Preserve raw MIDI events during parsing, schedule them with lookahead into SpessaSynth, route selected vocal groups to a dedicated guide channel, and fall back to WebAudioFont whenever the new path is unavailable.

**Tech Stack:** Vanilla HTML/CSS/JavaScript, SpessaSynth 4.3.11, esbuild, AudioWorklet, IndexedDB, SF2/SF3/DLS, Node/npm build tooling.

## Global Constraints

- Do not distribute or mirror Timbres of Heaven.
- GeneralUser GS is the bundled legal fallback.
- Play remains immediate by falling back to WebAudioFont while the high-quality engine loads.
- Active track-selection changes never pause playback.
- Existing MusicXML and microphone behavior remains unchanged.
- Per the user's explicit instruction, do not run automated tests or browser QA; report the implementation as unverified.

---

### Task 1: Static SpessaSynth Build

**Files:**
- Create: `package.json`
- Create: `package-lock.json`
- Create: `src/midi-audio-engine.js`
- Create: `src/build-audio.mjs`
- Create: `audio/midi-audio-engine.min.js`
- Create: `audio/spessasynth_processor.min.js`

**Interfaces:**
- Produces: `window.VocalAssistMidiEngine.create(options)` and static browser/worklet assets.

- [ ] Add exact dependencies `spessasynth_lib@4.3.11` and `esbuild`, plus a `build:audio` script.
- [ ] Implement an engine facade with `initialize`, `loadBank`, `setSong`, `playFrom`, `scheduleUntil`, `pause`, `seek`, `setVolumes`, `setTranspose`, `setGuideGroups`, `status`, and `destroy` methods.
- [ ] Bundle the facade for browser use and copy the worklet belonging to the pinned package.
- [ ] Run only `npm run build:audio`, because creating committed bundle/worklet outputs is an implementation step rather than a test pass.

### Task 2: SoundFont Storage and Settings

**Files:**
- Modify: `index.html`
- Modify: `src/midi-audio-engine.js`
- Create: `soundfonts/GeneralUser-GS.sf2`
- Create: `soundfonts/GENERALUSER-LICENSE.txt`

**Interfaces:**
- Consumes: `VocalAssistMidiEngine.create(options)`.
- Produces: `openAudioDatabase()`, `loadSavedSoundBank()`, `saveSoundBank(file)`, `deleteSavedSoundBank()`, and the sound-bank settings subview.

- [ ] Add IndexedDB object store `soundbanks` with key `active`, storing `{name,size,type,blob}`.
- [ ] Request persistent browser storage before saving; keep an in-memory bank and warn if persistence fails.
- [ ] Add localized settings controls for choosing `.sf2/.sf3/.dls`, displaying state, and resetting to GeneralUser GS.
- [ ] Preserve the current bank while playing and activate a replacement only on the next playback.
- [ ] Add GeneralUser GS and its exact upstream license; do not add any Timbres of Heaven binary.

### Task 3: Preserve MIDI Events

**Files:**
- Modify: `index.html`

**Interfaces:**
- Produces: `midiEvents: Array<{q,track,channel,groupKey,data}>` on parsed MIDI songs.

- [ ] Extend `parseMidi` to retain Note On/Off velocity, Program Change, controllers, pitch bend, pressure, and relevant SysEx data with quarter-note positions.
- [ ] Retain `groupKey` for channel events so selected vocal Note events can be filtered without discarding controller state.
- [ ] Increment `PARSE_V` and persist `midiEvents` in repository/local song data.
- [ ] Leave MusicXML and legacy entries without `midiEvents` on WebAudioFont.

### Task 4: Transport and Routing Integration

**Files:**
- Modify: `index.html`
- Modify: `src/midi-audio-engine.js`

**Interfaces:**
- Consumes: `midiEvents`, `MELODY`, selected track keys, `bpm`, `TRANSP`, `VOCT`, and the two existing volume sliders.
- Produces: high-quality event scheduling that follows the existing transport.

- [ ] Initialize the engine and selected bank in the background without blocking page startup.
- [ ] On Play, lock the renderer for that playback to either SpessaSynth or WebAudioFont; never switch mid-song.
- [ ] Schedule accompaniment MIDI messages 120 ms ahead, skipping selected groups' Note On/Off events and applying accompaniment transposition.
- [ ] Schedule `MELODY` notes on the reserved guide channel with a fixed clear preset and vocal transposition/octave.
- [ ] Reconstruct non-note channel state on seek/restart/song change before scheduling future notes.
- [ ] Stop all SpessaSynth voices on Pause/Restart/song replacement but not on live track-selection changes.
- [ ] Scale original channel volume by `🎹` and the guide channel by `🎤`.
- [ ] Retain the existing WebAudioFont calls for fallback songs and engine failures.

### Task 5: Documentation and Publication

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-07-23-high-quality-midi-audio-design.md`
- Modify: `docs/superpowers/plans/2026-07-23-high-quality-midi-audio.md`

**Interfaces:**
- Produces: user instructions and a pushed `main` implementation awaiting manual acceptance.

- [ ] Document the SpessaSynth engine, custom bank selection, GeneralUser fallback, Timbres redistribution restriction, IndexedDB persistence, and `npm run build:audio`.
- [ ] Inspect the final file list and staged diff without running tests, syntax checks, or browser automation.
- [ ] Commit the design/plan and implementation, push `main`, fetch, and compare `HEAD` with `origin/main`.
- [ ] Report clearly that no tests or browser QA were run by request and leave manual acceptance to the user.
