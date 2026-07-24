# Stable Note Status Layout Design

Date: 2026-07-24

## Goal

Stop the note-status block in the upper-left corner from shifting horizontally when the current, next, or detected note changes.

## Approved Layout

Replace the current horizontal flex layout and duplicated current-note display with a compact vertical grid:

```text
сейчас   Ми3
дальше   Соль3
пою      Ля3   −4¢
```

- The label column has a fixed width.
- Every note begins at the same horizontal position.
- Detected cents use a separate fixed-width column and do not move the note.
- The first two rows never move when microphone state changes.
- The `пою` row is hidden while the microphone is off and appears below the other rows while it is on.

## Content

The current row displays the complete localized note and octave once, for example `Ми3`. The existing duplicated `Ми` plus `Ми3` presentation is removed.

The rows are:

1. `сейчас` / `now`: current MIDI target, or `—` when no target is sounding;
2. `дальше` / `next`: next MIDI target, or `—` when none remains;
3. `пою` / `singing`: detected microphone note and cents.

Existing Russian and English translations are reused. No new user setting is needed.

## Styling

The status box remains absolutely positioned at the current upper-left location and retains its translucent background, border, radius, and z-index.

Its internal layout becomes an inline grid with three columns:

- fixed label column;
- fixed/minimum note column;
- fixed cents column.

Rows use a compact consistent line height. The current note keeps the warm accent color and slightly stronger weight. The next note keeps the cool accent color. The detected note retains the existing green/off-pitch states.

The desktop and narrow-screen rules may reduce font size and padding, but must not change column alignment or return to a horizontal flex layout.

## Behavior

`updNoteBox(q)` writes `noteFull()` directly into the current and next note cells. It no longer writes a short current name and a second full-name subtitle.

Microphone detection continues updating the detected note and cents independently. Showing or hiding the detected row must not change the position of the current or next rows.

Playback, pitch scoring, microphone timing, waterfall, contour, and keyboard behavior remain unchanged.

## Verification

A focused source regression test will verify:

- the status container uses grid rather than horizontal flex;
- the three rows use the approved order;
- current, next, and detected values occupy stable columns;
- cents have their own fixed slot;
- `updNoteBox()` uses `noteFull()` for the current note;
- the duplicate current-note subtitle is absent;
- the microphone row remains conditionally hidden.

The complete existing Node test suite and module-aware JavaScript syntax check must still pass. Manual browser verification will compare several short and long note names with the microphone off and on and confirm that row starts never move.

## Out of Scope

- Moving the status box to another corner.
- Changing note naming or octave conventions.
- Changing microphone detection, timing compensation, or scoring.
- Adding another settings option.
