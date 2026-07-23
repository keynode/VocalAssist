const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const failures = [];

if (!/audio:\{\s*echoCancellation:false,\s*noiseSuppression:false,\s*autoGainControl:false\s*\}/.test(html)) {
  failures.push('microphone capture must request raw input with all browser processing disabled');
}

function extractFunction(name) {
  const start = html.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`missing function ${name}`);
  const open = html.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}' && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error(`unterminated function ${name}`);
}

function assertClose(actual, expected, tolerance, message) {
  assert(
    Math.abs(actual - expected) <= tolerance,
    `${message}: expected ${expected}, got ${actual}`,
  );
}

const reportedMicLatencySource = extractFunction('reportedMicLatency');
const runReportedMicLatency = new Function('track', `
  ${reportedMicLatencySource}
  return reportedMicLatency(track);
`);
assert.strictEqual(runReportedMicLatency({getSettings:()=>({latency:0.035})}), 0.035);
assert.strictEqual(runReportedMicLatency({getSettings:()=>({latency:2})}), 0);
assert.strictEqual(runReportedMicLatency({}), 0);

const micWindowTimingSource = extractFunction('micWindowTiming');
const runMicWindowTiming = new Function('ctx', `
  const ac=ctx.ac;
  const reportedMicLatencySec=ctx.reportedMicLatencySec;
  const micFineMs=ctx.micFineMs;
  const playing=ctx.playing;
  const startQ=ctx.startQ;
  const startAcTime=ctx.startAcTime;
  const micTimelineRevision=ctx.micTimelineRevision;
  const qPerSec=()=>ctx.qPerSec;
  ${micWindowTimingSource}
  return micWindowTiming(ctx.captureEndTime,ctx.windowSamples);
`);
const timingContext = {
  ac:{sampleRate:48000},
  reportedMicLatencySec:0.02,
  micFineMs:0,
  playing:true,
  startQ:2,
  startAcTime:8,
  micTimelineRevision:7,
  qPerSec:2,
  captureEndTime:10,
  windowSamples:2048,
};
const timing2048 = runMicWindowTiming(timingContext);
const timing4096 = runMicWindowTiming({...timingContext, windowSamples:4096});
assertClose(timing2048.analysisTime, 9.9586667, 0.0001, '2048-sample midpoint');
assertClose(timing4096.analysisTime, 9.9373333, 0.0001, '4096-sample midpoint');
assertClose(timing2048.q, 5.9173333, 0.0001, 'capture time must map to song quarters');
assert.strictEqual(timing2048.revision, 7);
assert(timing4096.analysisTime < timing2048.analysisTime, 'longer window must be placed farther in the past');
assertClose(
  runMicWindowTiming({...timingContext, micFineMs:-500}).analysisTime,
  10,
  0.0001,
  'negative fine adjustment must not place a sample after capture end',
);

const processPitchSource = extractFunction('processPitch');
const runProcessPitch = new Function('ctx', `
  let silentN=0, trk=null, pendMf=null, pendN=0, hitN=0, hitT=0;
  const playing=true;
  const MELODY=[[3,1,69]];
  const pitchSamples=[];
  const performance={now:()=>1000};
  const ac={currentTime:10};
  const midiOf=()=>69;
  const smoothPitch=mf=>mf;
  const activeTargetNotes=(melody,q)=>{ctx.targetQueries.push(q);return melody;};
  const nearestTargetDiff=(mf,targets)=>mf-targets[0][2];
  const nowQ=()=>99;
  const curNotesG=[[99,1,80]];
  const dom={
    hitPct:{textContent:''},
    sungNN:{textContent:''},
    sungCents:{textContent:''},
    sungBox:{classList:{toggle(){}}}
  };
  const $=id=>dom[id];
  const noteFull=()=> 'A4';
  ${processPitchSource}
  const sample=processPitch(440,{q:3.25,analysisTime:9.95,revision:7});
  return {sample,pitchSamples,hitN,hitT};
`);
const historicalQueries = [];
const historicalResult = runProcessPitch({targetQueries:historicalQueries});
assert.deepStrictEqual(historicalQueries, [3.25], 'scoring must query targets at captureQ');
assert.strictEqual(historicalResult.pitchSamples[0].q, 3.25, 'trace must store captureQ');
assert.strictEqual(historicalResult.hitT, 1, 'historical target must count exactly once');

const capCode = (html.match(/const CAP_CODE=`([\s\S]*?)`;/)||[])[1]||'';
assert(capCode.includes('endFrame'), 'AudioWorklet message must contain an end-frame timestamp');
assert(capCode.includes('samples'), 'AudioWorklet message must name its sample payload');

const detectTickSource = extractFunction('detectTick');
const runDetectTick = new Function('ctx', `
  let {enginePref,sfeState,sfeBusy,ringFilled,lastF,micTimelineRevision}=ctx.state;
  const lastWindow=ctx.lastWindow;
  const pitchAny=ctx.pitchAny;
  const processPitch=ctx.processPitch;
  const sfeDetect=ctx.sfeDetect;
  const performance=ctx.performance;
  const micWindowTiming=ctx.micWindowTiming;
  const ac=ctx.ac;
  let micOn=true;
  ${detectTickSource}
  detectTick(ctx.captureEndTime);
  return {bumpRevision(){micTimelineRevision++;}};
`);

function deferred() {
  let resolve;
  const promise = new Promise(r=>{resolve=r;});
  return {promise,resolve};
}

(async()=>{
  try {
    let pitchAnyCalls = 0;
    const published = [];
    runDetectTick({
      state:{enginePref:'swift',sfeState:'ready',sfeBusy:true,ringFilled:4096,lastF:220,micTimelineRevision:3},
      captureEndTime:12,
      lastWindow:n=>new Float32Array(n),
      pitchAny(){pitchAnyCalls++;return 220;},
      processPitch(f,timing){published.push({f,timing});},
      sfeDetect(){throw new Error('busy SwiftF0 must not launch another inference');},
      micWindowTiming:(end,n)=>({q:end-n/48000,analysisTime:end-n/96000,revision:3}),
      ac:{currentTime:12.02},
      performance:{now:()=>1000},
    });
    assert.strictEqual(pitchAnyCalls,1,'immediate detector must run while SwiftF0 is busy');
    assert.strictEqual(published[0].f,220,'immediate MPM result must publish while SwiftF0 is busy');
    assert.strictEqual(published[0].timing.q,12-2048/48000,'MPM must retain capture timing');
  } catch (error) {
    failures.push(`detectTick immediate scenario failed: ${error.message}`);
  }

  try {
    const windows = [];
    const published = [];
    let calls = 0;
    runDetectTick({
      state:{enginePref:'mpm',sfeState:'off',sfeBusy:false,ringFilled:4096,lastF:220,micTimelineRevision:4},
      captureEndTime:20,
      lastWindow:n=>new Float32Array(n),
      pitchAny(){return ++calls===1?0:110;},
      processPitch(f,timing){published.push({f,timing});},
      sfeDetect:()=>Promise.resolve(0),
      micWindowTiming:(end,n)=>{windows.push(n);return {q:end-n/48000,analysisTime:end-n/96000,revision:4};},
      ac:{currentTime:20.02},
      performance:{now:()=>1000},
    });
    assert.deepStrictEqual(windows,[4096],'successful 4096 fallback must use the 4096 timing window');
    assert.strictEqual(published[0].timing.q,20-4096/48000);
  } catch (error) {
    failures.push(`detectTick fallback scenario failed: ${error.message}`);
  }

  try {
    const swift = deferred();
    const published = [];
    const runner = runDetectTick({
      state:{enginePref:'swift',sfeState:'ready',sfeBusy:false,ringFilled:4096,lastF:220,micTimelineRevision:9},
      captureEndTime:30,
      lastWindow:n=>new Float32Array(n),
      pitchAny:()=>220,
      processPitch(f,timing,options){published.push({f,timing,options});},
      sfeDetect:()=>swift.promise,
      micWindowTiming:(end,n)=>({q:end-n/48000,analysisTime:end-n/96000,revision:9}),
      ac:{currentTime:30.02},
      performance:{now:()=>1000},
    });
    runner.bumpRevision();
    swift.resolve(440);
    await Promise.resolve();
    await Promise.resolve();
    assert.strictEqual(published.length,1,'SwiftF0 from an old timeline revision must be discarded');
  } catch (error) {
    failures.push(`SwiftF0 revision scenario failed: ${error.message}`);
  }

  if (failures.length) {
    for (const failure of failures) console.error(`FAIL: ${failure}`);
    process.exitCode=1;
    return;
  }

  console.log('microphone latency checks passed');
})().catch(error=>{
  console.error(error);
  process.exitCode=1;
});
