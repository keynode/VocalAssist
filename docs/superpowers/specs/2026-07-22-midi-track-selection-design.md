# MIDI Track Selection Design

Date: 2026-07-22

## Goal

Allow the user to override VocalAssist's automatically detected MIDI vocal track when it chooses the wrong melody. The user can select one or several MIDI track/channel groups for visualization and microphone scoring, reset the song to automatic detection, and have the browser remember the manual choice per song.

The existing automatic result remains unchanged unless the user explicitly saves a manual selection.

## User Experience

### Entry point

For MIDI songs, the main settings popover contains a full-width row button:

- Russian: `🎼 MIDI-дорожки · Авто`
- English: `🎼 MIDI tracks · Auto`

When a manual override exists, the suffix shows the number of selected groups instead of `Auto`, for example `2 выбрано` / `2 selected`.

The button is hidden for MusicXML songs and for any source without MIDI group metadata.

### Selector view

Activating the row replaces the contents of the existing compact settings popover with a dedicated track-selection subview. It does not expand a long list inside the main settings screen and does not open a separate modal.

The subview contains:

- a back button;
- the localized `MIDI tracks` title;
- current state: `Auto` or the selected-group count;
- an `Automatic detection` / reset action;
- a vertically scrollable list of selectable track groups.

Returning with the back button restores focus to the `MIDI tracks` row in the main settings view. The popover remains non-modal and keeps its existing compact width.

### Track rows

The selection unit is the parser's existing combination of Standard MIDI File track and MIDI channel. Its stable key is `${trackIndex}:${channelIndex}`. This is necessary because a single MIDI track can contain events from multiple channels.

Every selectable row is a checkbox and shows:

- the MIDI track name, or localized fallback `Track N` / `Дорожка N`;
- the one-based MIDI channel number;
- the localized program label and one-based program number, for example `Program 54` / `Программа 54`;
- note count;
- pitch range;
- an `Auto` badge on the automatically selected group while automatic mode is active.

MIDI channel 10 (`channelIndex === 9`) and groups without usable notes are excluded from the list.

### Automatic mode

Automatic mode is represented by the absence of a saved `midiTracks` preference. In this mode, the existing `splitMidiSong` scoring algorithm chooses the vocal group exactly as it does today. The automatically chosen group is displayed as checked and marked `Auto` in the selector.

The `Automatic detection` action deletes the manual preference rather than persisting the currently computed automatic result.

### Manual mode

Changing any checkbox creates a manual selection. One or several groups may be selected.

At least one group must remain selected in manual mode. The final checked group cannot be unchecked; the separate `Automatic detection` action is the clear way to leave manual mode. On entering from automatic mode, checking another group keeps the automatic group selected so the user can build a multi-track choice; the automatic group can then be unchecked after another group is selected.

All selected groups become the vocal layer:

- their notes are visualized and used as microphone-scoring targets;
- they play through the existing microphone/vocal volume control (`🎤`);
- all unselected non-percussion groups become accompaniment and play through the accompaniment volume control (`🎹`).

Changing the selection while playback is active pauses at the current position, rebuilds the vocal and accompaniment layers, and preserves that timeline position instead of restarting the song. The contour, waterfall, phrases, lyrics, ticks, keyboard range, and audio routing are refreshed immediately.

## MIDI Data Model

### Parsed song representation

The MIDI parser continues to group notes by `trackIndex:channelIndex`, but parsed song data must retain enough metadata to rebuild the vocal/accompaniment split without reparsing the original file:

```js
{
  midiGroups: [
    {
      key: "0:1",
      tr: 0,
      ch: 1,
      name: "Lead Vocal",
      prog: 53,
      notes: [/* normalized MIDI notes */]
    }
  ],
  midiAutoKey: "0:1",
  // Existing tempo, lyrics, and song fields.
}
```

The implementation retains these property names to match the existing `tr`, `ch`, and `prog` parser fields. The display computes note count and pitch range from `notes`; they are not duplicated in storage.

Both repository and local-upload song cache entries store this compact group representation. Repository parse-cache version `PARSE_V` is incremented so older cached entries are reparsed instead of being treated as compatible.

MusicXML continues through its current code path and does not receive MIDI group metadata or a selector.

### Per-song preference

The manual selection is stored in the existing browser preference object:

```js
LIB.prefs[curSongId].midiTracks = ["0:1", "2:0"];
```

Deleting `midiTracks` means automatic mode. This works identically for repository songs and locally uploaded MIDI songs, using their existing stable song IDs.

When a MIDI song is reopened, saved keys are validated against the groups currently available in that song:

- if all keys are valid, restore them;
- if only some keys are valid, retain the valid subset and rewrite the preference;
- if none are valid, delete the override, fall back to automatic detection, and show a localized toast explaining that the saved track selection is no longer available.

## Note Rendering, Phrases, and Scoring

The current automatic path is monophonic and collapses same-onset notes. That behavior must remain unchanged in automatic mode to avoid changing existing song results.

Manual multi-selection must preserve every note from every selected group, including simultaneous notes. The implementation therefore distinguishes:

- the complete visual/scoring target-note collection, which may be polyphonic;
- the phrase/timeline representation used for navigation, lyrics, and progress display.

Manual-mode phrases are derived from the merged selected notes in onset order. Notes with the same onset belong to one onset group. Phrase-gap detection runs between consecutive onset groups using the existing tempo-dependent threshold and the maximum end time of the preceding group. Overlapping notes must not be discarded merely to force a monophonic sequence, and every selected note remains available to the contour/waterfall renderer and hit detector.

When several selected target notes are active at the current time, microphone scoring compares the detected pitch with all active targets and uses the nearest pitch, measured by the smallest absolute semitone distance. The result is one hit/miss decision for that scoring instant; simultaneous notes do not multiply the score.

## State and Update Flow

1. Parse MIDI into track/channel groups and compute the existing automatic choice.
2. Load and validate the current song's `midiTracks` preference.
3. Build vocal and accompaniment layers from the automatic choice or validated manual keys.
4. Apply the song and render the selector state from the same source of truth.
5. On checkbox change, persist the keys, pause if needed, rebuild derived song state, and restore the current playback time.
6. On reset, delete the preference and rebuild through the unchanged automatic path.

The rebuilding operation is centralized so initial song loading, manual changes, reset, and stale-preference recovery cannot produce different splits from the same selection.

## Localization and Accessibility

Add Russian and English strings for:

- MIDI tracks;
- track fallback name;
- channel and instrument/program labels;
- automatic mode and automatic badge;
- automatic-detection reset;
- selected-group count;
- unavailable saved-selection fallback toast.

The back button, reset action, and every checkbox are keyboard accessible. Track selection uses native checkbox inputs with associated localized labels. Buttons receive localized accessible names, and focus returns to the settings row after leaving the selector.

## Error Handling

- Show the selector only for parsed MIDI songs with usable non-percussion groups.
- Exclude empty, invalid, and percussion-only groups.
- If the MIDI file has no usable non-percussion notes, retain the existing MIDI-open error behavior.
- A malformed or stale stored preference must never prevent a song from opening.

## Testing Strategy

Implementation follows test-driven development: add a focused failing test before changing production behavior, confirm the expected failure, then implement the smallest complete change.

Automated coverage includes:

- structural/source tests for the settings subview, localization, visibility rules, and accessibility hooks;
- parser/split tests using a small synthetic or repository fixture MIDI proving that automatic output is unchanged;
- preservation of multiple manually selected groups and simultaneous notes;
- correct selected-vocal versus unselected-accompaniment split;
- nearest-active-note pitch scoring;
- exclusion of MIDI channel 10;
- saving and restoring per-song selections;
- reset deleting `midiTracks` and returning to automatic mode;
- partial and fully stale key recovery;
- local-upload and repository-cache metadata retention.

Existing regression tests remain green:

```text
node tests/full-width-contour.test.js
node tests/settings-help.test.js
node tests/mic-latency.test.js
```

Browser QA is performed at desktop and narrow viewport sizes:

1. Open a MIDI song and enter the selector.
2. Select multiple groups and confirm simultaneous notes render.
3. Start playback, change the selection, and confirm playback pauses without losing position.
4. Resume and confirm vocal/accompaniment volume routing and microphone scoring.
5. Reset to automatic mode.
6. Save a manual selection, reopen the song, and confirm restoration.
7. Confirm MusicXML has no selector and the console contains no new errors.

## Alternatives Considered

### Inline expandable list

Putting the checkboxes in a `<details>` element on the main settings screen is the simplest implementation, but songs with many track/channel groups would make the compact settings popover excessively tall.

### Separate modal

A modal offers more room, but interrupts the song workflow, adds another overlay layer, and conflicts with the existing compact-control direction.

### Chosen: same-popover subview

A dedicated subview inside the existing settings popover keeps the main controls compact, handles long lists with scrolling, and preserves the user's context. Its only meaningful cost is a small amount of additional view/focus state.

## Out of Scope

- Per-track colors.
- Independent solo/mute controls beyond vocal versus accompaniment assignment.
- Track reordering.
- Server-side or cross-browser preference synchronization.
- MusicXML part selection.
- Separate "primary scoring target" and "display-only" selected tracks.

## Acceptance Criteria

- Existing MIDI songs behave exactly as before while no manual override is saved.
- The settings popover offers a compact MIDI-only track selector subview.
- The user can select one or several valid track/channel groups and cannot leave manual mode with zero groups.
- Every selected note is rendered; simultaneous active targets score against the nearest pitch.
- Selection changes preserve playback position and correctly rebuild all derived views and audio layers.
- The selection persists per song in the current browser and reset cleanly restores automatic detection.
- Stale preferences recover safely.
- MusicXML behavior and existing compact settings behavior remain unchanged.
- Automated tests and browser QA pass without new console errors.
