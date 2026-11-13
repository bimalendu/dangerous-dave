// Tile grid and collision. No DOM access, so this also runs under node.
(function (DD) {
  'use strict';
  const T = 32;
  DD.TILE = T;
  DD.VIEW_W = 20;
  DD.VIEW_H = 10;
  DD.SOLID = '#DSM';
  DD.HAZARD = 'FWV';
  DD.POINTS = { o: 50, d: 100, r: 150, i: 200, c: 300, w: 500 };

  class World {
    constructor(def) {
      this.id = def.id;
      this.theme = def.theme;
      this.next = def.next;
      this.warp = def.warp || null;
      this.h = def.rows.length;
      this.w = def.rows[0].length;
      this.g = def.rows.map(r => r.split(''));
      this.enemies = [];
      this.start = { x: 1, y: 8 };
      this.hasTrophy = false;
      this.jetPos = null;
      for (let y = 0; y < this.h; y++) {
        for (let x = 0; x < this.w; x++) {
          const c = this.g[y][x];
          if (c === '@') { this.start = { x: x, y: y }; this.g[y][x] = '.'; }
          else if ('1234'.indexOf(c) >= 0) { this.enemies.push({ type: +c, tx: x, ty: y }); this.g[y][x] = '.'; }
          else if (c === 'T') this.hasTrophy = true;
          else if (c === 'J') this.jetPos = { x: x, y: y };
        }
      }
    }

    // Outside the map: side walls are solid (except a warp opening), above and below are open.
    get(tx, ty) {
      if (tx < 0 || tx >= this.w) {
        const wp = this.warp;
        if (wp && ty >= wp.from && ty <= wp.to &&
            ((wp.edge === 'left' && tx < 0) || (wp.edge === 'right' && tx >= this.w))) return '.';
        return '#';
      }
      if (ty < 0 || ty >= this.h) return '.';
      return this.g[ty][tx];
    }

    solid(tx, ty) { return DD.SOLID.indexOf(this.get(tx, ty)) >= 0; }

    boxHits(x, y, w, h) {
      const x0 = Math.floor(x / T), x1 = Math.floor((x + w - 0.001) / T);
      const y0 = Math.floor(y / T), y1 = Math.floor((y + h - 0.001) / T);
      for (let ty = y0; ty <= y1; ty++)
        for (let tx = x0; tx <= x1; tx++)
          if (this.solid(tx, ty)) return true;
      return false;
    }

    // Moves box b by (dx, dy), one axis at a time, stopping at solid tiles.
    move(b, dx, dy) {
      let hitX = false, hitY = false;
      if (dx) {
        b.x += dx;
        if (this.boxHits(b.x, b.y, b.w, b.h)) {
          hitX = true;
          if (dx > 0) b.x = Math.floor((b.x + b.w - 0.001) / T) * T - b.w;
          else b.x = (Math.floor(b.x / T) + 1) * T;
        }
      }
      if (dy) {
        b.y += dy;
        if (this.boxHits(b.x, b.y, b.w, b.h)) {
          hitY = true;
          if (dy > 0) b.y = Math.floor((b.y + b.h - 0.001) / T) * T - b.h;
          else b.y = (Math.floor(b.y / T) + 1) * T;
        }
      }
      return { hitX: hitX, hitY: hitY };
    }
  }

  DD.World = World;
})(globalThis.DD = globalThis.DD || {});
