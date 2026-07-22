const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const style = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] || '';

for (const id of [
  'settingsMain',
  'midiTracksBtn',
  'midiTracksView',
  'midiTracksBack',
  'midiTracksState',
  'midiTracksAuto',
  'midiTrackList',
]) {
  assert(html.includes(`id="${id}"`), `missing MIDI track selector element #${id}`);
}

assert(
  /\.midi-tracks-entry\s*\{[^}]*grid-column\s*:\s*1\s*\/\s*-1/.test(style),
  'MIDI track entry must span the complete settings grid',
);
assert(
  /\.midi-track-list\s*\{[^}]*max-height\s*:[^;}]+[^}]*overflow-y\s*:\s*auto/.test(style),
  'MIDI track list must scroll inside a bounded popover view',
);
assert(
  /\.more-body\[hidden\]\s*\{[^}]*display\s*:\s*none/.test(style),
  'hidden main settings view must override its author-level flex display',
);
assert(!/#morePanel\s*\{[^}]*position\s*:\s*fixed/.test(style), 'selector must not turn settings into a modal or bottom sheet');

for (const key of [
  'midiTracks',
  'midiAuto',
  'midiAutomatic',
  'midiSelected',
  'midiTrack',
  'midiChannel',
  'midiProgram',
  'midiNotes',
  'midiTracksUnavailable',
]) {
  const occurrences = html.match(new RegExp(`${key}:`, 'g')) || [];
  assert.strictEqual(occurrences.length, 2, `${key} must be localized in Russian and English`);
}

assert(html.includes("input.type='checkbox'"), 'track rows must use native checkbox inputs');
assert(html.includes("row.htmlFor=input.id"), 'each checkbox must have an associated label');
assert(
  html.includes('input.disabled=checked&&selected.size===1'),
  'the final selected MIDI group must not be removable',
);
assert(
  html.includes("$('midiTracksBtn').focus()"),
  'Back must restore focus to the MIDI track entry button',
);
assert(
  html.includes("querySelector('input:not([disabled])')||$('midiTracksAuto')"),
  'single-group songs must focus the automatic-detection control instead of a hidden entry button',
);
assert(
  html.includes('CURRENT_SONG.midiGroups&&CURRENT_SONG.midiGroups.length'),
  'selector visibility must depend on parsed MIDI metadata',
);
assert(
  html.includes("$('midiTracksView').hidden=false") && html.includes("$('settingsMain').hidden=true"),
  'selector must replace the main settings content inside the same popover',
);

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

const liveSelection = extractFunction('applyMidiTrackSelection');
for (const fragment of [
  'const wasPlaying=playing',
  'const q=wasPlaying?Math.max(nowQ(),0):startQ',
  'rebuildMidiSong(CURRENT_SONG,keys)',
  'buildLyrics()',
  'buildTicks()',
  'rebuild()',
  'const boundedQ=Math.min(wasPlaying?Math.max(nowQ(),q):q,totalQ)',
  'if(wasPlaying){',
  'startQ=boundedQ',
  'startAcTime=ac.currentTime',
  'curIdx=idxAfter(MELODY,boundedQ)',
  'accIdx=idxAfter(ACC,boundedQ)',
  'else setPos(boundedQ)',
]) {
  assert(liveSelection.includes(fragment), `live MIDI selection must include: ${fragment}`);
}
for (const forbidden of ['pause()', 'stopSound()', 'requestAnimationFrame', 'playing=false']) {
  assert(!liveSelection.includes(forbidden), `live MIDI selection must not include: ${forbidden}`);
}

const idxAfter = extractFunction('idxAfter');
assert(
  idxAfter.includes('arr[i][0]<=q+1e-6'),
  'live MIDI selection must resume strictly after the captured instant to avoid replaying an onset',
);

console.log('MIDI track selector UI checks passed');
