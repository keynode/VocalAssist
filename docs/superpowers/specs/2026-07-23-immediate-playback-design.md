# Immediate Playback and Live MIDI Track Switching Design

Date: 2026-07-23

## Goal

Start singing playback immediately when the user presses Play or Space, and keep an already playing song running while its visualized MIDI tracks are changed.

## Approved Behavior

- Play and Space start at the current timeline position immediately.
- No visual `4-3-2-1` overlay, metronome clicks, or hidden four-beat transport offset remains.
- Help text describes immediate start and no longer promises a count-in.
- Selecting or resetting MIDI visualization tracks while a song is playing keeps `playing === true`, keeps the same animation loop, and continues advancing from the current timeline position.
- The rebuilt contour, waterfall, phrase markers, lyrics, keyboard range, scoring targets, and future vocal/accompaniment note scheduling take effect immediately.
- Web Audio voices that were already started may finish naturally, avoiding an abrupt audio cut.
- Opening a different song, pressing Pause, Restart, or seeking retains its existing transport semantics.

## Implementation

The transport owns a single current position pair: `startQ` and `startAcTime`. `play()` initializes that pair without subtracting beats and starts the existing animation loop. The count-in DOM, styles, click synthesizer, countdown branch, and `startQ0Play` compatibility state are removed.

`applyMidiTrackSelection()` captures the live quarter-note position before rebuilding derived MIDI layers. If the transport was active, it re-anchors `startQ` and `startAcTime` at that bounded position, refreshes indices and rendered state, but never calls `pause()`, `stopSound()`, or schedules a second animation frame. If stopped, it continues to use the normal `setPos()` path.

## Edge Cases

- If rebuilding shortens the song, the preserved position is clamped to the new duration.
- Track changes at an exact note boundary must not replay an already scheduled onset; indices resume strictly after the captured time.
- Resetting to automatic MIDI detection follows the same live-switch path.
- A full song change may still pause because it replaces the complete song and its transport context.

## Verification

- A focused source regression test proves the count-in UI, timer, click synthesis, and delayed start are absent.
- The MIDI selector regression test proves its live update path has no pause, preserves the playing state, re-anchors time, and refreshes playback indices without creating another animation loop.
- The complete Node test suite and JavaScript syntax check pass.
- Browser QA starts playback and observes immediate timeline movement, then changes a MIDI checkbox and confirms the Play button remains in Pause state while the timeline continues advancing with no console errors.

## Acceptance Criteria

- Playback starts immediately from the selected position.
- No count-in is visible or audible.
- Changing visualized MIDI tracks does not pause, restart, or freeze active playback.
- The track selection remains persisted and rebuilt views update as before.
- Existing Pause, Restart, seek, song-change, and automatic MIDI-selection behavior remains intact.
