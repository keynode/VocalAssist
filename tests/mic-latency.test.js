const fs = require('fs');
const path = require('path');

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

const detectTickSource = extractFunction('detectTick');
let pitchAnyCalls = 0;
const published = [];
const context = {
  state: {
    enginePref: 'swift',
    sfeState: 'ready',
    sfeBusy: true,
    ringFilled: 4096,
    lastF: 220,
  },
  lastWindow(n) { return new Float32Array(n); },
  pitchAny() { pitchAnyCalls++; return 220; },
  processPitch(f) { published.push(f); },
  sfeDetect() { throw new Error('busy SwiftF0 must not launch another inference'); },
  performance: { now: () => 1000 },
};

const runDetectTick = new Function('ctx', `
  let {enginePref,sfeState,sfeBusy,ringFilled,lastF}=ctx.state;
  const lastWindow=ctx.lastWindow;
  const pitchAny=ctx.pitchAny;
  const processPitch=ctx.processPitch;
  const sfeDetect=ctx.sfeDetect;
  const performance=ctx.performance;
  let micOn=true;
  ${detectTickSource}
  detectTick();
`);

try {
  runDetectTick(context);
  if (pitchAnyCalls !== 1 || published[0] !== 220) {
    failures.push('immediate MPM result must publish even while SwiftF0 is busy');
  }
} catch (error) {
  failures.push(`detectTick scenario failed: ${error.message}`);
}

if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}

console.log('microphone latency checks passed');
