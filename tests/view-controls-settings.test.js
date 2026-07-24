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

const group = topHtml.match(/<div id="viewToggles" class="view-toggles"[\s\S]*?<\/div>/)?.[0] || '';
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

const drawPitchStart = html.indexOf('function drawPitch()');
const drawPitch = html.slice(drawPitchStart, html.indexOf('async function micToggle', drawPitchStart));
assert(drawPitch.includes('const lineY=H-NOWLINE*d, pxq=lineY/LOOK;'));
assert(drawPitch.includes('ctx.fillRect(x-1.5*d,0,3*d,lineY);'));
assert(/#lyrics\s*\{[^}]*font-size\s*:\s*clamp\(17px,\s*1\.3vw,\s*20px\)/.test(style));
assert(/@media\s*\(max-width:760px\)[\s\S]*?#lyrics\s*\{[^}]*font-size\s*:\s*16px/.test(style));
for (const selector of ['#lyrics .done', '#lyrics .cur', '#lyrics .soon', '#lyrics .hold', '#lyrBall']) {
  assert(style.includes(selector), `${selector} effect must remain`);
}

console.log('view controls and settings checks passed');
