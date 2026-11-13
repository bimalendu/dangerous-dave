// Headless test of the game rules: runs every level with random input and asserts
// the main transitions (trophy, door, death, game over, warps, win, extra life, jetpack).
'use strict';
const path = require('path');
const assert = require('assert');
for (const f of ['levels.js', 'world.js', 'entities.js', 'game.js']) require(path.join(__dirname, '..', 'js', f));
const DD = globalThis.DD;
const T = DD.TILE;

const find = (w, ch) => { for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) if (w.g[y][x] === ch) return { x, y }; return null; };
const place = (g, tx, ty) => { const d = g.dave; d.x = tx * T + 7; d.y = ty * T + 4; d.vy = 0; };
const runUntil = (g, pred, max) => { for (let i = 0; i < (max || 2000); i++) { if (pred()) return true; g.update({}); g.events.length = 0; } return pred(); };
const STATES = ['title', 'play', 'dying', 'clear', 'interlude', 'gameover', 'win'];
let n = 0;
const test = (name, fn) => { fn(); n++; console.log('ok  ' + name); };

test('random input on every level', () => {
  let seed = 7;
  const r = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (const id of DD.LEVEL_IDS) {
    const g = new DD.Game();
    g.start(id);
    let inp = {};
    for (let i = 0; i < 4000; i++) {
      if (i % 20 === 0) inp = { left: r() < 0.3, right: r() < 0.6, up: r() < 0.5, down: r() < 0.2, fire: r() < 0.3, jet: r() < 0.2, start: r() < 0.1 };
      g.update(inp);
      g.events.length = 0;
      assert(STATES.includes(g.state), 'bad state ' + g.state);
      if (g.dave) assert(Number.isFinite(g.dave.x) && Number.isFinite(g.dave.y), 'bad position in level ' + id);
      if (g.state === 'title') g.start(id);
    }
  }
});

test('trophy then door leads to level 2', () => {
  const g = new DD.Game();
  g.start('1');
  const door = find(g.world, 'E'), t = find(g.world, 'T');
  place(g, door.x, door.y); g.update({});
  assert.strictEqual(g.state, 'play', 'door must stay shut without the trophy');
  place(g, t.x, t.y); g.update({});
  assert(g.hasTrophy); assert(g.score >= 1000);
  place(g, door.x, door.y); g.update({});
  assert.strictEqual(g.state, 'clear');
  assert(runUntil(g, () => g.state === 'interlude'));
  assert(/9 MORE/.test(g.msg), g.msg);
  assert(runUntil(g, () => g.state === 'play'));
  assert.strictEqual(g.levelId, '2');
});

test('hazard kills, three deaths end the game', () => {
  const g = new DD.Game({ onHi: v => { g.savedHi = v; } });
  g.start('2');
  g.addScore(500);
  for (let life = 3; life > 0; life--) {
    assert.strictEqual(g.lives, life);
    const f = find(g.world, 'F');
    place(g, f.x, f.y); g.update({});
    assert.strictEqual(g.state, 'dying');
    assert(runUntil(g, () => g.state !== 'dying'));
  }
  assert.strictEqual(g.state, 'gameover');
  assert.strictEqual(g.savedHi, 500);
  for (let i = 0; i < 50; i++) g.update({});
  g.update({ start: true });
  assert.strictEqual(g.state, 'title');
});

test('warp zones', () => {
  const cases = { '5': ['w1', '6'], '8': ['w2', '9'], '9': ['w3', '10'], '10': ['w4', '10'] };
  for (const id in cases) {
    const g = new DD.Game();
    g.start(id);
    const wp = g.world.warp, d = g.dave;
    if (wp.edge === 'top') { d.x = wp.from * T + 7; d.y = -20; g.hasJet = true; g.fuel = 100; d.jetOn = true; }
    else if (wp.edge === 'bottom') { d.x = wp.from * T + 7; d.y = g.world.h * T - 20; }
    else if (wp.edge === 'right') { d.x = g.world.w * T - 20; d.y = wp.from * T + 4; }
    else { d.x = 2; d.y = wp.from * T + 4; }
    const hold = wp.edge === 'right' ? { right: true } : wp.edge === 'left' ? { left: true } : {};
    for (let i = 0; i < 120 && g.state === 'play'; i++) g.update(hold);
    assert.strictEqual(g.state, 'interlude', 'warp from level ' + id + ' did not trigger');
    assert(runUntil(g, () => g.state === 'play'));
    assert.strictEqual(g.levelId, cases[id][0]);
    const door = find(g.world, 'E');
    place(g, door.x, door.y); g.update({});
    assert.strictEqual(g.state, 'clear', 'warp zone door should be open');
    assert(runUntil(g, () => g.state === 'play'));
    assert.strictEqual(g.levelId, cases[id][1]);
  }
});

test('falling out of the bottom wraps to the top', () => {
  const g = new DD.Game();
  g.start('9');
  g.dave.x = 3 * T + 7; g.dave.y = 8 * T + 4; // over the pit beside the start
  let wrapped = false;
  for (let i = 0; i < 200; i++) { g.update({}); if (g.dave.y < 0) wrapped = true; }
  assert(wrapped);
  assert.strictEqual(g.state, 'play');
  assert(g.dave.onGround && Math.floor(g.dave.y / T) === 6, 'should land on the gun ledge');
});

test('finishing level 10 wins', () => {
  const g = new DD.Game();
  g.start('10');
  g.hasTrophy = true;
  const door = find(g.world, 'E');
  place(g, door.x, door.y); g.update({});
  assert(runUntil(g, () => g.state === 'win'));
});

test('extra life at 20,000', () => {
  const g = new DD.Game();
  g.start('1');
  g.addScore(19999); assert.strictEqual(g.lives, 3);
  g.addScore(1); assert.strictEqual(g.lives, 4);
});

test('jetpack flies, runs dry and reappears', () => {
  const g = new DD.Game();
  g.start('4');
  const j = find(g.world, 'J');
  place(g, j.x, j.y); g.update({});
  assert(g.hasJet); assert.strictEqual(find(g.world, 'J'), null);
  g.update({ jet: true });
  assert(g.dave.jetOn);
  const y0 = g.dave.y;
  for (let i = 0; i < 10; i++) g.update({ jet: true, up: true });
  for (let i = 0; i < 40; i++) g.update({ jet: true, right: true }); // move clear of where the pack respawns
  assert(g.dave.y < y0, 'should climb');
  const y1 = g.dave.y;
  for (let i = 0; i < 30; i++) g.update({ jet: true });
  assert.strictEqual(g.dave.y, y1, 'should hover');
  for (let i = 0; i < DD.FUEL; i++) g.update({ jet: true });
  assert(!g.hasJet && !g.dave.jetOn);
  assert(find(g.world, 'J'), 'jetpack should be back');
});

test('gun kills an enemy', () => {
  const g = new DD.Game();
  g.start('3');
  g.gun = true;
  const en = g.enemies[0];
  g.dave.x = en.x - 60; g.dave.y = en.y - 11; g.dave.face = 1;
  g.hasJet = true; g.fuel = 500; g.dave.jetOn = true;
  for (let i = 0; i < 40 && en.alive; i++) { g.dave.y = en.y - 11; g.update({ fire: true }); }
  assert(!en.alive); assert.strictEqual(g.score, 300);
});

test('one press gives one jump, with a short buffer before landing', () => {
  const g = new DD.Game();
  g.start('1');
  const d = g.dave;
  let jumps = 0;
  const step = inp => { g.update(inp); jumps += g.events.filter(e => e.t === 'jump').length; g.events.length = 0; };
  const settle = () => { for (let i = 0; i < 200 && !(d.onGround && d.jumpBuf === 0); i++) step({}); assert(d.onGround); };
  // Stand on a floor tile with four clear tiles overhead, so a full jump fits.
  const w = g.world;
  const clear = (x, y) => w.get(x, y) === '.';
  let spot = null;
  for (let y = w.h - 2; y >= 3 && !spot; y--)
    for (let x = 0; x < w.w && !spot; x++)
      if (w.solid(x, y + 1) && [0, 1, 2, 3].every(k => clear(x, y - k))) spot = { x, y };
  assert(spot, 'no open floor in level 1');
  place(g, spot.x, spot.y);
  settle();

  // Holding the key through the landing must not start a second jump.
  jumps = 0;
  for (let i = 0; i < 200; i++) step({ up: true });
  assert.strictEqual(jumps, 1, 'held key jumped ' + jumps + ' times');
  assert(d.onGround, 'should be back on the ground');
  step({});
  step({ up: true });
  assert.strictEqual(jumps, 2, 'a fresh press should jump again');

  // Measure how long a jump stays in the air here.
  settle();
  step({ up: true });
  let air = 0;
  while (!d.onGround && air < 200) { step({}); air++; }
  assert(air > 25, 'jump too short to test the buffer: ' + air);

  // A press 3 frames before landing is remembered.
  settle(); jumps = 0;
  step({ up: true });
  for (let i = 0; i < air - 3; i++) step({});
  assert(!d.onGround);
  step({ up: true });
  for (let i = 0; i < 6; i++) step({});
  assert.strictEqual(jumps, 2, 'buffered press should jump on landing');

  // A press 20 frames before landing is forgotten.
  settle(); jumps = 0;
  step({ up: true });
  for (let i = 0; i < air - 20; i++) step({});
  step({ up: true });
  for (let i = 0; i < 40; i++) step({});
  assert.strictEqual(jumps, 1, 'an early press should not be remembered');

  // "Up" used for flying does not turn into a jump when the jetpack is switched off.
  settle(); jumps = 0;
  g.hasJet = true; g.fuel = 500;
  step({ jet: true });
  assert(d.jetOn);
  step({ up: true });
  step({ up: true });
  step({ up: true, jet: false });
  step({ up: true, jet: true });
  assert(!d.jetOn);
  for (let i = 0; i < 60; i++) step({ up: true });
  assert.strictEqual(jumps, 0, 'no jump after switching the jetpack off with up held');
});

console.log('\n' + n + ' tests passed');
