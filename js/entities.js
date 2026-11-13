// Enemies fly fixed looping paths around their spawn point, ignoring walls, as in the original.
(function (DD) {
  'use strict';
  const T = 32;

  DD.makeEnemy = function (e, game) {
    const en = {
      type: e.type,
      cx: e.tx * T + 16, cy: e.ty * T + 16,
      x: 0, y: 0, px: 0, py: 0,
      t: Math.floor(game.rnd() * 200),
      cool: 60 + Math.floor(game.rnd() * 120),
      alive: true, hasShot: false
    };
    DD.enemyPos(en);
    en.px = en.x; en.py = en.y;
    return en;
  };

  DD.enemyPos = function (en) {
    const t = en.t / 60;
    switch (en.type) {
      case 1: // spider: bobs on its thread
        en.x = en.cx; en.y = en.cy + Math.sin(t * 1.6) * T * 1.4; break;
      case 2: // eye: circles
        en.x = en.cx + Math.cos(t * 1.8) * T * 1.4; en.y = en.cy + Math.sin(t * 1.8) * T * 1.4; break;
      case 3: // bat: figure of eight
        en.x = en.cx + Math.sin(t * 1.5) * T * 2.2; en.y = en.cy + Math.sin(t * 3) * T * 0.8; break;
      default: // saucer: wide patrol
        en.x = en.cx + Math.sin(t * 1.1) * T * 3; en.y = en.cy + Math.sin(t * 4.2) * 4;
    }
  };
})(globalThis.DD = globalThis.DD || {});
