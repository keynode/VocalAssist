const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function extractFunction(name) {
  const start = html.indexOf(`function ${name}(`);
  assert(start >= 0, `missing function ${name}`);
  const open = html.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}' && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error(`unterminated function ${name}`);
}

const sources = [
  'findPhrases',
  'catOfProg',
  'midiGroupKey',
  'midiCandidates',
  'pickMidiAutoGroup',
  'findPolyPhrases',
  'splitMidiSong',
  'validateMidiTrackKeys',
  'activeTargetNotes',
  'nearestTargetDiff',
].map(extractFunction).join('\n');

const api = new Function(`
  const round3=x=>Math.round(x*1000)/1000;
  ${sources}
  return {midiGroupKey,midiCandidates,pickMidiAutoGroup,findPolyPhrases,splitMidiSong,validateMidiTrackKeys,
    activeTargetNotes,nearestTargetDiff};
`)();

const mid = {
  bpm: 120,
  trackNames: ['Lead Vocal', 'Harmony', 'Drums'],
  groups: [
    {tr:0,ch:0,prog:53,notes:[
      {q:0,d:1,m:60},
      {q:0,d:1,m:72},
      {q:1,d:1,m:62},
      {q:2,d:1,m:64},
    ]},
    {tr:1,ch:1,prog:52,notes:[
      {q:0,d:1,m:67},
      {q:0,d:1,m:71},
      {q:2,d:1,m:69},
    ]},
    {tr:2,ch:9,prog:0,notes:[{q:0,d:.25,m:36}]},
  ],
};

const automatic = api.splitMidiSong(mid);
assert.strictEqual(automatic.midiAutoKey, '0:0', 'named lead must remain the automatic choice');
assert.deepStrictEqual(
  automatic.raw,
  [[0,1,72],[1,1,62],[2,1,64]],
  'automatic mode must retain legacy same-onset collapse and ordering',
);
assert.deepStrictEqual(
  automatic.midiGroups.map(group => ({key:group.key,name:group.name})),
  [{key:'0:0',name:'Lead Vocal'},{key:'1:1',name:'Harmony'}],
  'selector metadata must expose stable non-percussion track/channel groups',
);

const manual = api.splitMidiSong(mid, ['0:0', '1:1']);
assert.strictEqual(manual.raw.length, 7, 'manual multi-selection must preserve every selected note');
assert.deepStrictEqual(
  manual.raw.filter(note => note[0] === 0).map(note => note[2]),
  [60,67,71,72],
  'manual multi-selection must preserve simultaneous notes in pitch order',
);
assert.deepStrictEqual(manual.acc, [], 'selected groups must not also play as accompaniment');

const harmonyOnly = api.splitMidiSong(mid, ['1:1']);
assert.deepStrictEqual(
  harmonyOnly.acc.map(note => note[2]),
  [60,72,62,64],
  'unselected non-percussion groups must become accompaniment',
);
assert(!harmonyOnly.acc.some(note => note[2] === 36), 'percussion channel must remain excluded');

assert.deepStrictEqual(
  api.findPolyPhrases([[0,2,60],[0,1,67],[3,1,62]], 120),
  [0,3],
  'phrase detection must group simultaneous onsets and use the preceding group end',
);

const storedSong = {midiGroups:automatic.midiGroups};
assert.deepStrictEqual(
  api.validateMidiTrackKeys(storedSong, undefined),
  {keys:null,changed:false,staleAll:false},
  'missing preference must preserve automatic mode',
);
assert.deepStrictEqual(
  api.validateMidiTrackKeys(storedSong, ['0:0','missing','0:0']),
  {keys:['0:0'],changed:true,staleAll:false},
  'partially stale preferences must retain unique valid keys',
);
assert.deepStrictEqual(
  api.validateMidiTrackKeys(storedSong, ['missing']),
  {keys:null,changed:true,staleAll:true},
  'fully stale preferences must fall back to automatic mode',
);

assert(html.includes('const PARSE_V=6'), 'repository parser cache version must remain current');
assert(
  /midiGroups\s*:\s*s\.midiGroups/.test(html) && /midiAutoKey\s*:\s*s\.midiAutoKey/.test(html),
  'local MIDI entries must retain group metadata',
);
assert(
  /rs\.data=\{[^}]*midiGroups:s\.midiGroups[^}]*midiAutoKey:s\.midiAutoKey/.test(html),
  'repository cache data must retain group metadata',
);
assert(
  /applySong\(\{id:rs\.id,[\s\S]{0,300}midiGroups:rs\.data\.midiGroups/.test(html),
  'opening a repository song must forward MIDI metadata',
);

const targets = api.activeTargetNotes([[0,2,60],[0,1,67],[2,1,64]], .5);
assert.deepStrictEqual(targets, [[0,2,60],[0,1,67]], 'all simultaneous active target notes must be returned');
assert(
  Math.abs(api.nearestTargetDiff(66.6, targets)+0.4)<1e-9,
  'microphone scoring must use the nearest active target pitch',
);
assert.strictEqual(api.nearestTargetDiff(66.6, []), null, 'no active target must produce no scoring difference');

console.log('MIDI track selection checks passed');
