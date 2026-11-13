// All art is drawn in code. Static pieces are pre-rendered to small canvases at start-up;
// animated pieces (Dave, enemies, fire, water, weeds) are drawn live each frame.
(function (DD) {
  'use strict';
  const TAU = Math.PI * 2;

  function rr(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  }
  function circle(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.closePath(); }
  function poly(c, pts) {
    c.beginPath();
    c.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
    c.closePath();
  }
  function grad(c, x0, y0, x1, y1, stops) {
    const g = c.createLinearGradient(x0, y0, x1, y1);
    for (let i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]);
    return g;
  }
  function rgrad(c, x, y, r0, r1, stops) {
    const g = c.createRadialGradient(x, y, r0, x, y, r1);
    for (let i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]);
    return g;
  }
  function rng(seed) {
    let s = seed >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  function sprite(S, w, h, draw) {
    const cv = document.createElement('canvas');
    cv.width = w * S; cv.height = h * S;
    const c = cv.getContext('2d');
    c.scale(S, S);
    draw(c);
    return cv;
  }

  // ---------- solid tiles ----------
  function brick(c, v) {
    c.fillStyle = '#3d1518'; c.fillRect(0, 0, 32, 32);
    const tints = v ? ['#c2523e', '#b24636', '#cc5d45'] : ['#b94a39', '#c7573f', '#ab4234'];
    for (let row = 0; row < 4; row++) {
      const off = row % 2 ? 8 : 0;
      for (let x = -16 + off; x < 32; x += 16) {
        const y = row * 8;
        c.fillStyle = tints[(row + ((x + 32) / 8 | 0)) % 3];
        rr(c, x + 0.8, y + 0.8, 14.4, 6.4, 1.4); c.fill();
        c.fillStyle = 'rgba(255,225,200,0.22)'; c.fillRect(x + 2, y + 1.2, 12, 1.1);
        c.fillStyle = 'rgba(40,0,10,0.25)'; c.fillRect(x + 2, y + 5.6, 12, 1.2);
      }
    }
  }
  function dirt(c, v) {
    c.fillStyle = grad(c, 0, 0, 0, 32, [0, '#8f5d36', 1, '#6a4126']); c.fillRect(0, 0, 32, 32);
    const r = rng(91 + v * 17);
    for (let i = 0; i < 16; i++) {
      c.fillStyle = r() < 0.5 ? 'rgba(50,28,12,0.45)' : 'rgba(190,140,90,0.35)';
      c.beginPath(); c.ellipse(2 + r() * 28, 2 + r() * 28, 1 + r() * 2.4, 0.8 + r() * 1.6, r() * 3, 0, TAU); c.fill();
    }
    c.fillStyle = 'rgba(120,120,120,0.55)';
    for (let i = 0; i < 2; i++) { c.beginPath(); c.ellipse(5 + r() * 22, 6 + r() * 20, 2.6, 1.8, r() * 3, 0, TAU); c.fill(); }
  }
  function grass(c) {
    c.fillStyle = grad(c, 0, 2, 0, 12, [0, '#8be05a', 1, '#2f8f3a']);
    c.beginPath(); c.moveTo(0, 12); c.lineTo(0, 6);
    for (let x = 0; x < 32; x += 4) { c.quadraticCurveTo(x + 1, 1 + (x % 8 ? 2 : 0), x + 2, 5); c.quadraticCurveTo(x + 3, 7, x + 4, 6); }
    c.lineTo(32, 12); c.closePath(); c.fill();
    c.fillStyle = 'rgba(20,70,30,0.5)'; c.fillRect(0, 10, 32, 2);
  }
  function stone(c, v) {
    c.fillStyle = '#23283f'; c.fillRect(0, 0, 32, 32);
    const blocks = v ? [[1, 1, 30, 14], [1, 17, 14, 14], [17, 17, 14, 14]] : [[1, 1, 30, 30]];
    for (const b of blocks) {
      c.fillStyle = grad(c, 0, b[1], 0, b[1] + b[3], [0, '#8794bd', 1, '#555f8a']);
      rr(c, b[0], b[1], b[2], b[3], 3.5); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.22)'; rr(c, b[0] + 1.5, b[1] + 1.2, b[2] - 3, 1.6, 0.8); c.fill();
      c.fillStyle = 'rgba(10,12,40,0.25)'; rr(c, b[0] + 1.5, b[1] + b[3] - 2.8, b[2] - 3, 1.8, 0.8); c.fill();
    }
    c.strokeStyle = 'rgba(30,34,60,0.55)'; c.lineWidth = 0.9; c.lineCap = 'round';
    c.beginPath();
    if (v) { c.moveTo(8, 4); c.lineTo(11, 8); c.lineTo(9, 12); }
    else { c.moveTo(20, 5); c.lineTo(17, 11); c.lineTo(21, 15); c.lineTo(19, 21); c.moveTo(7, 20); c.lineTo(10, 25); }
    c.stroke();
  }
  function metal(c, v) {
    c.fillStyle = grad(c, 0, 0, 32, 32, [0, '#6f929b', 1, '#3b535c']); c.fillRect(0, 0, 32, 32);
    c.fillStyle = 'rgba(255,255,255,0.22)'; c.fillRect(0, 0, 32, 1.5); c.fillRect(0, 0, 1.5, 32);
    c.fillStyle = 'rgba(0,10,20,0.35)'; c.fillRect(0, 30.5, 32, 1.5); c.fillRect(30.5, 0, 1.5, 32);
    c.fillStyle = grad(c, 0, 5, 0, 27, [0, '#7fa3ab', 1, '#527079']);
    rr(c, 5, 5, 22, 22, 2.5); c.fill();
    if (v) {
      c.strokeStyle = 'rgba(20,40,50,0.4)'; c.lineWidth = 1.2;
      c.beginPath(); for (let i = 9; i <= 23; i += 4.6) { c.moveTo(8, i); c.lineTo(24, i); } c.stroke();
    } else {
      c.fillStyle = 'rgba(255,255,255,0.14)'; poly(c, [7, 7, 18, 7, 7, 18]); c.fill();
    }
    for (const p of [[2.8, 2.8], [29.2, 2.8], [2.8, 29.2], [29.2, 29.2]]) {
      c.fillStyle = '#2c4048'; circle(c, p[0], p[1], 1.5); c.fill();
      c.fillStyle = '#b9d3d8'; circle(c, p[0] - 0.4, p[1] - 0.4, 0.6); c.fill();
    }
  }

  // ---------- pickups (32x32, centred) ----------
  const ITEMS = {
    d: function (c) { // diamond
      c.fillStyle = grad(c, 6, 8, 26, 26, [0, '#d6fbff', 0.5, '#4fd2f5', 1, '#1583c9']);
      poly(c, [10, 9, 22, 9, 27, 15, 16, 27, 5, 15]); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 0.8;
      c.beginPath(); c.moveTo(5, 15); c.lineTo(27, 15); c.moveTo(10, 9); c.lineTo(13, 15); c.lineTo(16, 27); c.lineTo(19, 15); c.lineTo(22, 9); c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.7)'; poly(c, [11, 10, 15, 10, 13, 14]); c.fill();
    },
    o: function (c) { // orb
      c.fillStyle = rgrad(c, 13, 13, 1, 11, [0, '#f1d2ff', 0.45, '#b45cf0', 1, '#5a1c96']);
      circle(c, 16, 17, 9); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.75)'; c.beginPath(); c.ellipse(12.5, 13, 3, 2, -0.6, 0, TAU); c.fill();
    },
    r: function (c) { // ruby
      c.fillStyle = grad(c, 6, 8, 26, 27, [0, '#ffb3b8', 0.45, '#f03a4d', 1, '#9c1027']);
      poly(c, [11, 8, 21, 8, 27, 14, 27, 20, 21, 26, 11, 26, 5, 20, 5, 14]); c.fill();
      c.strokeStyle = 'rgba(255,220,220,0.7)'; c.lineWidth = 0.8;
      poly(c, [12.5, 12, 19.5, 12, 23, 15.5, 23, 18.5, 19.5, 22, 12.5, 22, 9, 18.5, 9, 15.5]); c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.6)'; poly(c, [11, 9, 16, 9, 12, 13, 8, 14]); c.fill();
    },
    i: function (c) { // ring
      c.strokeStyle = grad(c, 8, 12, 24, 28, [0, '#fff0a0', 0.5, '#f2b62a', 1, '#a86a08']);
      c.lineWidth = 3.6; c.beginPath(); c.arc(16, 20, 6.5, 0, TAU); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 0.9; c.beginPath(); c.arc(16, 20, 7.6, 3.6, 4.8); c.stroke();
      c.fillStyle = grad(c, 12, 5, 20, 13, [0, '#d6fbff', 1, '#2aa6e6']);
      poly(c, [16, 5, 20.5, 9.5, 16, 14, 11.5, 9.5]); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.8)'; poly(c, [16, 6.5, 18, 9, 14.5, 9]); c.fill();
    },
    c: function (c) { // crown
      c.fillStyle = grad(c, 0, 7, 0, 26, [0, '#fff3a6', 0.5, '#f5bd2e', 1, '#b3720b']);
      poly(c, [6, 25, 5, 11, 11, 17, 16, 7, 21, 17, 27, 11, 26, 25]); c.fill();
      c.fillStyle = '#c98512'; rr(c, 6, 21.5, 20, 4, 1.2); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.45)'; c.fillRect(7, 22, 18, 0.9);
      const j = [['#f03a4d', 16, 23.6], ['#3fc8f2', 10.5, 23.6], ['#3fc8f2', 21.5, 23.6]];
      for (const k of j) { c.fillStyle = k[0]; circle(c, k[1], k[2], 1.5); c.fill(); }
      c.fillStyle = '#fff6c4';
      for (const p of [[5, 11], [16, 7], [27, 11]]) { circle(c, p[0], p[1], 1.7); c.fill(); }
    },
    w: function (c) { // wand
      c.strokeStyle = '#3a2a55'; c.lineWidth = 4.2; c.lineCap = 'round';
      c.beginPath(); c.moveTo(8, 26); c.lineTo(19, 13); c.stroke();
      c.strokeStyle = '#efe6ff'; c.lineWidth = 2.4;
      c.beginPath(); c.moveTo(8, 26); c.lineTo(19, 13); c.stroke();
      c.fillStyle = rgrad(c, 21, 10, 0, 9, [0, 'rgba(255,250,200,0.9)', 1, 'rgba(255,220,90,0)']);
      circle(c, 21, 10, 9); c.fill();
      c.fillStyle = grad(c, 14, 3, 28, 17, [0, '#ffffff', 1, '#ffd23e']);
      c.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 2.8 : 6.6;
        c.lineTo(21 + Math.cos(a) * r, 10 + Math.sin(a) * r);
      }
      c.closePath(); c.fill();
    },
    T: function (c) { // trophy
      const g = grad(c, 7, 0, 25, 0, [0, '#c98a12', 0.35, '#fff1a0', 0.7, '#f3b927', 1, '#a86a08']);
      c.strokeStyle = g; c.lineWidth = 2.2;
      c.beginPath(); c.arc(8.5, 11, 4, 1.2, 5.2); c.stroke();
      c.beginPath(); c.arc(23.5, 11, 4, -2.05, 1.95); c.stroke();
      c.fillStyle = g;
      c.beginPath(); c.moveTo(8, 5); c.lineTo(24, 5); c.quadraticCurveTo(24, 19, 16, 20.5); c.quadraticCurveTo(8, 19, 8, 5); c.closePath(); c.fill();
      c.fillRect(14.6, 19.5, 2.8, 4.5);
      rr(c, 10, 23.5, 12, 3, 1); c.fill();
      c.fillStyle = '#7a4d0a'; rr(c, 8.5, 26, 15, 3.4, 1); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.65)'; rr(c, 10.5, 6.5, 2.2, 9, 1); c.fill();
    },
    G: function (c) { // gun
      c.fillStyle = '#20242c'; poly(c, [9, 15, 16, 15, 14.5, 26, 8.5, 26]); c.fill();
      c.fillStyle = '#6b4a2a'; poly(c, [10, 17, 14.8, 17, 13.8, 25, 9.6, 25]); c.fill();
      c.fillStyle = grad(c, 0, 9, 0, 17, [0, '#c8d2dc', 0.5, '#7c8794', 1, '#3f4853']);
      rr(c, 6, 9.5, 21, 7, 1.8); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.55)'; c.fillRect(8, 10.6, 17, 1);
      c.fillStyle = '#20242c'; c.fillRect(24.5, 8, 1.6, 2); c.fillRect(26.5, 11.5, 1.5, 2.6);
      c.strokeStyle = '#20242c'; c.lineWidth = 1.3; c.beginPath(); c.arc(18, 17, 3, 0, Math.PI); c.stroke();
    },
    J: function (c) { // jetpack
      c.fillStyle = '#3a3f4a'; rr(c, 12, 9, 8, 12, 1.5); c.fill();
      for (const x of [7, 17.5]) {
        c.fillStyle = grad(c, x, 0, x + 7.5, 0, [0, '#eef3f7', 0.5, '#aab6c1', 1, '#5d6975']);
        rr(c, x, 5, 7.5, 18, 3.6); c.fill();
        c.fillStyle = '#d83a34'; c.fillRect(x, 9, 7.5, 2.4);
        c.fillStyle = '#2b3038'; poly(c, [x + 1.5, 23, x + 6, 23, x + 7, 27, x + 0.5, 27]); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.6)'; rr(c, x + 1.3, 6.5, 1.4, 14, 0.7); c.fill();
      }
    }
  };

  // Door: 32 wide, 40 tall, standing on the floor. v=1 is open and glowing.
  function door(c, v) {
    c.fillStyle = grad(c, 0, 0, 0, 40, [0, '#6a6f86', 1, '#3b3f55']);
    c.beginPath(); c.moveTo(2, 40); c.lineTo(2, 14); c.quadraticCurveTo(2, 1, 16, 1); c.quadraticCurveTo(30, 1, 30, 14); c.lineTo(30, 40); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(6, 40); c.lineTo(6, 15); c.quadraticCurveTo(6, 5, 16, 5); c.quadraticCurveTo(26, 5, 26, 15); c.lineTo(26, 40); c.closePath();
    if (v) {
      c.fillStyle = grad(c, 0, 5, 0, 40, [0, '#fffbe0', 0.6, '#ffe27a', 1, '#f5a623']); c.fill();
      c.fillStyle = '#6b3f1c'; poly(c, [6, 40, 6, 14, 10, 17, 10, 40]); c.fill();
    } else {
      c.fillStyle = grad(c, 6, 0, 26, 0, [0, '#8a5327', 0.5, '#a9682f', 1, '#6e3f1b']); c.fill();
      c.strokeStyle = 'rgba(40,18,4,0.55)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(11, 7.5); c.lineTo(11, 40); c.moveTo(16, 5); c.lineTo(16, 40); c.moveTo(21, 7.5); c.lineTo(21, 40); c.stroke();
      c.fillStyle = '#3b3f55'; c.fillRect(6, 15, 20, 2.2); c.fillRect(6, 31, 20, 2.2);
      c.fillStyle = '#ffd34d'; circle(c, 22.5, 24, 1.7); c.fill();
    }
    c.strokeStyle = 'rgba(255,255,255,0.22)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(3, 14); c.quadraticCurveTo(3, 2, 16, 2); c.stroke();
  }

  DD.Sprites = {
    build: function (S) {
      const tiles = {};
      const makers = { '#': brick, D: dirt, S: stone, M: metal };
      for (const k in makers) tiles[k] = [0, 1].map(v => sprite(S, 32, 32, c => makers[k](c, v)));
      const items = {};
      for (const k in ITEMS) items[k] = sprite(S, 32, 32, ITEMS[k]);
      return {
        tiles: tiles, items: items,
        grass: sprite(S, 32, 12, grass),
        door: [sprite(S, 32, 40, c => door(c, 0)), sprite(S, 32, 40, c => door(c, 1))]
      };
    }
  };

  // ---------- live drawing ----------
  const Draw = { rr: rr, circle: circle, grad: grad, rgrad: rgrad, rng: rng };

  // o: {x, y (feet), face, run (phase), moving, air, jet, jetOn, gun, sx, sy}
  Draw.dave = function (c, o) {
    c.save();
    c.translate(o.x, o.y);
    c.scale(o.face * 0.86 * (o.sx || 1), 0.86 * (o.sy || 1));
    const sw = o.air ? 0.55 : (o.moving ? Math.sin(o.run) * 0.8 : 0);
    if (o.jet) {
      c.fillStyle = grad(c, -12, 0, -6, 0, [0, '#eef3f7', 1, '#6c7884']);
      rr(c, -12, -25, 6.5, 14, 2.6); c.fill();
      c.fillStyle = '#d83a34'; c.fillRect(-12, -22, 6.5, 2);
      c.fillStyle = '#2b3038'; c.fillRect(-11, -11.5, 4.5, 2.5);
    }
    const leg = function (a, col) {
      c.save(); c.translate(0, -11); c.rotate(a);
      c.fillStyle = col; rr(c, -2.7, -1, 5.4, 10.5, 2); c.fill();
      c.fillStyle = '#4a2f1b'; rr(c, -2.9, 8.2, 8, 3.6, 1.6); c.fill();
      c.restore();
    };
    leg(-sw, '#223d7d');
    leg(sw, '#3560bd');
    c.fillStyle = grad(c, 0, -25, 0, -10, [0, '#35c9bd', 1, '#168a82']);
    rr(c, -6, -25, 12, 15.5, 4); c.fill();
    c.fillStyle = '#0e5f5a'; c.fillRect(-6, -12.5, 12, 2);
    c.fillStyle = '#ffd34d'; c.fillRect(-1.2, -12.7, 2.6, 2.4);
    // head
    c.fillStyle = '#f2c9a0'; circle(c, 0.6, -29.5, 5); c.fill();
    c.fillStyle = '#1d1a26'; circle(c, 3.3, -28.4, 0.95); c.fill();
    c.fillStyle = '#d8322e';
    c.beginPath(); c.arc(0.4, -30.6, 5.5, Math.PI, 0); c.closePath(); c.fill();
    rr(c, 1.5, -31.8, 8.2, 2.4, 1.1); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.arc(-0.8, -32.4, 2.4, Math.PI * 1.1, Math.PI * 1.7); c.lineTo(-0.8, -32.4); c.fill();
    // front arm
    c.save(); c.translate(0.5, -22); c.rotate(o.gun ? -1.4 : (o.air ? -2.2 : -sw * 0.9));
    if (o.gun) { c.fillStyle = '#39414c'; rr(c, -1.8, 7, 3.6, 9.5, 1); c.fill(); c.fillStyle = '#aab6c1'; c.fillRect(-1.2, 13, 2.4, 3); }
    c.fillStyle = '#1c9d94'; rr(c, -2.2, -1, 4.4, 10, 2.1); c.fill();
    c.fillStyle = '#f2c9a0'; circle(c, 0, 9.6, 2.3); c.fill();
    c.restore();
    c.restore();
  };

  Draw.jetFlame = function (c, x, y, t) {
    const h = 13 + Math.sin(t * 40) * 3 + Math.sin(t * 23) * 2;
    c.fillStyle = grad(c, 0, y, 0, y + h, [0, '#ffffff', 0.3, '#9fe0ff', 0.7, '#3d8bff', 1, 'rgba(60,80,255,0)']);
    c.beginPath(); c.moveTo(x - 3, y); c.quadraticCurveTo(x - 4, y + h * 0.5, x, y + h); c.quadraticCurveTo(x + 4, y + h * 0.5, x + 3, y); c.closePath(); c.fill();
  };

  Draw.fire = function (c, X, Y, t, seed) {
    const base = Y + 32;
    c.fillStyle = grad(c, 0, base - 6, 0, base, [0, 'rgba(255,120,20,0)', 1, 'rgba(255,200,80,0.9)']);
    c.fillRect(X, base - 6, 32, 6);
    for (let i = 0; i < 4; i++) {
      const bx = X + 4 + i * 8, ph = t * 9 + seed * 1.7 + i * 2.1;
      const h = 17 + Math.sin(ph) * 5 + Math.sin(ph * 1.7) * 3;
      const w = 6.5 + Math.sin(ph * 1.3) * 1.5, lean = Math.sin(ph * 0.8) * 3.5;
      c.fillStyle = grad(c, 0, base, 0, base - h, [0, '#fff6b0', 0.35, '#ffb52e', 0.75, '#f0541e', 1, 'rgba(200,30,20,0)']);
      c.beginPath(); c.moveTo(bx - w, base);
      c.quadraticCurveTo(bx - w, base - h * 0.55, bx + lean, base - h);
      c.quadraticCurveTo(bx + w, base - h * 0.55, bx + w, base);
      c.closePath(); c.fill();
    }
  };

  Draw.water = function (c, X, Y, t, glow) {
    const top = Y + 9;
    c.beginPath(); c.moveTo(X, Y + 32);
    for (let x = 0; x <= 32; x += 4) c.lineTo(X + x, top + Math.sin((X + x) * 0.2 + t * 3) * 2);
    c.lineTo(X + 32, Y + 32); c.closePath();
    if (glow) { c.fillStyle = 'rgba(20,70,210,0.55)'; c.fill(); return; }
    c.fillStyle = grad(c, 0, top, 0, Y + 32, [0, 'rgba(90,180,255,0.9)', 1, 'rgba(14,50,140,0.96)']); c.fill();
    c.strokeStyle = 'rgba(220,245,255,0.8)'; c.lineWidth = 1.4;
    c.beginPath();
    for (let x = 0; x <= 32; x += 4) { const y = top + Math.sin((X + x) * 0.2 + t * 3) * 2; if (x) c.lineTo(X + x, y); else c.moveTo(X + x, y); }
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.25)';
    c.fillRect(X + 6 + Math.sin(t * 1.3 + X) * 3, top + 9, 7, 1.2);
    c.fillRect(X + 18 + Math.cos(t * 1.1 + X) * 3, top + 16, 6, 1.2);
  };

  Draw.weeds = function (c, X, Y, t) {
    c.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const bx = X + 4.5 + i * 7.6, sway = Math.sin(t * 2.2 + i * 1.3 + X * 0.1) * 5;
      const ty = Y + 7 + (i % 2) * 6;
      c.strokeStyle = i % 2 ? '#7a2bb0' : '#a443df'; c.lineWidth = 4.2;
      c.beginPath(); c.moveTo(bx, Y + 32); c.quadraticCurveTo(bx - sway * 0.6, Y + 20, bx + sway, ty); c.stroke();
      c.fillStyle = '#f0a6ff'; circle(c, bx + sway, ty, 2.5); c.fill();
    }
  };

  Draw.enemy = function (c, en, x, y, t) {
    c.save(); c.translate(x, y);
    if (en.type === 1) { // spider
      c.strokeStyle = 'rgba(230,230,255,0.5)'; c.lineWidth = 0.8;
      c.beginPath(); c.moveTo(0, -8); c.lineTo(0, en.cy - 32 * 1.4 - 16 - y); c.stroke();
      c.strokeStyle = '#2a1238'; c.lineWidth = 1.8; c.lineCap = 'round';
      for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
        const a = Math.sin(t * 9 + i * 1.4) * 2;
        c.beginPath(); c.moveTo(s * 4, -1 + i * 2); c.quadraticCurveTo(s * 11, -9 + i * 4 + a, s * 13, 2 + i * 3.4 + a); c.stroke();
      }
      c.fillStyle = rgrad(c, -2, -3, 1, 10, [0, '#8b4fc0', 1, '#35184f']); circle(c, 0, 0, 8.5); c.fill();
      c.fillStyle = '#ff4a5a'; circle(c, -3, 2.5, 1.7); c.fill(); circle(c, 3, 2.5, 1.7); c.fill();
    } else if (en.type === 2) { // eye
      c.rotate(t * 2);
      c.fillStyle = '#f58a1e';
      c.beginPath();
      for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8, r = k % 2 ? 8 : 13; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      c.closePath(); c.fill();
      c.rotate(-t * 2);
      c.fillStyle = rgrad(c, -2, -2, 1, 9, [0, '#fff6c0', 1, '#ffc531']); circle(c, 0, 0, 8.5); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.ellipse(0, 0, 5.5, 4, 0, 0, TAU); c.fill();
      c.fillStyle = '#b01228'; circle(c, Math.sin(t * 2) * 2, 0, 2.6); c.fill();
      c.fillStyle = '#000'; circle(c, Math.sin(t * 2) * 2, 0, 1.1); c.fill();
    } else if (en.type === 3) { // bat
      const f = Math.sin(t * 16) * 0.7;
      c.fillStyle = '#5b2a8f';
      for (const s of [-1, 1]) {
        c.save(); c.scale(s, 1); c.rotate(f);
        c.beginPath(); c.moveTo(3, -2); c.quadraticCurveTo(10, -12, 16, -5); c.quadraticCurveTo(13, -1, 13, 3); c.quadraticCurveTo(10, 0, 8, 4); c.quadraticCurveTo(6, 1, 3, 3); c.closePath(); c.fill();
        c.restore();
      }
      c.fillStyle = rgrad(c, -1, -2, 1, 8, [0, '#a66be0', 1, '#40206b']); c.beginPath(); c.ellipse(0, 0, 5.5, 7, 0, 0, TAU); c.fill();
      c.fillStyle = '#40206b'; poly(c, [-4.5, -5, -3, -10, -1, -6]); c.fill(); poly(c, [4.5, -5, 3, -10, 1, -6]); c.fill();
      c.fillStyle = '#ffe14d'; circle(c, -2.2, -1.5, 1.3); c.fill(); circle(c, 2.2, -1.5, 1.3); c.fill();
    } else { // saucer
      c.fillStyle = rgrad(c, -2, -8, 1, 9, [0, 'rgba(210,250,255,0.95)', 1, 'rgba(70,170,220,0.85)']);
      c.beginPath(); c.arc(0, -3, 7, Math.PI, 0); c.closePath(); c.fill();
      c.fillStyle = grad(c, 0, -4, 0, 5, [0, '#dfe6ee', 0.5, '#8b97a6', 1, '#4a5563']);
      c.beginPath(); c.ellipse(0, 0, 14, 5, 0, 0, TAU); c.fill();
      for (let i = -2; i <= 2; i++) {
        c.fillStyle = Math.floor(t * 6 + i) % 3 === 0 ? '#fff28a' : '#e2452e';
        circle(c, i * 5, 1.2, 1.3); c.fill();
      }
    }
    c.restore();
  };

  Draw.bullet = function (c, x, y, dir, enemy) {
    const col = enemy ? ['#ffd0d6', '#ff3b55', 'rgba(255,40,80,0)'] : ['#ffffff', '#ffe07a', 'rgba(255,190,60,0)'];
    c.fillStyle = grad(c, x + dir * 5, 0, x - dir * 16, 0, [0, col[0], 0.3, col[1], 1, col[2]]);
    rr(c, Math.min(x + dir * 5, x - dir * 16), y - 2.2, 21, 4.4, 2.2); c.fill();
    c.fillStyle = col[0]; circle(c, x + dir * 3, y, 2.6); c.fill();
  };

  DD.Draw = Draw;
})(globalThis.DD = globalThis.DD || {});
