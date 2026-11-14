// Measures how precise jumps must be on the route to each level's trophy, door and jetpack.
// validate-levels.js proves a level can be finished under a loose jump model. This tool uses the
// real jump arc and reports the margin, which is where a level feels unfair.
//
// A "window" is the range of takeoff positions on one platform that still lands on the next one.
// A narrow window means the player has to be pixel-precise. Walking and jumping only: flight,
// warps and fuel are not modelled.
//
// Usage: node tools/difficulty.js [--min=12] [levelId ...]
// Exits non-zero if a hop on a walking route to the trophy, door or jetpack is narrower than --min.
'use strict';
const path = require('path');
const js = f => path.join(__dirname, '..', 'js', f);
require(js('levels.js'));
require(js('world.js'));
const DD = globalThis.DD;

// Physics constants. Keep in sync with js/game.js (lines 4-5, 72 and 214).
const T = 32, WALK = 2.6, GRAV = 0.45, JUMP = 8.3, MAXFALL = 9;
const BOX_W = 18, BOX_H = 28;
const TICKS = 140;

const minArg = process.argv.find(a => a.startsWith('--min='));
const MIN = minArg ? +minArg.slice(6) : 12;
const named = process.argv.slice(2).filter(a => !a.startsWith('--'));
const IDS = named.length ? named : DD.LEVEL_IDS;

// Jump patterns: horizontal input for the first t1 frames (d1), then d2.
const PATTERNS = [];
for (const d1 of [-1, 0, 1]) for (let t1 = 0; t1 <= 45; t1 += 3) for (const d2 of [-1, 0, 1]) PATTERNS.push([d1, t1, d2]);

function overlap(d, x, y, w, h) {
  return d.x < x + w && d.x + d.w > x && d.y < y + h && d.y + d.h > y;
}

// Same tile rules as Game.touchTiles. Returns true if a hazard kills Dave; adds tiles he touches to `hits`.
function scan(w, d, hits) {
  const x0 = Math.floor(d.x / T), x1 = Math.floor((d.x + d.w - 0.01) / T);
  const y0 = Math.floor(d.y / T), y1 = Math.floor((d.y + d.h - 0.01) / T);
  for (let ty = Math.max(0, y0); ty <= Math.min(w.h - 1, y1); ty++) {
    for (let tx = Math.max(0, x0); tx <= Math.min(w.w - 1, x1); tx++) {
      const c = w.g[ty][tx];
      if (c === '.' || DD.SOLID.indexOf(c) >= 0) continue;
      if (DD.HAZARD.indexOf(c) >= 0) {
        if (overlap(d, tx * T + 9, ty * T + 14, T - 18, T - 14)) return true;
        continue;
      }
      if (overlap(d, tx * T + 6, ty * T + 6, T - 12, T - 12)) hits.add(c + ' ' + tx + ',' + ty);
    }
  }
  return false;
}

// One jump, or a walk-off if jump is false. Returns the landing box, or null if Dave dies or never lands.
function fly(w, from, jump, [d1, t1, d2]) {
  const d = { x: from.x, y: from.y, w: BOX_W, h: BOX_H };
  let vy = jump ? -JUMP : 0;
  for (let t = 0; t < TICKS; t++) {
    const dir = t < t1 ? d1 : d2;
    vy = Math.min(vy + GRAV, MAXFALL);
    const falling = vy;
    const r = w.move(d, dir * WALK, vy);
    if (r.hitY) vy = 0;
    if (d.y > w.h * T) d.y = -d.h; // falling off the bottom wraps to the top
    if (d.y < -T) { d.y = -T; if (vy < 0) vy = 0; }
    if (scan(w, d, new Set())) return null;
    if (r.hitY && falling > 0) return d;
  }
  return null;
}

// A platform is the run of floor tiles at one height under a standing box, e.g. "r8 c1-3".
function platformOf(w, d) {
  const row = Math.floor((d.y + d.h - 0.01) / T);
  const ok = x => w.solid(x, row + 1) && !w.solid(x, row) && DD.HAZARD.indexOf(w.get(x, row)) < 0;
  const x0 = Math.floor(d.x / T), x1 = Math.floor((d.x + BOX_W - 0.01) / T);
  let c = x0;
  while (c < x1 && !ok(c)) c++; // leftmost tile under the box that supports it
  let a = c, b = c;
  while (ok(a - 1)) a--;
  while (ok(b + 1)) b++;
  return { id: 'r' + row + ' c' + a + '-' + b, row, a, b };
}

function analyse(id) {
  const w = new DD.World(DD.buildLevel(id));
  const nodes = new Map();   // standing position (2px buckets) -> { box, plat }
  const queue = [];
  const edges = new Map();   // "from > to" -> { from, to, takeoffs: Set of 2px buckets }
  const itemPlat = new Map();// "T 53,3" -> platform the player can stand on to touch it
  const keyOf = d => Math.floor((d.y + d.h - 0.01) / T) + ',' + Math.round(d.x / 2);
  const visit = box => {
    if (box.x < 0 || box.x > w.w * T - BOX_W) return;
    const k = keyOf(box);
    if (nodes.has(k)) return;
    nodes.set(k, { box: { ...box }, plat: platformOf(w, box) });
    queue.push(k);
  };

  const start = { x: w.start.x * T + 7, y: w.start.y * T + 4, w: BOX_W, h: BOX_H };
  visit(start);
  for (let i = 0; i < queue.length; i++) {
    const n = nodes.get(queue[i]);

    const here = new Set();
    scan(w, n.box, here);
    for (const h of here) if (!itemPlat.has(h)) itemPlat.set(h, n.plat);

    for (const dx of [-2, 2]) { // walk one step
      const d = { ...n.box };
      w.move(d, dx, 0);
      if (Math.abs(d.x - n.box.x) < 0.5) continue;
      if (!w.boxHits(d.x, d.y + 1, BOX_W, BOX_H)) continue;
      if (scan(w, d, new Set())) continue;
      visit(d);
    }

    for (const jump of [true, false]) for (const pat of PATTERNS) {
      if (!jump && pat[0] === 0 && pat[1] > 0) continue;
      const land = fly(w, n.box, jump, pat);
      if (!land) continue;
      const to = platformOf(w, land);
      visit(land);
      if (to.id === n.plat.id) continue;
      const ek = n.plat.id + ' > ' + to.id;
      let e = edges.get(ek);
      if (!e) { e = { from: n.plat, to, takeoffs: new Set() }; edges.set(ek, e); }
      e.takeoffs.add(Math.round(n.box.x / 2));
    }
  }

  // Widest path from the start: maximise the narrowest window along the way.
  const adj = new Map();
  for (const e of edges.values()) {
    if (!adj.has(e.from.id)) adj.set(e.from.id, []);
    adj.get(e.from.id).push(e);
  }
  const startPlat = platformOf(w, start);
  const best = new Map([[startPlat.id, { cap: Infinity, prev: null, edge: null }]]);
  const open = [startPlat.id];
  while (open.length) {
    open.sort((a, b) => best.get(b).cap - best.get(a).cap);
    const p = open.shift();
    for (const e of adj.get(p) || []) {
      const cap = Math.min(best.get(p).cap, e.takeoffs.size * 2);
      const cur = best.get(e.to.id);
      if (!cur || cur.cap < cap) { best.set(e.to.id, { cap, prev: p, edge: e }); open.push(e.to.id); }
    }
  }

  return { w, itemPlat, best };
}

let failed = 0;
for (const id of IDS) {
  const { w, itemPlat, best } = analyse(id);
  const parts = [];
  const weak = [];
  for (const ch of ['T', 'E', 'J']) {
    if (!w.g.some(row => row.indexOf(ch) >= 0)) continue;
    const key = [...itemPlat.keys()].find(k => k.startsWith(ch + ' '));
    const plat = key && itemPlat.get(key);
    const name = { T: 'trophy', E: 'door', J: 'jetpack' }[ch];
    if (!plat || !best.has(plat.id)) { parts.push(name + ': not on foot'); continue; }
    const hops = [];
    for (let p = plat.id; best.get(p).prev; p = best.get(p).prev) hops.unshift(best.get(p).edge);
    const narrow = hops.length ? Math.min(...hops.map(e => e.takeoffs.size * 2)) : Infinity;
    parts.push(name + ': ' + (narrow === Infinity ? 'no jump' : 'narrowest ' + narrow + 'px'));
    for (const e of hops) if (e.takeoffs.size * 2 < MIN) weak.push('    ' + (e.takeoffs.size * 2) + 'px  ' + e.from.id + ' -> ' + e.to.id + '  (to ' + name + ')');
  }
  if (weak.length) failed++;
  console.log('L' + id.padEnd(3) + parts.join(' | ') + (weak.length ? '' : '  ok'));
  for (const line of [...new Set(weak)]) console.log(line);
}
console.log('\n' + (failed ? failed + ' level(s) have a hop narrower than ' + MIN + 'px' : 'all routes have hops of at least ' + MIN + 'px'));
process.exit(failed ? 1 : 0);
