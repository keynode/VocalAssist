# Sound Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated responsive `🎛 Звуки` library with several free MIDI banks, persistent installation/selection, custom import, and uninterrupted active playback.

**Architecture:** Keep the existing single-page structure and SpessaSynth wrapper. Replace the Settings SoundFont subview with an independent overlay driven by a static catalog; use the existing IndexedDB object store for installed Blobs and the selected-bank record. GeneralUser stays built in, MuseScore General and TimGM6mb are same-origin on-demand installs, and Timbres of Heaven remains an official external download plus custom import.

**Tech Stack:** Static HTML/CSS/JavaScript, IndexedDB, Fetch streaming, SpessaSynth 4.3.11, GitHub Pages assets.

## Global Constraints

- Work directly on `main`, as explicitly requested by the user.
- Do not run the automated test suite or browser QA; the user performs runtime acceptance.
- Do not interrupt playback when installing or selecting a bank.
- Do not redistribute, proxy, or extract Timbres of Heaven.
- Preserve Russian and English localization.
- Publish all completed commits to `origin/main`.

---

### Task 1: Add Licensed Free Sound Banks

**Files:**
- Create: `audio/MuseScore_General.sf3`
- Create: `audio/MuseScore-General-LICENSE.md`
- Create: `audio/TimGM6mb.sf2`
- Create: `audio/TimGM6mb-COPYRIGHT.txt`
- Create: `audio/TimGM6mb-GPL-2.0.txt`

**Interfaces:**
- Consumes: Official MuseScore and Debian source assets.
- Produces: Same-origin catalog URLs `audio/MuseScore_General.sf3` and `audio/TimGM6mb.sf2`.

- [x] **Step 1: Download the exact upstream assets**

```powershell
Invoke-WebRequest https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/MuseScore_General.sf3 -OutFile audio/MuseScore_General.sf3
Invoke-WebRequest https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/MuseScore_General_License.md -OutFile audio/MuseScore-General-LICENSE.md
$tmp = Join-Path $env:TEMP 'vocalassist-timgm6mb'
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
$deb = Join-Path $tmp 'timgm6mb-soundfont_1.3-5_all.deb'
Invoke-WebRequest https://deb.debian.org/debian/pool/main/t/timgm6mb-soundfont/timgm6mb-soundfont_1.3-5_all.deb -OutFile $deb
$hash = (Get-FileHash $deb -Algorithm SHA256).Hash.ToLowerInvariant()
if ($hash -ne '034abdfb296d9353433513dad5dbdcab46425ee6008fc02fe7039b46e75edc54') { throw "Unexpected Debian hash: $hash" }
Push-Location $tmp
tar -xf $deb
tar -xf data.tar.xz
Pop-Location
Copy-Item (Join-Path $tmp 'usr/share/sounds/sf2/TimGM6mb.sf2') audio/TimGM6mb.sf2
Copy-Item (Join-Path $tmp 'usr/share/doc/timgm6mb-soundfont/copyright') audio/TimGM6mb-COPYRIGHT.txt
Invoke-WebRequest https://www.gnu.org/licenses/old-licenses/gpl-2.0.txt -OutFile audio/TimGM6mb-GPL-2.0.txt
```

- [x] **Step 2: Record sizes and hashes**

Run:

```powershell
Get-Item audio/MuseScore_General.sf3,audio/TimGM6mb.sf2 | Select-Object Name,Length
Get-FileHash audio/MuseScore_General.sf3,audio/TimGM6mb.sf2 -Algorithm SHA256
```

Expected sizes: `39,900,972` bytes and `5,969,788` bytes.

### Task 2: Expand Sound-Bank Persistence

**Files:**
- Modify: `index.html` audio persistence block

**Interfaces:**
- Consumes: Existing database `vocalassist.audio`, store `soundbanks`, and legacy record `active`.
- Produces:
  - `readSoundBankRecord(id): Promise<object|null>`
  - `writeSoundBankRecord(record): Promise<void>`
  - `deleteSoundBankRecord(id): Promise<void>`
  - `loadSoundLibraryState(): Promise<void>`
  - `selectSoundBank(id): Promise<void>`
  - `installCatalogSoundBank(id): Promise<void>`

- [x] **Step 1: Define the catalog and active state**

Add catalog entries with IDs `generaluser`, `musescore-general`, `timgm6mb`, and `timbres-heaven`. Use `builtin`, `install`, and `external` storage modes. Initialize `activeSoundBankId` to `generaluser`, `installedSoundBanks` as a `Map`, and `soundInstallState` as `null`.

- [x] **Step 2: Generalize IndexedDB record helpers**

Replace the single `active` record helpers with key-based read/write/delete functions. Store the selected ID in:

```js
{id:'active-bank',bankId:'musescore-general',updated:Date.now()}
```

Store an installed bank as:

```js
{id:'bank:musescore-general',bankId:'musescore-general',name, size, type, updated:Date.now(), blob}
```

- [x] **Step 3: Migrate the legacy custom bank**

If `active-bank` is absent and the legacy `active` record contains a Blob, write it to `bank:custom`, write `active-bank` with `bankId:'custom'`, then delete `active`. Never delete the legacy record until both writes complete.

- [x] **Step 4: Implement streaming installation**

Fetch only same-origin `install` entries, read `response.body.getReader()` when available, update `{id, loaded, total}`, construct a Blob, store it, and select the bank. On failure, leave no partial record and expose a localized retry state.

- [x] **Step 5: Resolve the active bank**

Make `preferredSoundBank()` return GeneralUser from its URL or an installed/custom Blob. If the selected record is missing, restore `generaluser` and persist that repair.

### Task 3: Build the Independent Sounds Overlay

**Files:**
- Modify: `index.html` styles, control bar markup, localization, rendering, event handlers, and keyboard handling

**Interfaces:**
- Consumes: `SOUND_BANK_CATALOG`, installed bank map, active ID, install progress, existing `requestMidiAudioReload()`.
- Produces:
  - `renderSoundLibrary(): void`
  - `setSoundsOpen(open, returnFocus): void`
  - `activateSoundBank(id): Promise<void>`
  - `removeSoundBank(id): Promise<void>`

- [x] **Step 1: Add the trigger and overlay**

Place `soundsBtn` between `songsBtn` and `moreBtn`. Add `soundsBackdrop`, `soundsPanel`, header, active-state line, card list, custom import button, and hidden `.sf2/.sf3/.dls` input.

- [x] **Step 2: Add responsive card styling**

Use the existing panel tokens and mobile 38-pixel control sizing. Add active-card accent, status badge, progress bar, card actions, and scrolling bounded by `100dvh`.

- [x] **Step 3: Render catalog states**

For every catalog entry render localized name/description, size, source/license, and the correct action:

```text
builtin active     -> Активен
builtin inactive   -> Использовать
install absent     -> Установить
install present    -> Использовать / Удалить
external           -> Бесплатно скачать
```

Render the `custom` card when a custom Blob exists and always render `Добавить свой файл`.

- [x] **Step 4: Wire selection and removal**

Selection persists `active-bank`, updates card state, and calls `requestMidiAudioReload()`. Removal first switches an active bank to GeneralUser, then deletes its Blob. While `playing` is true, only mark the engine for deferred reload.

- [x] **Step 5: Make overlays mutually exclusive**

Opening Sounds closes Songs and Settings. Opening Songs or Settings closes Sounds. Escape, backdrop, and close button return focus to `soundsBtn`.

- [x] **Step 6: Remove the old Settings SoundFont subview**

Delete `soundBankBtn`, `soundBankView`, its styles, handlers, and Settings Escape branch. Keep shared audio state copy only where the new panel uses it.

### Task 4: Document and Publish

**Files:**
- Modify: `README.md`
- Modify: `audio/README.md`
- Modify: `docs/superpowers/plans/2026-07-23-sound-library.md`

**Interfaces:**
- Consumes: Completed library behavior.
- Produces: User-facing source/license/storage instructions and published `main`.

- [x] **Step 1: Document the library**

Describe the Sounds button, bundled banks, IndexedDB storage, custom import, official Timbres extraction flow, and the fact that selection during playback applies at the next start.

- [x] **Step 2: Perform static verification**

Run `git diff --check`, extract the inline script into a temporary `.js` file and run `node --check`, confirm asset sizes/hashes, and inspect `git diff --stat`. Do not run `npm test`, a browser, or audio playback.

- [x] **Step 3: Commit implementation**

Stage only the plan, `index.html`, `README.md`, and the four audio assets. Commit with:

```powershell
git commit -m "Добавить библиотеку SoundFont"
```

- [x] **Step 4: Publish and prove parity**

```powershell
git push origin main
git fetch origin main
git rev-parse HEAD
git rev-parse origin/main
git status --short
```

Expected: both SHAs match and the working tree is clean.
