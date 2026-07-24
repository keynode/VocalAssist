# Compact View Toggle Icons Design

## Goal

Make the microphone, waterfall, and contour controls easy to reach without
using valuable settings space. Clarify the settings label for the control that
shifts the vocal melody by whole octaves, and make karaoke lyrics easier to
read.

## Chosen Interface

The top control bar contains one compact group of three icon-only toggle
buttons, placed where the microphone control currently appears:

1. `🎙` microphone;
2. `⬇` waterfall;
3. `📈` contour.

All three buttons use the same shape and interaction language. They are
slightly larger than the current 36-pixel icon buttons so they remain easy to
hit on desktop and narrow screens. The existing `on` style remains the single
visual indication that a toggle is active.

Each button has a localized tooltip and accessible name. The emoji are hidden
from assistive technology so the accessible name is spoken only once.

## Settings Changes

The waterfall and contour buttons move out of the settings popover completely.
There are no duplicate controls and the existing element IDs remain attached
to the top buttons, so stored preferences and toggle behavior remain unchanged.

The Russian `Октава` label becomes `Высота мелодии`. The English label becomes
`Melody pitch`. The control continues to shift only the vocal melody in whole
octaves; no pitch or playback logic changes.

The phrase-repeat button and its `L` keyboard shortcut are removed. No hidden
repeat control remains.

The remaining settings are grouped into three compact, localized sections:

1. `Мелодия` / `Melody`: legato, tempo, key, melody pitch, MIDI tracks, and
   opening a notation file;
2. `Звук и микрофон` / `Sound & microphone`: guide and accompaniment volume,
   detector selection, and microphone synchronization;
3. `Интерфейс` / `Interface`: lyrics, note naming, and language.

The existing collapsible Help row stays below these sections.

## Layout

The three view controls are wrapped in a dedicated compact group. This keeps
their relationship clear and prevents each icon from looking like an unrelated
action. The group remains fixed-width and does not consume the flexible space
used by the song control.

At narrow widths, the same icon-only presentation is retained. The buttons may
reduce slightly with the existing smallest breakpoint but remain larger than
the previous microphone icon. At `360px` and below the redundant Restart button
is hidden to prevent control-bar overflow; the `R` keyboard shortcut remains
available.

The karaoke lyric overlay uses a responsive `17px` to `20px` font on wider
screens and `16px` on narrow screens, replacing the current `15px` and `13px`
sizes. Its syllable-fill backgrounds, current/done/soon colors, held-note
dashes, bouncing ball, text shadows, positioning, and update logic remain
unchanged.

## Behavior and State

Existing behavior remains authoritative:

- microphone calls `micToggle`;
- waterfall calls `setWfView`;
- contour calls `setHView`;
- local-storage preferences continue to restore waterfall and contour state;
- the existing `on` class continues to track active state.

Changing the visual control location must not stop playback, reset a song,
change the selected MIDI tracks, or open/close the settings popover.

## Accessibility

Localized `title` and `aria-label` values are applied from the existing
translation dictionary during `applyLang()`. Buttons remain native `button`
elements and preserve keyboard activation and focus indication.

## Verification

Automated source checks cover:

- one top toggle group containing the three controls in order;
- no waterfall or contour control inside the settings body;
- shared enlarged icon-button styling at desktop and narrow widths;
- localized tooltips and accessible names;
- the clearer Russian and English melody-height labels;
- localized semantic settings sections;
- removal of the repeat button and `L` shortcut;
- larger desktop and narrow-screen lyric font sizes;
- unchanged lyric effect selectors and update logic;
- unchanged waterfall drawing code.

The complete Node test suite and module-aware inline-script syntax checks must
continue to pass.

## Alternatives Considered

Keeping duplicate view controls in settings would preserve the old location,
but it introduces redundant controls and wastes the space the change is meant
to recover.

Placing three unrelated icon buttons directly in the bar is marginally simpler,
but a shared group communicates that they all control the visualization.

The grouped, top-only option is therefore selected.

## Out of Scope

- Changing the microphone point, beam, trace, or waterfall timing.
- Changing waterfall or contour rendering.
- Changing microphone capture or detection.
- Changing the octave-shift behavior or stored preference format.
- Changing lyric timing, effects, colors, or animation.
