# Sound Library Design

Date: 2026-07-23

## Goal

Move SoundFont management out of the settings drawer into a dedicated compact `🎛 Звуки` control. The control opens a sound-library panel where the user can compare, install, activate, remove, and import free MIDI instrument banks without disturbing playback.

The first version provides several useful choices while keeping Timbres of Heaven compliant with its distribution restriction.

## Approved Product Decisions

- `Звуки` is a separate top-row control next to the song and settings controls, not an item inside `⚙`.
- The panel is an overlay and does not consume permanent page height.
- Wide layouts show `🎛 Звуки`; narrow layouts keep the same button as a compact `🎛` icon.
- The library contains multiple free SoundFonts, not only Timbres of Heaven.
- The user performs listening and browser acceptance testing. Codex does not run the automated test suite or browser QA for this implementation.
- Installing or selecting a bank while a song is playing never pauses, seeks, or restarts the player. The selected bank is applied on the next playback start.

## Library Contents

### GeneralUser GS

- Already bundled as `audio/GeneralUser-GS.sf2`.
- Displayed as installed and available immediately.
- Remains the default and fallback bank.
- Its existing license and attribution remain in `audio/GeneralUser-GS-LICENSE.txt`.

### MuseScore General

- Add the official `MuseScore_General.sf3` release as an on-demand bundled asset.
- Add the matching upstream license and attribution.
- It is not read at page startup. The user explicitly presses `Установить`, sees download progress, and the bank is stored in IndexedDB.
- Once installed, it can be activated or removed.

### TimGM6mb

- Add the small GPL-2.0 General MIDI bank from the Debian soundfont package as a lightweight alternative.
- Add the matching license/copyright information.
- It follows the same explicit install, progress, IndexedDB, activate, and remove flow as MuseScore General.

### Timbres of Heaven 4.00(G)

- Display a catalog card with its approximate unpacked size, description, version, and `Бесплатно скачать` action.
- The action opens MidKar's official download.
- The panel explains that the downloaded `.7z` archive must be extracted and its `.sf2` imported.
- VocalAssist does not commit, mirror, proxy, or automatically fetch Timbres of Heaven because MidKar forbids redistribution without written permission.
- After import, the bank appears as the user's installed custom bank and can be activated or removed.

### Custom SoundFont

- `Добавить свой файл` accepts `.sf2`, `.sf3`, and `.dls`.
- Importing another custom file replaces the previous custom slot rather than creating an unlimited collection.
- The original filename and size are displayed.

## Interface

The compact top row gains:

```text
[▶] [⟲] [phrase] [🎙] [🎵 Songs] [🎛 Sounds] [⚙]
```

`🎛 Звуки` opens an overlay panel anchored to the control bar. It uses the same backdrop, elevation, responsive width, keyboard behavior, and visual language as the existing songs/settings overlays, but owns independent open/close state.

The panel contains:

- title and close button;
- a short line showing the active bank and engine state;
- vertically stacked bank cards;
- one primary action per state: `Установить`, `Использовать`, `Активен`, or `Скачать`;
- secondary `Удалить` action for installed non-default banks;
- download progress and localized status/error copy;
- custom-file import action.

Each card shows its name, concise sound/size description, license/source label, and current state. The active card has a visible accent border and `Активен` badge.

Only one of Songs, Sounds, or Settings may be open at a time. Escape, backdrop click, or the close button dismisses the active overlay and returns keyboard focus to the trigger.

The old SoundFont row and subview are removed from Settings so the feature has one entry point.

## Catalog Model

A small constant in `index.html` describes bundled options:

```js
{
  id: "musescore-general",
  name: "MuseScore General",
  url: "audio/MuseScore_General.sf3",
  size: 39900972,
  license: "MIT",
  storage: "install"
}
```

GeneralUser uses `storage: "builtin"`. TimGM6mb and MuseScore General use `storage: "install"`. Timbres of Heaven uses `storage: "external"` and an official download URL.

Catalog metadata is not duplicated inside the stored Blob record. The UI combines the catalog entry with current storage state.

## Persistence

Keep the existing `vocalassist.audio` IndexedDB database and `soundbanks` object store.

Records use these IDs:

- `active-bank`: selected catalog/custom bank ID;
- `bank:musescore-general`: installed MuseScore Blob and metadata;
- `bank:timgm6mb`: installed TimGM6mb Blob and metadata;
- `bank:custom`: imported custom Blob and metadata.

On first load after the update, the existing `{ id: "active" }` custom-bank record is migrated to `bank:custom`, selected as the active bank, and deleted only after the replacement records are committed successfully. If no previous custom bank exists, GeneralUser remains active.

Bundled install records contain the Blob so an installed bank remains available offline and the UI can distinguish `Установить` from `Использовать`. The application requests persistent browser storage after the first successful install.

## Download and Installation

For same-origin bundled banks:

1. Check `navigator.storage.estimate()` when available and warn before downloading if reported free quota is smaller than the advertised bank size.
2. Fetch the asset only after the user presses `Установить`.
3. Read its response stream and update card progress from `Content-Length`.
4. Build a Blob, save it to IndexedDB, and then mark it installed.
5. Activate it automatically unless a song is already playing; during playback, record it as selected and label it as applying on the next start.

One installation may run at a time. Closing the panel does not cancel the fetch. A failed or interrupted fetch leaves no partial database record and restores the install action.

External downloads open in a new browser tab and are never reported as installed until the user imports a supported bank file.

## Audio Integration

`preferredSoundBank()` resolves the active ID:

- GeneralUser: fetch the existing bundled default;
- installed catalog/custom bank: read its Blob from IndexedDB;
- missing or corrupt selection: reset to GeneralUser and show a localized warning.

Changing the selection calls the existing deferred reload path. While playback is active, `midiAudioNeedReload` is set but the current synthesizer and transport continue untouched. The next playback start prepares the selected bank. When playback is idle, the new bank may be prepared immediately.

If a newly selected bank cannot be parsed by SpessaSynth, GeneralUser remains available as fallback and the library card displays the failure.

## Error Handling

- Unsupported file extension: reject without replacing the existing custom bank.
- HTTP or streaming failure: discard partial data and show a retry action.
- IndexedDB or quota failure: retain the previously installed and active bank.
- Deleted active bank: select GeneralUser before deleting the Blob.
- Missing stored Blob: repair the active selection to GeneralUser.
- SpessaSynth parse failure: keep transport usable through the existing fallback path.
- Browser without streaming response support: use `response.blob()` and show an indeterminate progress state.

All user-facing strings are localized in Russian and English.

## Files

- `index.html`: Sounds trigger/panel, responsive styling, catalog state, download progress, IndexedDB migration, activation/removal, localization, and removal of the Settings SoundFont subview.
- `audio/MuseScore_General.sf3`: official MuseScore General bank.
- `audio/MuseScore-General-LICENSE.md`: upstream license and attribution.
- `audio/TimGM6mb.sf2`: lightweight GM bank.
- `audio/TimGM6mb-COPYRIGHT.txt`: upstream Debian copyright/license information.
- `README.md`: sound-library usage, storage behavior, sources, and Timbres of Heaven import instructions.

No MIDI engine rebuild is required.

## Static Verification and Manual Acceptance

Codex will perform only non-runtime verification requested for this change:

- inspect the final diff and staged file list;
- verify JavaScript syntax without opening the application;
- verify downloaded asset sizes and checksums against the fetched files;
- verify local `HEAD` and `origin/main` after publishing.

The user will manually verify:

- compact desktop and mobile placement;
- opening and closing the Sounds overlay;
- installation progress and persistence;
- activating every bundled option;
- external Timbres download and import;
- removal and GeneralUser fallback;
- reload persistence;
- switching or installing during playback without interruption;
- actual audio quality.

## Out of Scope

- Redistributing or proxying Timbres of Heaven.
- Extracting `.7z`, `.zip`, or `.rar` archives in the browser.
- Hosting a paid backend or object-storage service.
- Maintaining multiple arbitrary custom imports.
- Changing the MIDI synthesizer, microphone detector, visualization, or track-selection behavior.
