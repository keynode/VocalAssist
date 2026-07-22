const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const style = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] || '';

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

assert(
  /\.wrap\s*\{[^}]*width\s*:\s*100%[^}]*max-width\s*:\s*none/.test(style),
  'page wrapper must use the full browser width without a finite maximum',
);
assert(
  !/#morePanel\s*\{[^}]*position\s*:\s*fixed[^}]*bottom\s*:\s*0/.test(style),
  'settings must not become a bottom sheet at narrow widths',
);
assert(
  html.includes("morePanel.setAttribute('aria-modal','false')"),
  'settings popover must remain non-modal at every width',
);
assert(
  !html.includes('mobileSettings()'),
  'settings behavior must not switch based on the old mobile breakpoint',
);

const pageFunction = extractFunction('hViewPageQuarters');
const pageForWidth = new Function('roll', `${pageFunction}; return hViewPageQuarters();`);
assert.strictEqual(pageForWidth({clientWidth: 1088}), 8, 'former desktop width must retain eight quarters');
const widePage = pageForWidth({clientWidth: 2240});
assert(widePage > 8, 'wide contour must show more than eight quarters');
assert.strictEqual(widePage % 4, 0, 'contour page length must stay aligned to four-quarter measures');

const drawHView = extractFunction('drawHView');
assert(
  drawHView.includes('const pageQuarters=hViewPageQuarters()'),
  'contour renderer must use its adaptive page length',
);

console.log('full-width contour checks passed');
