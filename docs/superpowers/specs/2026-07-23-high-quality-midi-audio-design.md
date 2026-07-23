# High-Quality MIDI Audio Design

Date: 2026-07-23

## Goal

Replace VocalAssist's five-preset WebAudioFont accompaniment with a high-quality browser-native MIDI synthesizer while preserving the existing karaoke transport, visualization, microphone scoring, per-song visual track selection, tempo, transposition, and immediate Play behavior.

SpessaSynth is the primary engine. A user-supplied Timbres of Heaven bank is the preferred high-quality sound source. GeneralUser GS is the bundled legal fallback. The existing WebAudioFont path remains an emergency fallback until the new engine has proved stable in the user's manual testing.

## Approved Product Decisions

- Audio quality has priority over download size; hundreds of megabytes are acceptable.
- The selected vocal visualization tracks use one clean guide instrument controlled by the existing `🎤` volume.
- Non-selected MIDI tracks retain their original MIDI instruments and use the existing `🎹` volume.
- The user performs manual testing; Codex does not run automated tests or browser QA for this implementation.
- Playback must still start immediately. If the high-quality engine or bank is not ready, the current WebAudioFont renderer starts instead; the engine never switches underneath an already playing song.
- Changing visualized MIDI tracks while playing must not pause or restart playback.

## Sound Engine

Pin `spessasynth_lib` to version `4.3.11` and use its browser `WorkletSynthesizer`. The bundled worklet and application wrapper are built with esbuild and committed as static assets so VocalAssist continues to run from `serve.py` and static hosting without a runtime package service.

The new engine owns one SpessaSynth synthesizer and connects it to the existing master output. Original MIDI channels are retained for accompaniment. A dedicated extra synth channel is reserved for the guide voice. Channel volume messages are scaled by the existing accompaniment control, while the guide channel is scaled by the vocal control.

The existing animation/quarter-note transport remains authoritative. A 120 ms audio lookahead schedules MIDI messages against AudioContext time so audio timing does not depend on a single animation frame. Pause, seek, restart, song change, and phrase looping stop scheduled voices and reconstruct channel state at the new position.

## MIDI Event Model

The MIDI parser retains a compact ordered event stream in addition to the current note groups:

```js
{
  q: 12.5,
  track: 3,
  channel: 1,
  groupKey: "3:1",
  data: [0x91, 64, 103]
}
```

The stream includes:

- Note On and Note Off with original velocity;
- Program Change;
- bank select, volume, expression, pan, sustain, reverb, chorus, and all other channel controllers;
- pitch bend and channel/poly pressure;
- relevant system-exclusive messages needed by GS/XG files.

Channel messages preserve their original bytes. Each event also records its source track/channel group so Note On and Note Off events belonging to selected visual/vocal groups can be excluded from accompaniment. Their visual note representation is played instead on the dedicated guide channel with a consistent guide preset.

The event stream is part of parsed repository and local song data. `PARSE_V` is incremented so repository MIDI files are reparsed. Existing local MIDI songs that lack event data continue through WebAudioFont until the user imports them again.

## Sound Banks

### Bundled fallback

GeneralUser GS 2.0.3 is distributed as a local SF2/SF3 asset together with its license and attribution. It is loaded in the background after page startup and cached normally by the browser.

### User bank

The settings popover receives a `Sound bank` row and a dedicated subview with:

- active bank name and size;
- `Choose SF2/SF3/DLS` action;
- `Use GeneralUser GS` reset action;
- loading/progress state;
- a reminder that Timbres of Heaven must be downloaded from MidKar and extracted before selection.

Selected user banks are stored as Blobs in IndexedDB, never in localStorage. The application requests persistent storage when supported. If persistence is denied or quota storage fails, the bank remains available for the current page session and a localized message explains that it must be selected again after reload.

Timbres of Heaven is never committed, mirrored, repackaged, or downloaded automatically because MidKar prohibits redistribution without written permission.

## Runtime State

The engine reports one of these states:

- `legacy`: high-quality engine is unavailable and WebAudioFont is active;
- `loading`: library or selected sound bank is being prepared;
- `ready`: high-quality playback is available for MIDI songs with event data;
- `error`: the bank failed to parse or the worklet failed; the legacy renderer remains available.

The settings row displays the engine and bank state. Failures produce a localized toast and never prevent a song from opening or Play from starting.

## Playback Routing

For a ready MIDI song:

1. Restore MIDI controller/program state up to the current quarter-note position.
2. Schedule accompaniment events up to the lookahead boundary, excluding Note events from selected guide groups.
3. Schedule guide notes from the existing `MELODY` collection on the reserved channel using the configured guide preset.
4. Apply `TRANSP` to accompaniment Note messages and `TRANSP + VOCT` through the existing `MELODY` path for the guide.
5. Scale original channel volume/expression by `🎹`; scale the guide channel by `🎤`.

For MusicXML, the built-in song, legacy cached local MIDI, or an engine/bank failure, the current WebAudioFont renderer remains unchanged.

## Hot Track Changes

Changing selected visual MIDI groups updates the accompaniment event filter and guide collection at the current position. It does not stop the animation loop or set `playing` to false. Voices already sounding may finish naturally; subsequent events use the new routing.

## Files and Build

- `package.json` and `package-lock.json`: pinned SpessaSynth/esbuild dependencies and `npm run build:audio`.
- `src/midi-audio-engine.js`: SoundFont loading, SpessaSynth worklet setup, event scheduling, seek-state reconstruction, volume routing, and fallback state.
- `src/build-audio.mjs`: bundles the browser module and copies the matching worklet.
- `audio/midi-audio-engine.min.js`: committed browser bundle.
- `audio/spessasynth_processor.min.js`: committed matching AudioWorklet.
- `soundfonts/GeneralUser-GS.sf2` or `.sf3`: bundled fallback bank.
- `soundfonts/GENERALUSER-LICENSE.txt`: upstream license and attribution.
- `index.html`: parser event retention, transport integration, settings UI, localization, and IndexedDB bank persistence.
- `README.md`: sound-engine usage, custom-bank instructions, licensing, and build command.

## Error Handling

- Invalid or unsupported bank: retain the previous working bank and show an error.
- IndexedDB/quota failure: keep the selected bank in memory for the current session.
- AudioWorklet or bundle failure: remain on WebAudioFont.
- Missing event data: use WebAudioFont for that song.
- High-quality bank still loading when Play is pressed: start immediately with WebAudioFont and use the high-quality engine on the next playback.
- A bank change while playing applies on the next Play; it never interrupts the current song.

## Manual Acceptance Checklist

The user will manually verify:

- selecting and persisting an extracted Timbres of Heaven SF2/SF3;
- fallback and reset to GeneralUser GS;
- correct original instruments, velocity, sustain, pan, pitch bend, and drums;
- separate `🎤` guide and `🎹` accompaniment volume;
- immediate Play before and after the bank is ready;
- pause, restart, seek, tempo, transpose, phrase loop, and song changes;
- track checkbox changes during active playback without pause;
- reload persistence and behavior when storage is unavailable;
- Chrome, Firefox, and a phone with representative heavy MIDI files.

## Out of Scope

- Distributing Timbres of Heaven or automating its download.
- Server-side audio rendering.
- Replacing the microphone pitch detector.
- MusicXML orchestration beyond its existing synthesized playback.
- Claiming production readiness before the user's manual acceptance pass.
