const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');

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

const play = extractFunction('play');
const tick = extractFunction('tick');

assert(!html.includes('id="countin"'), 'count-in overlay must be removed');
assert(!html.includes('.countin'), 'count-in styling must be removed');
assert(!html.includes('function click('), 'count-in click synthesizer must be removed');
assert(!html.includes('startQ0Play'), 'count-in transport offset must be removed');
assert(!html.includes('play(true)'), 'all playback entry points must use immediate play()');
assert(!html.includes('4-3-2-1'), 'localized help must not promise a count-in');
assert(!readme.includes('4-3-2-1'), 'README must not promise a count-in');

assert(play.startsWith('function play(){'), 'play() must not accept a count-in flag');
for (const delayed of ['withCount', 'setTimeout', 'q0-4']) {
  assert(!play.includes(delayed), `play() must not contain delayed-start fragment: ${delayed}`);
}
assert(play.includes('startAcTime=ac.currentTime'), 'play() must anchor the clock immediately');
assert(play.includes('curIdx=idxFor(MELODY,startQ)'), 'play() must schedule vocal notes from the current position');
assert(play.includes('accIdx=idxFor(ACC,startQ)'), 'play() must schedule accompaniment from the current position');
assert(play.includes('raf=requestAnimationFrame(tick)'), 'play() must start the render loop immediately');
assert(!tick.includes('countEl'), 'tick() must not wait on countdown state');

console.log('Immediate playback checks passed');
