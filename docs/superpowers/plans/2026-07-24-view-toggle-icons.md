# Compact View Controls and Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move microphone, waterfall, and contour into a compact top icon group, reorganize settings into clear sections, rename the vocal octave control, remove phrase repeat, and enlarge karaoke lyrics without changing visualization or lyric effects.

**Architecture:** Keep the existing single-file application and handlers. Restructure only the control-bar and settings DOM, add localized labels through the existing `T` dictionaries and `applyLang()`, and remove the now-unreachable phrase-loop state. A focused structural test protects layout, accessibility, localization, loop removal, and the waterfall-rendering boundary.

**Tech Stack:** HTML, CSS, browser JavaScript, Node.js `assert` source tests.

## Global Constraints

- The microphone point, beam, trace, waterfall timing, and contour rendering must not change.
- `wfBtn`, `hvBtn`, and `micBtn` keep their existing IDs and handlers.
- The settings popover remains compact, anchored, non-modal, and usable at narrow widths.
- Karaoke lyric timing, effects, colors, and animation must not change.
- No new dependency or build step is introduced.
- Completed work is committed and pushed directly to `main`.

---

### Task 1: Focused layout and scope test

**Files:**
- Create: `tests/view-controls-settings.test.js`
- Read: `index.html`

**Interfaces:**
- Consumes: the static HTML, CSS, translation dictionaries, and inline handlers in `index.html`.
- Produces: a regression test that defines the required top control group, settings sections, labels, repeat removal, and unchanged waterfall boundary.

- [ ] **Step 1: Write the failing structural test**

Create `tests/view-controls-settings.test.js`:

```js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const style = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] || '';
const barStart = html.indexOf('<div class="bar" id="controlBar">');
const settingsStart = html.indexOf('<div class="more-body" id="settingsMain">', barStart);
const settingsEnd = html.indexOf('<div id="midiTracksView"', settingsStart);
const topHtml = html.slice(barStart, settingsStart);
const settingsHtml = html.slice(settingsStart, settingsEnd);

const group = topHtml.match(/<div class="view-toggles"[\s\S]*?<\/div>/)?.[0] || '';
assert(group, 'top view toggle group must exist');
assert(group.indexOf('id="micBtn"') < group.indexOf('id="wfBtn"'));
assert(group.indexOf('id="wfBtn"') < group.indexOf('id="hvBtn"'));
for (const id of ['micBtn', 'wfBtn', 'hvBtn']) {
  assert.strictEqual((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1);
  assert(group.includes(`id="${id}"`), `${id} must be in the top group`);
}
assert(!settingsHtml.includes('id="wfBtn"'));
assert(!settingsHtml.includes('id="hvBtn"'));
assert(/\.view-toggle\s*\{[^}]*width\s*:\s*42px[^}]*height\s*:\s*42px/.test(style));
assert(
  /@media\s*\(max-width:360px\)[\s\S]*?#restart\s*\{[^}]*display\s*:\s*none/.test(style),
  'the smallest layout must hide restart instead of overflowing the control bar',
);

for (const id of ['settingsMelody', 'settingsAudio', 'settingsInterface']) {
  assert(settingsHtml.includes(`data-i18n="${id}"`), `${id} heading must exist`);
}
assert(html.includes("voct:'Высота мелодии'"));
assert(html.includes("voct:'Melody pitch'"));
assert(!html.includes('id="phLoop"'));
assert(!html.includes("e.code==='KeyL'"));
assert(!html.includes('loopPhrase'));

const applyLangStart = html.indexOf('function applyLang()');
const applyLangEnd = html.indexOf('let VOCAL=', applyLangStart);
const applyLang = html.slice(applyLangStart, applyLangEnd);
for (const id of ['viewToggles', 'micBtn', 'wfBtn', 'hvBtn']) {
  assert(applyLang.includes(`$('${id}')`), `${id} localization must be applied`);
}

const drawPitch = html.slice(
  html.indexOf('function drawPitch()'),
  html.indexOf('async function micToggle', html.indexOf('function drawPitch()')),
);
assert(drawPitch.includes('const lineY=H-NOWLINE*d, pxq=lineY/LOOK;'));
assert(drawPitch.includes('ctx.fillRect(x-1.5*d,0,3*d,lineY);'));
assert(/#lyrics\s*\{[^}]*font-size\s*:\s*clamp\(17px,\s*1\.3vw,\s*20px\)/.test(style));
assert(/@media\s*\(max-width:760px\)[\s\S]*?#lyrics\s*\{[^}]*font-size\s*:\s*16px/.test(style));
for (const selector of ['#lyrics .done', '#lyrics .cur', '#lyrics .soon', '#lyrics .hold', '#lyrBall']) {
  assert(style.includes(selector), `${selector} effect must remain`);
}

console.log('view controls and settings checks passed');
```

- [ ] **Step 2: Run the test and verify the old UI fails**

Run:

```powershell
node tests/view-controls-settings.test.js
```

Expected: FAIL with `top view toggle group must exist`.

---

### Task 2: Compact top visualization controls

**Files:**
- Modify: `index.html:43-67`
- Modify: `index.html:305-335`
- Modify: `index.html:354-386`
- Modify: `index.html:633-651`
- Test: `tests/view-controls-settings.test.js`

**Interfaces:**
- Consumes: `micToggle()`, `setWfView(on)`, `setHView(on)`, the existing `tgl on` state convention, and translation helper `t(key)`.
- Produces: `#viewToggles` containing `#micBtn`, `#wfBtn`, and `#hvBtn` as icon-only native buttons with localized names.

- [ ] **Step 1: Add shared top-group styling**

Add beside the existing `.grp` styles:

```css
.view-toggles{display:flex;gap:2px;align-items:center;background:var(--panel2);
  border:1px solid var(--line);border-radius:999px;padding:3px}
.view-toggle{width:42px;height:42px;padding:0;display:grid;place-items:center;
  border:none;border-radius:999px;background:transparent;font-size:19px}
```

Update the narrow breakpoint so `.view-toggle` remains icon-only and uses
`40px` square buttons, with `36px` square buttons only below `360px`. At that
smallest breakpoint hide `#restart`, keep its `R` keyboard shortcut, remove
padding from `.view-toggles`, and use a `3px` bar gap so the row does not
overflow.

- [ ] **Step 2: Move the three buttons into the top group**

Replace the text microphone button and settings copies with:

```html
<div id="viewToggles" class="view-toggles" role="group">
  <button id="micBtn" class="tgl view-toggle" type="button"><span aria-hidden="true">🎙</span></button>
  <button id="wfBtn" class="tgl view-toggle on" type="button"><span aria-hidden="true">⬇</span></button>
  <button id="hvBtn" class="tgl view-toggle" type="button"><span aria-hidden="true">📈</span></button>
</div>
```

Do not modify `setWfView`, `setHView`, `drawPitch`, or their click handlers.

- [ ] **Step 3: Localize tooltips and accessible names**

Add `views:'Визуализация'` and `views:'Visualization'` to the translation
dictionaries. In `applyLang()` apply the group and button names:

```js
$('viewToggles').setAttribute('aria-label',t('views'));
for(const [id,key] of [['micBtn','mic'],['wfBtn','wf'],['hvBtn','hv']]){
  $(id).title=t(key);
  $(id).setAttribute('aria-label',t(key));
}
```

- [ ] **Step 4: Run the focused test**

Run:

```powershell
node tests/view-controls-settings.test.js
```

Expected: still FAIL because settings sections and phrase-loop removal are not complete, but all top-group assertions pass.

---

### Task 3: Group settings, remove phrase repeat, and enlarge lyrics

**Files:**
- Modify: `index.html:263-303`
- Modify: `index.html:376-427`
- Modify: `index.html:534-611`
- Modify: `index.html:1140-1359`
- Modify: `index.html:233-252`
- Modify: `index.html:2055-2115`
- Modify: `index.html:2864-2888`
- Test: `tests/view-controls-settings.test.js`

**Interfaces:**
- Consumes: existing settings control IDs and their handlers.
- Produces: localized `.settings-group` sections and the renamed `voct` label; removes `phLoop`, `loopPhrase`, `loopP`, and the `KeyL` handler; enlarges lyrics without changing their effects.

- [ ] **Step 1: Replace the flat settings grid with grouped sections**

Keep every surviving control ID and arrange the controls as:

```html
<div class="settings">
  <section class="settings-group">
    <h3 data-i18n="settingsMelody">Мелодия</h3>
    <div class="settings-group-body">
      <button id="legato" class="tgl on" data-i18n="legato">легато</button>
      <button id="fileBtn" class="settings-action-wide" data-i18n="files">📂 ноты</button>
      <div class="slider"><span data-i18n="tempo">Темп</span> <input id="tempo" type="range" min="40" max="220" value="100"><span class="val" id="tempoVal">100</span></div>
      <div class="slider"><span data-i18n="key">Тон</span>
        <span class="grp step">
          <button id="trDown" title="−1">−</button>
          <span class="val" id="transpVal">0</span>
          <button id="trUp" title="+1">+</button>
        </span>
      </div>
      <div class="slider"><span data-i18n="voct">Высота мелодии</span>
        <span class="grp step">
          <button id="ocDown" title="−1">−</button>
          <span class="val" id="voctVal">0</span>
          <button id="ocUp" title="+1">+</button>
        </span>
      </div>
      <button id="midiTracksBtn" class="midi-tracks-entry settings-wide" aria-controls="midiTracksView" hidden>🎼 MIDI-дорожки · Авто</button>
    </div>
  </section>
  <section class="settings-group">
    <h3 data-i18n="settingsAudio">Звук и микрофон</h3>
    <div class="settings-group-body">
      <div class="slider">
        <span><span aria-hidden="true">🎤</span> <span data-i18n="guideVolume">Мелодия</span></span>
        <input id="vol" type="range" min="0" max="100" value="60">
      </div>
      <div class="slider">
        <span><span aria-hidden="true">🎹</span> <span data-i18n="accompanimentVolume">Аккомпанемент</span></span>
        <input id="accVol" type="range" min="0" max="100" value="45">
      </div>
      <button id="engBtn" class="settings-wide" title="Детектор высоты: SwiftF0 (нейросеть) / MPM (классика)">🧠 SwiftF0</button>
      <div class="mic-sync">
        <div class="mic-sync-head">
          <span data-i18n="micSync">Синхронизация микрофона</span>
          <span id="micSyncAuto">Авто</span>
        </div>
        <div class="mic-sync-adjust">
          <span id="micSyncFineLabel" data-i18n="micSyncFine">Доп. поправка</span>
          <input id="micSyncFine" type="range" min="-250" max="400" step="5" value="0" aria-labelledby="micSyncFineLabel">
          <output id="micSyncFineVal">0 мс</output>
          <button id="micSyncReset" type="button" data-i18n="micSyncReset">Сбросить</button>
        </div>
      </div>
    </div>
  </section>
  <section class="settings-group">
    <h3 data-i18n="settingsInterface">Интерфейс</h3>
    <div class="settings-group-body">
      <button id="lyrBtn" class="tgl on" data-i18n="lyr" style="display:none">📝 текст</button>
      <button id="noteBtn" title="C-D-E / До-Ре-Ми">До-Ре-Ми</button>
      <button id="langBtn" title="Language">🌐 RU</button>
    </div>
  </section>
</div>
```

Use `settings-wide` for rows that span all three columns and
`settings-action-wide` for the file button. Add visible localized labels beside
the two volume sliders.

- [ ] **Step 2: Add compact section styling**

Replace flat `.more-body>.settings` grid rules with:

```css
.more-body>.settings{width:100%;display:flex;flex-direction:column;gap:10px}
.settings-group{display:grid;gap:8px;padding:9px;background:#0c1020aa;
  border:1px solid var(--line);border-radius:11px}
.settings-group h3{margin:0;color:var(--muted);font-size:10px;font-weight:650;
  letter-spacing:.08em;text-transform:uppercase}
.settings-group-body{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.settings-group-body>.slider{grid-column:1/-1;justify-content:space-between;min-width:0}
.settings-group-body>.slider input[type=range]{flex:1;width:auto;min-width:80px}
.settings-group-body>button{min-width:0;padding:8px 9px;overflow:hidden;text-overflow:ellipsis}
.settings-wide{grid-column:1/-1}
.settings-action-wide{grid-column:span 2}
```

Keep the existing narrow `mic-sync` layout and non-modal popover rules.

- [ ] **Step 3: Add localized section and control labels**

Add these keys:

```js
settingsMelody:'Мелодия', settingsAudio:'Звук и микрофон', settingsInterface:'Интерфейс',
guideVolume:'Мелодия', accompanimentVolume:'Аккомпанемент', voct:'Высота мелодии',
```

and:

```js
settingsMelody:'Melody', settingsAudio:'Sound & microphone', settingsInterface:'Interface',
guideVolume:'Melody', accompanimentVolume:'Accompaniment', voct:'Melody pitch',
```

- [ ] **Step 4: Remove phrase-loop UI and state**

Delete `#phLoop`, the `repeat` translations, `loopPhrase`, `loopP`, the repeat
branch in `tick()`, assignments that only maintained `loopP`, the
`$('phLoop').onclick` handler, and the `KeyL` shortcut. Keep phrase previous and
next navigation unchanged.

- [ ] **Step 5: Enlarge lyric text without changing effects**

Replace only the font-size declaration in the base lyric container:

```css
#lyrics{position:absolute;left:8px;right:8px;bottom:64px;z-index:5;pointer-events:none;
  text-align:center;font-size:clamp(17px,1.3vw,20px);line-height:1.6;color:#b6bcd4;
  background:#0d102047;border-radius:12px;padding:10px 14px;
  text-shadow:0 1px 2px #000e,0 0 6px #000b;
  max-height:7.6em;overflow:hidden}
```

In the existing `max-width:760px` rule, replace `font-size:13px` with
`font-size:16px`. Do not change `#lyrics` effect selectors, `#lyrBall`,
`renderLyrPara()`, `seekLyrics()`, or `updateLyrics()`.

- [ ] **Step 6: Run the focused test**

Run:

```powershell
node tests/view-controls-settings.test.js
```

Expected: `view controls and settings checks passed`.

- [ ] **Step 7: Commit the implementation**

Run:

```powershell
git add -- index.html tests/view-controls-settings.test.js
git commit -m "Сделать управление и настройки компактнее"
```

Expected: one commit containing only the implementation and focused test.

---

### Task 4: Regression verification and publication

**Files:**
- Verify: `index.html`
- Verify: `tests/*.test.js`

**Interfaces:**
- Consumes: completed DOM/CSS/localization change.
- Produces: test evidence and a pushed `main` branch.

- [ ] **Step 1: Run all Node tests**

Run:

```powershell
Get-ChildItem tests -Filter *.test.js | ForEach-Object { node $_.FullName; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
```

Expected: every test exits `0`.

- [ ] **Step 2: Check both inline script blocks as JavaScript modules**

Run the repository's existing module-aware syntax check over both inline
scripts in `index.html`.

Expected: both blocks parse successfully.

- [ ] **Step 3: Verify the waterfall drawing boundary**

Run:

```powershell
git diff HEAD~1 --unified=0 -- index.html | Select-String -Pattern 'drawPitch|lineY|pitchSamples|NOWLINE'
```

Expected: no output.

- [ ] **Step 4: Verify the intended scope and clean diff**

Run:

```powershell
git status --short
git diff --check HEAD~1
```

Expected: no unstaged files and no whitespace errors.

- [ ] **Step 5: Push `main` and verify parity**

Push with the authenticated `keynode` GitHub credential, then run:

```powershell
git fetch origin main
git rev-parse HEAD
git rev-parse origin/main
```

Expected: both SHAs are identical.
