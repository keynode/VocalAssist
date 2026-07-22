const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const settingsStart = html.indexOf('id="morePanel"');
const timelineStart = html.indexOf('<div class="tl"', settingsStart);
const settingsHtml = html.slice(settingsStart, timelineStart);

assert(!html.includes('id="footerText"'), 'persistent footer must be removed');
assert(settingsHtml.includes('id="helpDetails"'), 'settings help details must exist inside settings');
assert(settingsHtml.includes('id="helpText"'), 'localized help container must exist inside settings');
assert(html.includes("$('helpText').innerHTML=t('footerHtml')"), 'help must reuse localized footer content');
assert(html.includes("$('helpDetails').open=false"), 'closing settings must collapse help');
assert(html.includes("help:'❔ Справка'"), 'Russian help label must be localized');
assert(html.includes("help:'❔ Help'"), 'English help label must be localized');

console.log('settings help checks passed');
