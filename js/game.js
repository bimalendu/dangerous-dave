// Game rules and state machine. No DOM access; rendering and sound react to this.events.
(function (DD) {
  'use strict';
  const T = 32;
  const WALK = 2.6, GRAV = 0.45, JUMP = 8.3, MAXFALL = 9, JETSPD = 2.6;
  const JUMP_BUFFER = 6;      // frames a jump press is remembered before landing
  const FUEL = 1200;          // frames of jetpack flight
  const PAGE = 15 * T;        // camera moves this far per page
  const VIEW = 20 * T;
  const KEYS = ['left', 'right', 'up', 'down', 'fire', 'jet', 'start', 'giveup'];

  function overlap(d, x, y, w, h) {
    return d.x < x + w && d.x + d.w > x && d.y < y + h && d.y + d.h > y;
  }

  class Game {
    constructor(opts) {
      opts = opts || {};
      this.hi = opts.hi || 0;
      this.onHi = opts.onHi || function () {};
      this.state = 'title';
      this.tick = 0;
      this.timer = 0;
      this.events = [];
      this.prev = {};
      this.seed = 20240917;
      this.score = 0;
      this.lives = 3;
      this.nextLife = 20000;
      this.world = null;
      this.dave = null;
      this.enemies = [];
      this.ebullets = [];
      this.shot = null;
      this.cam = 0; this.pcam = 0; this.camTarget = 0;
      this.msg = '';
    }

    rnd() {
      this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
      return this.seed / 4294967296;
    }

    emit(t, x, y, extra) {
      const e = { t: t, x: x, y: y };
      if (extra) for (const k in extra) e[k] = extra[k];
      this.events.push(e);
    }

    start(id) {
      this.score = 0;
      this.lives = 3;
      this.nextLife = 20000;
      this.loadLevel(id || '1');
    }

    loadLevel(id) {
      this.levelId = id;
      this.world = new DD.World(DD.buildLevel(id));
      this.hasTrophy = false;
      this.gun = false;
      this.hasJet = false;
      this.fuel = 0;
      this.enemies = this.world.enemies.map(e => DD.makeEnemy(e, this));
      this.spawn();
      this.state = 'play';
    }

    spawn() {
      const s = this.world.start;
      this.dave = {
        x: s.x * T + 7, y: s.y * T + 4, w: 18, h: 28,
        px: 0, py: 0, vy: 0, face: 1, onGround: true, jetOn: false, moving: false, jumpBuf: 0
      };
      this.dave.px = this.dave.x; this.dave.py = this.dave.y;
      this.shot = null;
      this.ebullets = [];
      for (const en of this.enemies) en.hasShot = false;
      const maxCam = this.world.w * T - VIEW;
      let c = 0;
      while (this.dave.x - c > 18 * T && c < maxCam) c = Math.min(maxCam, c + PAGE);
      this.cam = this.pcam = this.camTarget = c;
    }

    addScore(n) {
      this.score += n;
      while (this.score >= this.nextLife) {
        this.nextLife += 20000;
        this.lives++;
        this.emit('life', this.dave.x + 9, this.dave.y);
      }
    }

    saveHi() {
      if (this.score > this.hi) { this.hi = this.score; this.onHi(this.hi); }
    }

    die() {
      if (this.state !== 'play') return;
      this.state = 'dying';
      this.timer = 80;
      this.dave.jetOn = false;
      this.emit('die', this.dave.x + 9, this.dave.y + 14);
    }

    finishLevel() {
      this.state = 'clear';
      this.timer = 50;
      this.dave.jetOn = false;
      this.emit('door', this.dave.x + 9, this.dave.y + 14);
    }

    enterWarp() {
      this.emit('warp', this.dave.x + 9, this.dave.y + 14);
      this.state = 'interlude';
      this.timer = this.dur = 170;
      this.msg = 'YOU FOUND A WARP ZONE!';
      this.pendingId = this.world.warp.dest;
    }

    update(input) {
      const inp = input || {};
      const p = this.prev;
      const pressed = k => !!inp[k] && !p[k];
      this.tick++;
      switch (this.state) {
        case 'title':
          if (pressed('start')) this.start();
          break;
        case 'play':
          this.updatePlay(inp, pressed);
          break;
        case 'dying':
          this.pcam = this.cam;
          if (--this.timer <= 0) {
            this.lives--;
            if (this.lives <= 0) { this.state = 'gameover'; this.timer = 0; this.saveHi(); }
            else {
              this.spawn();
              if (this.hasJet) this.fuel = FUEL;
              this.state = 'play';
            }
          }
          break;
        case 'clear':
          this.pcam = this.cam;
          if (--this.timer <= 0) {
            const next = this.world.next;
            if (!next) { this.state = 'win'; this.timer = 0; this.saveHi(); }
            else {
              const left = 11 - parseInt(next, 10);
              this.state = 'interlude';
              this.timer = this.dur = 200;
              this.msg = left === 1 ? 'GOOD WORK! ONLY 1 MORE TO GO!' : 'GOOD WORK! ONLY ' + left + ' MORE TO GO!';
              this.pendingId = next;
            }
          }
          break;
        case 'interlude':
          if (--this.timer <= 0) this.loadLevel(this.pendingId);
          break;
        case 'gameover':
        case 'win':
          this.timer++;
          if (this.timer > 40 && pressed('start')) this.state = 'title';
          break;
      }
      const np = {};
      for (const k of KEYS) np[k] = !!inp[k];
      this.prev = np;
    }

    updatePlay(inp, pressed) {
      const d = this.dave, w = this.world;
      d.px = d.x; d.py = d.y;
      this.pcam = this.cam;

      if (pressed('giveup')) { this.die(); return; }

      // --- Dave ---
      if (pressed('jet') && this.hasJet && this.fuel > 0) {
        d.jetOn = !d.jetOn;
        d.vy = 0;
        this.emit('jet', d.x + 9, d.y + 20);
      }
      const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      if (dir) d.face = dir;
      d.moving = dir !== 0;

      if (d.jetOn) {
        const vd = (inp.down ? 1 : 0) - (inp.up ? 1 : 0);
        w.move(d, dir * JETSPD, vd * JETSPD);
        d.onGround = false;
        d.vy = 0;
        d.jumpBuf = 0; // "up" while flying must not become a jump when the pack switches off
        if (--this.fuel <= 0) {
          // Out of fuel: the jetpack goes back to where it was found.
          d.jetOn = false;
          this.hasJet = false;
          this.fuel = 0;
          if (w.jetPos) w.g[w.jetPos.y][w.jetPos.x] = 'J';
          this.emit('jetout', d.x + 9, d.y + 14);
        }
      } else {
        // One press, one jump: holding the key through a landing must not jump again.
        // A press just before touching down is remembered for a few frames.
        if (pressed('up')) d.jumpBuf = JUMP_BUFFER;
        else if (d.jumpBuf > 0) d.jumpBuf--;
        if (d.jumpBuf > 0 && d.onGround) {
          d.jumpBuf = 0;
          d.vy = -JUMP;
          this.emit('jump', d.x + 9, d.y + 28);
        }
        d.vy = Math.min(d.vy + GRAV, MAXFALL);
        const wasGround = d.onGround, vy = d.vy;
        const r = w.move(d, dir * WALK, d.vy);
        d.onGround = r.hitY && vy > 0;
        if (r.hitY) d.vy = 0;
        if (d.onGround && !wasGround && vy > 3) this.emit('land', d.x + 9, d.y + 28);
      }

      // --- Screen edges: warps, wrap, clamps ---
      const wp = w.warp;
      const col = Math.floor((d.x + d.w / 2) / T);
      if (d.y > w.h * T) {
        if (wp && wp.edge === 'bottom' && col >= wp.from && col <= wp.to) { this.enterWarp(); return; }
        d.y = -d.h; d.py = d.y; // falling out of the bottom brings Dave back in at the top
      }
      if (d.y < -12 && wp && wp.edge === 'top' && col >= wp.from && col <= wp.to) { this.enterWarp(); return; }
      if (d.y < -T) { d.y = -T; if (d.vy < 0) d.vy = 0; }
      if (wp && ((wp.edge === 'left' && d.x + d.w / 2 < 0) || (wp.edge === 'right' && d.x + d.w / 2 > w.w * T))) {
        this.enterWarp(); return;
      }

      // --- Tiles under Dave ---
      if (this.touchTiles()) return;

      // --- Shooting ---
      if (inp.fire && this.gun && !this.shot) {
        this.shot = { x: d.x + 9 + d.face * 12, y: d.y + 11, px: 0, vx: d.face * 8 };
        this.shot.px = this.shot.x;
        this.emit('shoot', this.shot.x, this.shot.y);
      }
      const s = this.shot;
      if (s) {
        s.px = s.x;
        s.x += s.vx;
        if (w.solid(Math.floor(s.x / T), Math.floor(s.y / T)) || s.x < this.cam - 16 || s.x > this.cam + VIEW + 16) {
          this.shot = null;
        } else {
          for (const en of this.enemies) {
            if (en.alive && Math.abs(s.x - en.x) < 17 && Math.abs(s.y - en.y) < 16) {
              en.alive = false;
              this.shot = null;
              this.addScore(300);
              this.emit('boom', en.x, en.y, { pts: 300 });
              break;
            }
          }
        }
      }

      // --- Enemies ---
      const dcx = d.x + 9, dcy = d.y + 14;
      for (const en of this.enemies) {
        if (!en.alive) continue;
        en.px = en.x; en.py = en.y;
        if (Math.abs(en.cx - (this.cam + VIEW / 2)) > VIEW / 2 + 4 * T) continue; // asleep off screen
        en.t++;
        DD.enemyPos(en);
        const onScreen = en.x > this.cam && en.x < this.cam + VIEW;
        if (--en.cool <= 0 && !en.hasShot && onScreen) {
          en.hasShot = true;
          en.cool = 100 + Math.floor(this.rnd() * 110);
          this.ebullets.push({ x: en.x, y: en.y, px: en.x, vx: (dcx < en.x ? -1 : 1) * 3.2, owner: en });
          this.emit('eshoot', en.x, en.y);
        }
        if (overlap(d, en.x - 11, en.y - 11, 22, 22)) {
          en.alive = false;
          this.emit('boom', en.x, en.y, { pts: 0 });
          this.die();
          return;
        }
      }
      for (let i = this.ebullets.length - 1; i >= 0; i--) {
        const b = this.ebullets[i];
        b.px = b.x;
        b.x += b.vx;
        const gone = w.solid(Math.floor(b.x / T), Math.floor(b.y / T)) || b.x < this.cam - 16 || b.x > this.cam + VIEW + 16;
        if (gone) { b.owner.hasShot = false; this.ebullets.splice(i, 1); continue; }
        if (Math.abs(b.x - dcx) < 11 && Math.abs(b.y - dcy) < 15) { this.die(); return; }
      }

      // --- Camera: pages across the level, eased ---
      const maxCam = w.w * T - VIEW;
      const sx = d.x + d.w / 2 - this.camTarget;
      if (sx > 18 * T && this.camTarget < maxCam) this.camTarget = Math.min(maxCam, this.camTarget + PAGE);
      else if (sx < 2 * T && this.camTarget > 0) this.camTarget = Math.max(0, this.camTarget - PAGE);
      this.cam += (this.camTarget - this.cam) * 0.1;
      if (Math.abs(this.camTarget - this.cam) < 0.5) this.cam = this.camTarget;
    }

    // Pickups, hazards and the door. Returns true if the play state ended.
    touchTiles() {
      const d = this.dave, w = this.world;
      const x0 = Math.floor(d.x / T), x1 = Math.floor((d.x + d.w - 0.01) / T);
      const y0 = Math.floor(d.y / T), y1 = Math.floor((d.y + d.h - 0.01) / T);
      for (let ty = y0; ty <= y1; ty++) {
        if (ty < 0 || ty >= w.h) continue;
        for (let tx = x0; tx <= x1; tx++) {
          if (tx < 0 || tx >= w.w) continue;
          const c = w.g[ty][tx];
          if (c === '.' || DD.SOLID.indexOf(c) >= 0) continue;
          const X = tx * T, Y = ty * T;
          if (DD.HAZARD.indexOf(c) >= 0) {
            if (overlap(d, X + 9, Y + 14, T - 18, T - 14)) { this.die(); return true; }
            continue;
          }
          if (!overlap(d, X + 6, Y + 6, T - 12, T - 12)) continue;
          const cx = X + 16, cy = Y + 16;
          if (DD.POINTS[c]) {
            w.g[ty][tx] = '.';
            this.addScore(DD.POINTS[c]);
            this.emit('pickup', cx, cy, { kind: c, pts: DD.POINTS[c] });
          } else if (c === 'T') {
            w.g[ty][tx] = '.';
            this.hasTrophy = true;
            this.addScore(1000);
            this.emit('trophy', cx, cy, { pts: 1000 });
          } else if (c === 'G') {
            w.g[ty][tx] = '.';
            this.gun = true;
            this.emit('power', cx, cy, { kind: c });
          } else if (c === 'J') {
            w.g[ty][tx] = '.';
            this.hasJet = true;
            this.fuel = FUEL;
            this.emit('power', cx, cy, { kind: c });
          } else if (c === 'E') {
            if (this.hasTrophy || !w.hasTrophy) { this.finishLevel(); return true; }
          }
        }
      }
      return false;
    }
  }

  DD.FUEL = FUEL;
  DD.Game = Game;
})(globalThis.DD = globalThis.DD || {});
