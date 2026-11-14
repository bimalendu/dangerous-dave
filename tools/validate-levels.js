// Checks every level: shape, required tiles, and that the trophy, door, warp and pickups
// can be reached under a conservative model of Dave's jump (2 tiles up, about 3 across).
// How precise those jumps must be is measured separately by tools/difficulty.js.
'use strict';
const path = require('path');
const js = f => path.join(__dirname, '..', 'js', f);
require(js('levels.js'));
require(js('world.js'));
const DD = globalThis.DD;

const VALID = '.#DSMFWV@TEodricwGJ1234';
let errors = 0, warnings = 0;
const err = (id, m) => { errors++; console.log('ERROR  level ' + id + ': ' + m); };
const warn = (id, m) => { warnings++; console.log('warn   level ' + id + ': ' + m); };

function search(w, sx, sy, startFly) {
  const H = w.h;
  const pass = (x, y) => {
    if (y < -1 || y >= H) return false;
    const c = w.get(x, y);
    return DD.SOLID.indexOf(c) < 0 && DD.HAZARD.indexOf(c) < 0;
  };
  const supported = (x, y) => y + 1 < H && y + 1 >= 0 && w.solid(x, y + 1);
  const cells = new Set(), flyCells = new Set(), seen = new Set();
  let warp = false;
  const q = [];
  // state: [x, y, mode, up, h2, fallen]  mode: 0 ground, 1 air, 2 flying
  const push = (x, y, mode, up, h2, f) => {
    if (x < 0 || x >= w.w) { // only reachable through a side warp opening
      warp = true; return;
    }
    if (y >= 0 && w.g[y][x] === 'J') mode = 2;
    const k = mode === 2 ? x + ',' + y + ',F' : x + ',' + y + ',' + mode + ',' + up + ',' + h2 + ',' + f;
    if (seen.has(k)) return;
    seen.add(k);
    cells.add(x + ',' + y);
    if (mode === 2) flyCells.add(x + ',' + y);
    q.push([x, y, mode, up, h2, f]);
  };
  const wp = w.warp;
  const down = (x, y, cb) => { // handles the bottom edge: warp pit or wrap to the top
    if (y + 1 >= H) {
      if (wp && wp.edge === 'bottom' && x >= wp.from && x <= wp.to) { warp = true; return; }
      cb(x, -1);
    } else if (pass(x, y + 1)) cb(x, y + 1);
  };
  if (startFly) push(sx, sy, 2, 0, 0, 0);
  else push(sx, sy, 1, 0, 0, 0);
  while (q.length) {
    const [x, y, mode, up, h2, f] = q.shift();
    if (wp && wp.edge === 'top' && y === -1 && x >= wp.from && x <= wp.to && mode === 2) warp = true;
    if (mode === 2) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1]]) if (pass(x + dx, y + dy)) push(x + dx, y + dy, 2, 0, 0, 0);
      down(x, y, (nx, ny) => push(nx, ny, 2, 0, 0, 0));
    } else if (mode === 0) {
      for (const dx of [1, -1]) {
        if (!pass(x + dx, y)) continue;
        if (supported(x + dx, y)) push(x + dx, y, 0, 0, 0, 0);
        else push(x + dx, y, 1, 0, 2, 0);
      }
      push(x, y, 1, 2, 6, 0); // jump
    } else {
      if (supported(x, y)) push(x, y, 0, 0, 0, 0);
      if (up > 0 && pass(x, y - 1)) push(x, y - 1, 1, up - 1, h2, 0);
      if (h2 >= 2) for (const dx of [1, -1]) if (pass(x + dx, y)) push(x + dx, y, 1, up, h2 - 2, f);
      if (!supported(x, y)) {
        const nf = Math.min(3, f + 1);
        const nh = nf >= 3 && f >= 2 ? Math.min(4, h2 + 1) : h2;
        down(x, y, (nx, ny) => push(nx, ny, 1, 0, nh, nf));
      }
    }
  }
  return { cells, flyCells, warp };
}

for (const id of DD.LEVEL_IDS) {
  const def = DD.LEVELS[id];
  let bad = false;
  def.screens.forEach((s, si) => {
    if (s.length !== 10) { err(id, 'screen ' + si + ' has ' + s.length + ' rows'); bad = true; }
    s.forEach((row, ri) => {
      if (row.length !== 20) { err(id, 'screen ' + si + ' row ' + ri + ' is ' + row.length + ' wide: ' + row); bad = true; }
      for (const ch of row) if (VALID.indexOf(ch) < 0) { err(id, 'bad tile "' + ch + '" in screen ' + si + ' row ' + ri); bad = true; }
    });
  });
  if (bad) continue;

  const built = DD.buildLevel(id);
  const flat = built.rows.join('');
  const count = ch => flat.split(ch).length - 1;
  if (count('@') !== 1) err(id, 'needs exactly one start, has ' + count('@'));
  if (count('E') !== 1) err(id, 'needs exactly one door, has ' + count('E'));
  const isWarp = id[0] === 'w';
  if (!isWarp && count('T') !== 1) err(id, 'needs exactly one trophy, has ' + count('T'));
  if (count('J') > 1) err(id, 'at most one jetpack');
  if (def.next !== null && !DD.LEVELS[def.next]) err(id, 'next level "' + def.next + '" does not exist');
  if (def.warp && !DD.LEVELS[def.warp.dest]) err(id, 'warp target "' + def.warp.dest + '" does not exist');

  const w = new DD.World(built);
  if (!w.solid(w.start.x, w.start.y + 1)) err(id, 'start is not on solid ground');

  const find = ch => { for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) if (w.g[y][x] === ch) return [x, y]; return null; };
  const r1 = search(w, w.start.x, w.start.y, false);
  let all = new Set(r1.cells), warp = r1.warp, doorSet = r1.cells;
  const t = find('T');
  if (t) {
    const tk = t[0] + ',' + t[1];
    if (!r1.cells.has(tk)) err(id, 'trophy at ' + tk + ' is unreachable');
    else {
      const r2 = search(w, t[0], t[1], r1.flyCells.has(tk));
      r2.cells.forEach(c => all.add(c));
      warp = warp || r2.warp;
      doorSet = r2.cells;
    }
  }
  const e = find('E');
  if (e && !doorSet.has(e[0] + ',' + e[1])) err(id, 'door at ' + e + ' is unreachable' + (t ? ' after the trophy' : ''));
  if (def.warp && !warp) err(id, 'warp exit (' + def.warp.edge + ') is unreachable');
  for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) {
    const c = w.g[y][x];
    if ((DD.POINTS[c] || c === 'G' || c === 'J') && !all.has(x + ',' + y)) warn(id, 'pickup "' + c + '" at ' + x + ',' + y + ' is unreachable');
  }
  console.log('ok     level ' + id + ' (' + w.w + 'x' + w.h + ', ' + w.enemies.length + ' enemies)');
}

console.log('\n' + errors + ' error(s), ' + warnings + ' warning(s)');
process.exit(errors ? 1 : 0);
