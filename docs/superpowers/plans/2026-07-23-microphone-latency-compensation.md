# Microphone Latency Compensation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Timestamp every detected microphone pitch at its historical audio-capture position so the contour and scoring align with the MIDI note that was sounding when the audio was recorded.

**Architecture:** AudioWorklet supplies a frame timestamp for each chunk. Small timing helpers convert the actual detector window midpoint into a transport quarter position before inference starts; `processPitch` consumes that immutable position for both rendering and historical target lookup. A compact Settings control exposes smoothed delay diagnostics and a persisted fine adjustment.

**Tech Stack:** Single-page HTML/CSS/JavaScript, Web Audio API, AudioWorklet, Pitchy/MPM, SwiftF0 through ONNX Runtime Web, Node source-regression tests.

## Global Constraints

- Apply one compensated timestamp to both visualization and scoring.
- Keep immediate MPM publication; SwiftF0 must remain asynchronous and non-blocking.
- Keep `echoCancellation:false`, `noiseSuppression:false`, and `autoGainControl:false`.
- Do not use `AudioContext.baseLatency` or `outputLatency` as microphone input latency.
- Positive manual adjustment moves microphone samples farther into the past.
- Clamp total correction to at least zero so a sample is never placed after its capture-block end.
- Do not delay MIDI playback or the playhead.
- Preserve Russian and English localization.

---

### Task 1: Pure microphone timing and historical scoring contract

**Files:**
- Modify: `tests/mic-latency.test.js`
- Modify: `index.html:2103-2106`
- Modify: `index.html:2620-2663`

**Interfaces:**
- Produces: `micWindowTiming(captureEndTime:number, windowSamples:number): {analysisTime:number, q:number|null, revision:number}`
- Produces: `reportedMicLatency(track:MediaStreamTrack): number`
- Produces: `processPitch(f:number, timing:object|null, options?:{countScore?:boolean, updateLive?:boolean}): object|null`
- Consumes: existing `activeTargetNotes(MELODY, q)` and `nearestTargetDiff(mf, targets)`.

- [ ] **Step 1: Add failing timing and historical-scoring tests**

Extend `tests/mic-latency.test.js` with executable extraction tests that assert:

```js
const timing2048 = micWindowTiming.call(ctx, 10, 2048);
const timing4096 = micWindowTiming.call(ctx, 10, 4096);
assertClose(timing2048.analysisTime, 9.958, 0.001);
assertClose(timing4096.analysisTime, 9.9366667, 0.001);
assert(timing4096.analysisTime < timing2048.analysisTime);

ctx.micFineMs = -500;
assertClose(micWindowTiming.call(ctx, 10, 2048).analysisTime, 10, 0.001);

processPitch.call(ctx, 440, {q:3.25, analysisTime:9.95, revision:7});
assert.deepStrictEqual(ctx.targetQueries, [3.25]);
assert.strictEqual(ctx.pitchSamples[0].q, 3.25);
```

Use a 48 kHz context, `reportedMicLatencySec=0.02`, `micFineMs=0`, `startQ=2`, `startAcTime=8`, `bpm=120`, and assert `q` is calculated from `analysisTime`, not from `nowQ()`.

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```powershell
node tests/mic-latency.test.js
```

Expected: FAIL because `micWindowTiming` does not exist and `processPitch` still queries `curNotesG` and stores `nowQ()`.

- [ ] **Step 3: Implement pure timing helpers and the new publication contract**

Add state and helpers near the microphone globals:

```js
const MIC_SYNC_KEY='vocalassist.micSyncMs';
let micFineMs=Math.max(-250,Math.min(400,Number(localStorage.getItem(MIC_SYNC_KEY))||0));
let reportedMicLatencySec=0, micTimelineRevision=0;

function reportedMicLatency(track){
  const value=Number(track?.getSettings?.().latency);
  return Number.isFinite(value)&&value>=0&&value<=1?value:0;
}
function micWindowTiming(captureEndTime,windowSamples){
  const windowMs=windowSamples/ac.sampleRate*500;
  const correctionMs=Math.max(0,windowMs+reportedMicLatencySec*1000+micFineMs);
  const analysisTime=captureEndTime-correctionMs/1000;
  return {
    analysisTime,
    q:playing?startQ+(analysisTime-startAcTime)*qPerSec():null,
    revision:micTimelineRevision
  };
}
```

Change publication to accept timing:

```js
function processPitch(f,timing=null,{countScore=true,updateLive=true}={}){
  if(!(f>0)){ /* retain existing silence reset */ return null; }
  const mf=smoothPitch(midiOf(f));
  const sampleQ=timing?.q??null;
  const targets=playing&&sampleQ!=null?activeTargetNotes(MELODY,sampleQ):[];
  const diff=targets.length?nearestTargetDiff(mf,targets):null;
  if(countScore&&diff!=null){ /* retain counters */ }
  const sample={t:performance.now(),q:sampleQ,mf,diff,
    analysisTime:timing?.analysisTime??ac.currentTime,painted:false};
  pitchSamples.push(sample);
  if(updateLive){ /* retain sung-note DOM updates */ }
  return sample;
}
```

Do not use `curNotesG` for microphone scoring.

- [ ] **Step 4: Run the focused test and verify pass**

Run:

```powershell
node tests/mic-latency.test.js
```

Expected: `microphone latency checks passed`.

- [ ] **Step 5: Commit the timing contract**

```powershell
git add -- index.html tests/mic-latency.test.js
git commit -m "Добавить временную модель микрофона"
```

---

### Task 2: Timestamp AudioWorklet, MPM fallback, and SwiftF0

**Files:**
- Modify: `tests/mic-latency.test.js`
- Modify: `index.html:2520-2641`
- Modify: `index.html:2664-2673`

**Interfaces:**
- Consumes: `micWindowTiming(captureEndTime, windowSamples)`.
- Produces: `onMicChunk(message:{samples:Float32Array,endFrame:number}): void`.
- Produces: `detectTick(captureEndTime:number): void`.
- Produces: every async SwiftF0 request closes over immutable timing metadata.

- [ ] **Step 1: Add failing capture and asynchronous-revision tests**

Add source and executable assertions:

```js
assert(CAP_CODE.includes('endFrame'));
assert(CAP_CODE.includes('samples'));

detectTick(12);
assert.strictEqual(published[0].timing.q, expectedQ);

const pending = deferred();
detectTick(12);
ctx.micTimelineRevision++;
pending.resolve(440);
await Promise.resolve();
assert.strictEqual(swiftPublications.length, 0);
```

Cover the 2048-to-4096 fallback by making the first `pitchAny` return zero and the second succeed, then assert the published timing was created with `4096`.

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```powershell
node tests/mic-latency.test.js
```

Expected: FAIL because the worklet posts only a `Float32Array`, `detectTick` has no timestamp argument, and SwiftF0 does not validate a timeline revision.

- [ ] **Step 3: Add exact worklet frame timestamps**

Change the worklet post payload:

```js
if(this.n===1024){
  const samples=this.b.slice(0);
  this.port.postMessage({samples,endFrame:currentFrame+i},[samples.buffer]);
  this.n=0;
}
```

Receive the object and convert the frame to the AudioContext clock:

```js
capNode.port.onmessage=e=>{if(micOn)onMicChunk(e.data);};
function onMicChunk(message){
  const ch=message.samples;
  for(let i=0;i<ch.length;i++){ /* existing ring write */ }
  detectTick(message.endFrame/ac.sampleRate);
}
```

- [ ] **Step 4: Thread immutable timing through both detectors**

Make `detectTick(captureEndTime)` calculate timing only after the successful window size is known:

```js
const timing=micWindowTiming(captureEndTime,n);
processPitch(f,timing);
```

For SwiftF0:

```js
const swiftTiming=micWindowTiming(captureEndTime,nn);
const requestRevision=swiftTiming.revision;
sfeDetect(b).then(sf=>{
  const ageMs=(ac.currentTime-swiftTiming.analysisTime)*1000;
  if(micOn&&enginePref==='swift'&&sf>0&&requestRevision===micTimelineRevision){
    processPitch(sf,swiftTiming,{countScore:false,updateLive:ageMs<=120});
  }
});
```

Keep the existing single-inference `sfeBusy` guard. Historical visualization may accept a valid result after 120 ms, but the live note box must not show that stale result.

Update the Analyser fallback:

```js
const timing=micWindowTiming(ac.currentTime,micBuf.length);
processPitch(pitchAny(micBuf),timing);
```

- [ ] **Step 5: Run the focused test and verify pass**

Run:

```powershell
node tests/mic-latency.test.js
```

Expected: `microphone latency checks passed`.

- [ ] **Step 6: Commit capture integration**

```powershell
git add -- index.html tests/mic-latency.test.js
git commit -m "Привязать детекторы к времени захвата"
```

---

### Task 3: Invalidate old transport epochs and measure first paint

**Files:**
- Modify: `tests/mic-latency.test.js`
- Modify: `index.html:1101-1133`
- Modify: `index.html:1214-1231`
- Modify: `index.html:1260-1315`
- Modify: `index.html:1999-2031`
- Modify: `index.html:2157-2229`
- Modify: `index.html:2474-2519`

**Interfaces:**
- Produces: `bumpMicTimeline(): number`.
- Produces: `markMicSamplePainted(sample, paintTime): void`.
- Consumes: `sample.analysisTime`, `sample.painted`, and `micTimelineRevision`.

- [ ] **Step 1: Add failing transport and measurement tests**

Assert every clock-reanchoring path invokes `bumpMicTimeline()`:

```js
for(const name of ['setPos','play','pause','jumpTo','applyMidiTrackSelection']){
  assert(extractFunction(name).includes('bumpMicTimeline()'));
}
```

Also assert the live tempo, transpose, octave, and legato rebuild paths bump the revision when they change the active song-time mapping or target set.

Add a pure first-paint test:

```js
markMicSamplePainted(sample,10.100);
markMicSamplePainted(sample,10.200);
assert.strictEqual(sample.painted,true);
assert.strictEqual(measurementUpdates,1);
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```powershell
node tests/mic-latency.test.js
```

Expected: FAIL because no timeline invalidation or first-paint measurement exists.

- [ ] **Step 3: Add transport revision invalidation**

Add:

```js
function bumpMicTimeline(){return ++micTimelineRevision;}
```

Call it whenever `startQ/startAcTime` is re-anchored or the historical target layer changes: `setPos`, `play`, `pause`, `jumpTo`, live tempo changes, transpose, vocal octave, legato rebuild, and `applyMidiTrackSelection`.

Calls may occur more than once during a compound reset; correctness requires only monotonic invalidation, not a specific increment count.

- [ ] **Step 4: Measure capture-to-detect and first paint**

Maintain exponential moving averages:

```js
let micDelay={captureDetect:null,detectPaint:null,capturePaint:null};
const micEma=(old,value)=>old==null?value:old*0.85+value*0.15;
function markMicSamplePainted(sample,paintTime=ac.currentTime){
  if(sample.painted)return;
  sample.painted=true;
  const detectPaint=(paintTime-sample.detectedTime)*1000;
  const capturePaint=(paintTime-sample.analysisTime)*1000;
  micDelay.detectPaint=micEma(micDelay.detectPaint,detectPaint);
  micDelay.capturePaint=micEma(micDelay.capturePaint,capturePaint);
  renderMicSyncSettings();
}
```

Set `detectedTime=ac.currentTime` in `processPitch`, update `captureDetect`, and call `markMicSamplePainted` only when a sample is actually considered by `drawPitch()` or `drawHView()`.

- [ ] **Step 5: Run focused tests**

Run:

```powershell
node tests/mic-latency.test.js
```

Expected: `microphone latency checks passed`.

- [ ] **Step 6: Commit transport and diagnostics**

```powershell
git add -- index.html tests/mic-latency.test.js
git commit -m "Измерять задержку микрофонной линии"
```

---

### Task 4: Compact Settings control, persistence, and full verification

**Files:**
- Modify: `tests/mic-latency.test.js`
- Modify: `index.html:263-320`
- Modify: `index.html:368-401`
- Modify: `index.html:498-575`
- Modify: `index.html:596-623`
- Modify: `index.html:2520-2575`

**Interfaces:**
- Produces DOM IDs: `micSyncAuto`, `micSyncFine`, `micSyncFineVal`, `micSyncReset`.
- Produces: `renderMicSyncSettings(): void`.
- Consumes: `micDelay.capturePaint`, `reportedMicLatencySec`, `micFineMs`.

- [ ] **Step 1: Add failing UI and persistence assertions**

Add assertions for:

```js
for(const id of ['micSyncAuto','micSyncFine','micSyncFineVal','micSyncReset']){
  assert(html.includes(`id="${id}"`));
}
assert(html.includes("localStorage.setItem(MIC_SYNC_KEY,String(micFineMs))"));
assert(html.includes("reportedMicLatencySec=reportedMicLatency(micStream.getAudioTracks()[0])"));
assert(html.includes("data-i18n=\"micSync\""));
```

Assert both `T.ru` and `T.en` contain `micSync`, `micSyncAuto`, `micSyncFine`, and `micSyncReset`.

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```powershell
node tests/mic-latency.test.js
```

Expected: FAIL because the compact synchronization controls do not exist.

- [ ] **Step 3: Add compact localized Settings markup and styling**

Add one full-width settings block after detector selection:

```html
<div class="mic-sync">
  <div><span data-i18n="micSync">Синхронизация микрофона</span>
    <span id="micSyncAuto">Авто</span></div>
  <label><span data-i18n="micSyncFine">Доп. поправка</span>
    <input id="micSyncFine" type="range" min="-250" max="400" step="5" value="0">
    <span id="micSyncFineVal">0 мс</span></label>
  <button id="micSyncReset" data-i18n="micSyncReset">Сбросить</button>
</div>
```

Use a compact grid that spans the existing Settings grid and collapses cleanly below 410 px without increasing permanent page height.

- [ ] **Step 4: Bind measurement, fine adjustment, reset, and input latency**

Implement:

```js
function renderMicSyncSettings(){
  const measured=micDelay.capturePaint;
  $('micSyncAuto').textContent=t('micSyncAuto')+(measured==null?'':' ~'+Math.round(measured)+' '+t('milliseconds'));
  $('micSyncFine').value=micFineMs;
  $('micSyncFineVal').textContent=(micFineMs>0?'+':'')+micFineMs+' '+t('milliseconds');
}
$('micSyncFine').oninput=e=>{
  micFineMs=Math.max(-250,Math.min(400,Number(e.target.value)||0));
  try{localStorage.setItem(MIC_SYNC_KEY,String(micFineMs));}catch(e){}
  renderMicSyncSettings();
};
$('micSyncReset').onclick=()=>{
  micFineMs=0;
  try{localStorage.removeItem(MIC_SYNC_KEY);}catch(e){}
  renderMicSyncSettings();
};
```

After `getUserMedia`, set:

```js
reportedMicLatencySec=reportedMicLatency(micStream.getAudioTracks()[0]);
```

Reset it to zero when the microphone is stopped. Call `renderMicSyncSettings()` from `applyLang()` and after delay measurements update.

- [ ] **Step 5: Run focused and complete verification**

Run:

```powershell
node tests/mic-latency.test.js
Get-ChildItem -LiteralPath tests -Filter '*.test.js' | Sort-Object Name | ForEach-Object { node $_.FullName; if($LASTEXITCODE -ne 0){ throw "Failed: $($_.Name)" } }
node -e "const fs=require('fs'),vm=require('vm');const h=fs.readFileSync('index.html','utf8');const scripts=[...h.matchAll(/<script(?:\\s[^>]*)?>([\\s\\S]*?)<\\/script>/g)].map(m=>m[1]).filter(Boolean);scripts.forEach((s,i)=>new vm.Script(s,{filename:'inline-'+i+'.js'}));console.log('inline JavaScript syntax passed')"
git diff --check
```

Expected: every test prints its pass message, syntax prints `inline JavaScript syntax passed`, and `git diff --check` is silent.

- [ ] **Step 6: Inspect final scope and commit**

Run:

```powershell
git diff --stat HEAD
git status --short
```

Expected: only `index.html`, `tests/mic-latency.test.js`, and the already committed design/plan history are in scope.

Commit:

```powershell
git add -- index.html tests/mic-latency.test.js
git commit -m "Компенсировать задержку микрофона"
```

- [ ] **Step 7: Push and verify main parity**

Run:

```powershell
git push origin main
git fetch origin main
if((git rev-parse HEAD) -ne (git rev-parse origin/main)){throw 'HEAD and origin/main differ'}
git status --short --branch
```

Expected: push succeeds, `HEAD` equals `origin/main`, and the working tree is clean.
