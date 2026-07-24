const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const style = (html.match(/<style>([\s\S]*?)<\/style>/)||[])[1]||'';
const boxStart = html.indexOf('<div class="nowbox">');
const boxEnd = html.indexOf('<div class="nowline">', boxStart);
const box = html.slice(boxStart, boxEnd);

assert(/\.nowbox\s*\{[^}]*display\s*:\s*grid/.test(style), 'note status must use a vertical grid');
assert(!/\.nowbox\s*\{[^}]*display\s*:\s*flex/.test(style), 'note status must not use horizontal flex');
assert(/\.note-status-row\s*\{[^}]*grid-template-columns\s*:\s*[^;}]+/.test(style), 'rows need fixed columns');
assert(/\.note-status-cents\s*\{[^}]*min-width\s*:/.test(style), 'cents need a stable slot');
assert.strictEqual((box.match(/class="note-status-row/g)||[]).length, 3, 'three rows are required');
assert(box.indexOf('data-i18n="now"') < box.indexOf('data-i18n="next"'));
assert(box.indexOf('data-i18n="next"') < box.indexOf('data-i18n="sing"'));
assert(box.includes('id="sungBox" style="display:none"'), 'microphone row stays hidden initially');
assert(!box.includes('id="curSub"'), 'duplicate current-note subtitle must be removed');

function extractFunction(name) {
  const start = html.indexOf(`function ${name}(`);
  const open = html.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}' && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error(`missing function ${name}`);
}

const update = extractFunction('updNoteBox');
const reset = extractFunction('reset');
assert(update.includes("$('curNN').textContent=cur?noteFull(cur[2]):'—'"));
assert(!update.includes('curSub'));
assert(!reset.includes('curSub'));

console.log('stable note status layout checks passed');
