// Draws the scene with Canvas2D into two offscreen buffers (colour and emissive), then
// composites them in WebGL2 with lighting, bloom and distortion. Falls back to plain 2D.
(function (DD) {
  'use strict';
  const T = 32, W = 640, H = 400, PY = 40, FH = 320, S = 2;
  const FONT = '"Avenir Next","Segoe UI","Helvetica Neue",Arial,sans-serif';
  const GLOW = { d: '#4fd8ff', o: '#c06bff', r: '#ff4a5a', i: '#ffd34d', c: '#ffd34d', w: '#fff2a8', T: '#ffd84a', G: '#cfd8e2', J: '#9fd0ff' };
  const D = DD.Draw;

  function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.scene = mk(W * S, H * S); this.sctx = this.scene.getContext('2d');
      this.emis = mk(W, H); this.ectx = this.emis.getContext('2d');
      this.spr = DD.Sprites.build(S);
      this.parts = []; this.texts = []; this.flashes = []; this.lights = [];
      this.bg = null; this.lastWorld = null;
      this.crt = false; this.squash = 0; this.stretch = 0;
      this.ambient = [1, 1, 1];
      this.gl = null;
      try { this.gl = canvas.getContext('webgl2', { antialias: false, alpha: false }); } catch (e) { this.gl = null; }
      if (this.gl) {
        try { this.initGL(); }
        catch (e) {
          console.warn('WebGL setup failed, using 2D fallback:', e);
          this.gl = null;
          const c2 = canvas.cloneNode(false);
          canvas.replaceWith(c2);
          this.canvas = c2;
        }
      }
      if (!this.gl) this.c2d = this.canvas.getContext('2d');
    }

    // ---------------- WebGL ----------------
    initGL() {
      const gl = this.gl, sh = DD.Shaders;
      const compile = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
      };
      const program = (fs, names) => {
        const p = gl.createProgram();
        gl.attachShader(p, compile(gl.VERTEX_SHADER, sh.VERT));
        gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
        const u = {};
        for (const n of names) u[n] = gl.getUniformLocation(p, n);
        return { p: p, u: u };
      };
      const tex = (w, h) => {
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        if (w) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        return t;
      };
      const fbo = (w, h) => {
        const t = tex(w, h), f = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, f);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
        return { f: f, t: t, w: w, h: h };
      };
      this.pBlur = program(sh.BLUR, ['uTex', 'uDir']);
      this.pComp = program(sh.COMPOSITE, ['uScene', 'uEmis', 'uBloom', 'uRes', 'uTime', 'uCRT', 'uAmbient', 'uLights', 'uLightCol', 'uNumLights']);
      this.tScene = tex(0, 0);
      this.tEmis = tex(0, 0);
      this.fA = fbo(W / 2, H / 2);
      this.fB = fbo(W / 2, H / 2);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.vao = gl.createVertexArray();
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      this.lightBuf = new Float32Array(64);
      this.colBuf = new Float32Array(48);
    }

    present(time) {
      const cv = this.canvas;
      const r = cv.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(320, Math.round(r.width * dpr)), h = Math.max(200, Math.round(r.height * dpr));
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }

      if (!this.gl) {
        this.c2d.imageSmoothingEnabled = true;
        this.c2d.drawImage(this.scene, 0, 0, w, h);
        return;
      }
      const gl = this.gl;
      gl.bindVertexArray(this.vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.tScene);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.scene);
      gl.bindTexture(gl.TEXTURE_2D, this.tEmis);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.emis);

      // Bloom: three blur rounds of growing radius, ping-ponging between two half-size buffers.
      gl.useProgram(this.pBlur.p);
      gl.uniform1i(this.pBlur.u.uTex, 0);
      gl.viewport(0, 0, W / 2, H / 2);
      let src = this.tEmis;
      for (const spread of [1, 2, 4]) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fA.f);
        gl.bindTexture(gl.TEXTURE_2D, src);
        gl.uniform2f(this.pBlur.u.uDir, spread / (W / 2), 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fB.f);
        gl.bindTexture(gl.TEXTURE_2D, this.fA.t);
        gl.uniform2f(this.pBlur.u.uDir, 0, spread / (H / 2));
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        src = this.fB.t;
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, w, h);
      const u = this.pComp.u;
      gl.useProgram(this.pComp.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tScene);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.tEmis);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.fB.t);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(u.uScene, 0); gl.uniform1i(u.uEmis, 1); gl.uniform1i(u.uBloom, 2);
      gl.uniform2f(u.uRes, w, h);
      gl.uniform1f(u.uTime, time % 1000);
      gl.uniform1f(u.uCRT, this.crt ? 1 : 0);
      gl.uniform3fv(u.uAmbient, this.ambient);
      const n = Math.min(16, this.lights.length);
      for (let i = 0; i < n; i++) {
        const L = this.lights[i];
        this.lightBuf[i * 4] = L.x; this.lightBuf[i * 4 + 1] = L.y; this.lightBuf[i * 4 + 2] = L.r; this.lightBuf[i * 4 + 3] = 0;
        this.colBuf[i * 3] = L.c[0]; this.colBuf[i * 3 + 1] = L.c[1]; this.colBuf[i * 3 + 2] = L.c[2];
      }
      gl.uniform4fv(u.uLights, this.lightBuf);
      gl.uniform3fv(u.uLightCol, this.colBuf);
      gl.uniform1i(u.uNumLights, n);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // ---------------- helpers ----------------
    light(x, y, r, c, k) {
      k = k === undefined ? 1 : k;
      this.lights.push({ x: x, y: y, r: r, c: [c[0] * k, c[1] * k, c[2] * k] });
    }

    text(c, str, x, y, size, color, align, weight, spacing) {
      c.font = (weight || 700) + ' ' + size + 'px ' + FONT;
      c.textAlign = align || 'left';
      c.textBaseline = 'alphabetic';
      if (spacing && 'letterSpacing' in c) c.letterSpacing = spacing + 'px';
      c.fillStyle = color;
      c.fillText(str, x, y);
      if (spacing && 'letterSpacing' in c) c.letterSpacing = '0px';
    }

    burst(x, y, colors, n, speed, grav) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, v = (0.4 + Math.random()) * (speed || 2);
        const life = 0.35 + Math.random() * 0.5;
        this.parts.push({
          x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.6, g: grav === undefined ? 0.08 : grav,
          life: life, max: life, size: 1.5 + Math.random() * 2.2, color: colors[i % colors.length], glow: true
        });
      }
    }

    onEvent(e) {
      switch (e.t) {
        case 'pickup':
          this.burst(e.x, e.y, [GLOW[e.kind], '#ffffff'], 10, 1.6);
          this.texts.push({ x: e.x, y: e.y - 8, str: '' + e.pts, life: 0.9 });
          break;
        case 'power':
          this.burst(e.x, e.y, [GLOW[e.kind], '#ffffff'], 16, 2);
          this.texts.push({ x: e.x, y: e.y - 8, str: e.kind === 'G' ? 'GUN!' : 'JETPACK!', life: 1.1 });
          break;
        case 'trophy':
          this.burst(e.x, e.y, ['#ffd84a', '#fff7c2', '#ff9d2e'], 34, 2.6);
          this.flashes.push({ x: e.x, y: e.y, life: 0.5, max: 0.5, c: [1, 0.85, 0.35], r: 220 });
          this.texts.push({ x: e.x, y: e.y - 10, str: '1000', life: 1.2 });
          break;
        case 'die':
          this.burst(e.x, e.y, ['#fff3a0', '#ffb02e', '#f0541e', '#d8322e'], 46, 3.2);
          this.flashes.push({ x: e.x, y: e.y, life: 0.6, max: 0.6, c: [1, 0.5, 0.2], r: 240 });
          break;
        case 'boom':
          this.burst(e.x, e.y, ['#ffffff', '#c06bff', '#ffb02e'], 26, 2.6);
          this.flashes.push({ x: e.x, y: e.y, life: 0.35, max: 0.35, c: [0.9, 0.6, 1], r: 170 });
          if (e.pts) this.texts.push({ x: e.x, y: e.y - 10, str: '' + e.pts, life: 0.9 });
          break;
        case 'shoot':
          this.flashes.push({ x: e.x, y: e.y, life: 0.12, max: 0.12, c: [1, 0.9, 0.5], r: 110 });
          break;
        case 'land':
          this.squash = 1;
          for (let i = 0; i < 5; i++) this.parts.push({ x: e.x + (Math.random() - 0.5) * 14, y: e.y, vx: (Math.random() - 0.5) * 1.6, vy: -Math.random() * 0.7, g: 0.01, life: 0.4, max: 0.4, size: 2.5, color: 'rgba(220,210,200,0.6)', glow: false });
          break;
        case 'jump': this.stretch = 1; break;
        case 'life': this.texts.push({ x: e.x, y: e.y - 14, str: '1UP!', life: 1.4 }); break;
        case 'jetout': this.texts.push({ x: e.x, y: e.y - 14, str: 'OUT OF FUEL', life: 1.2 }); break;
      }
    }

    // Two seamless silhouette layers for the parallax background.
    buildBg() {
      const layers = [];
      for (let li = 0; li < 2; li++) {
        const cv = mk(W * S, FH * S), c = cv.getContext('2d');
        c.scale(S, S);
        const k = Math.PI * 2 / W, far = li === 0;
        c.fillStyle = far ? 'rgba(0,0,0,0.20)' : 'rgba(0,0,0,0.30)';
        const floor = x => far
          ? 205 + Math.sin(x * k * 2 + 1) * 34 + Math.sin(x * k * 5) * 16
          : 262 + Math.sin(x * k * 3 + 2) * 22 + Math.sin(x * k * 7 + 1) * 12 + Math.abs(Math.sin(x * k * 11)) * 10;
        const roof = x => far
          ? 28 + Math.sin(x * k * 3) * 20 + Math.abs(Math.sin(x * k * 8 + 1)) * 26
          : 10 + Math.abs(Math.sin(x * k * 6 + 2)) * 34 * (0.5 + 0.5 * Math.sin(x * k * 2));
        c.beginPath(); c.moveTo(0, FH);
        for (let x = 0; x <= W; x += 4) c.lineTo(x, floor(x));
        c.lineTo(W, FH); c.closePath(); c.fill();
        c.beginPath(); c.moveTo(0, 0);
        for (let x = 0; x <= W; x += 4) c.lineTo(x, roof(x));
        c.lineTo(W, 0); c.closePath(); c.fill();
        layers.push(cv);
      }
      return layers;
    }

    drawBg(sc, th, cam, time) {
      const g = sc.createLinearGradient(0, PY, 0, PY + FH);
      g.addColorStop(0, th.sky[0]); g.addColorStop(1, th.sky[1]);
      sc.fillStyle = g; sc.fillRect(0, PY, W, FH);
      if (!this.bg) this.bg = this.buildBg();
      for (let i = 0; i < 2; i++) {
        const off = -((cam * (i ? 0.45 : 0.2)) % W);
        sc.drawImage(this.bg[i], off, PY, W, FH);
        sc.drawImage(this.bg[i], off + W, PY, W, FH);
      }
      sc.fillStyle = '#ffffff';
      for (let i = 0; i < 30; i++) {
        const x = (((i * 97.3 + time * (3 + i % 5) - cam * 0.3) % W) + W) % W;
        const y = PY + (i * 53.7) % FH + Math.sin(time * 0.7 + i) * 6;
        sc.globalAlpha = 0.12 + 0.22 * (0.5 + 0.5 * Math.sin(time * 1.3 + i * 2));
        sc.fillRect(x, y, 1.6, 1.6);
      }
      sc.globalAlpha = 1;
    }

    // ---------------- frame ----------------
    render(game, alpha, time, dt) {
      const sc = this.sctx, em = this.ectx;
      sc.setTransform(S, 0, 0, S, 0, 0);
      em.setTransform(1, 0, 0, 1, 0, 0);
      sc.globalAlpha = 1; em.globalAlpha = 1;
      em.fillStyle = '#000'; em.fillRect(0, 0, W, H);
      this.lights.length = 0;
      this.squash = Math.max(0, this.squash - dt * 7);
      this.stretch = Math.max(0, this.stretch - dt * 5);

      if (game.state === 'title') this.drawTitle(game, time);
      else if (game.state === 'interlude') { this.drawInterlude(game, alpha, time); this.drawHud(game, time); }
      else { this.drawLevel(game, alpha, time, dt); this.drawHud(game, time); this.drawOverlay(game, time); }
      this.present(time);
    }

    drawLevel(g, alpha, time, dt) {
      const sc = this.sctx, em = this.ectx, w = g.world, th = DD.THEMES[w.theme];
      if (w !== this.lastWorld) { this.lastWorld = w; this.parts.length = 0; this.texts.length = 0; this.flashes.length = 0; }
      this.ambient = th.amb;
      let cam = g.pcam + (g.cam - g.pcam) * alpha;
      cam = Math.round(cam * S) / S;
      this.drawBg(sc, th, cam, time);

      for (const c of [sc, em]) { c.save(); c.beginPath(); c.rect(0, PY, W, FH); c.clip(); c.translate(-cam, PY); }
      const L = (x, y, r, c, k) => this.light(x - cam, y + PY, r, c, k);

      const tx0 = Math.max(0, Math.floor(cam / T)), tx1 = Math.min(w.w - 1, tx0 + 20);
      // soft drop shadows behind solid tiles
      sc.fillStyle = 'rgba(0,0,0,0.26)';
      for (let ty = 0; ty < w.h; ty++) for (let tx = tx0; tx <= tx1; tx++)
        if (DD.SOLID.indexOf(w.g[ty][tx]) >= 0) sc.fillRect(tx * T + 5, ty * T + 6, T, T);
      // solid tiles
      for (let ty = 0; ty < w.h; ty++) for (let tx = tx0; tx <= tx1; tx++) {
        const c = w.g[ty][tx];
        if (DD.SOLID.indexOf(c) < 0) continue;
        const X = tx * T, Y = ty * T, v = this.spr.tiles[c];
        sc.drawImage(v[(tx * 7 + ty * 13) % v.length], X, Y, T, T);
        if (ty < w.h - 1 && !w.solid(tx, ty + 1)) { sc.fillStyle = 'rgba(0,0,0,0.30)'; sc.fillRect(X, Y + T - 3, T, 3); }
      }
      for (let ty = 0; ty < w.h; ty++) for (let tx = tx0; tx <= tx1; tx++) {
        const c = w.g[ty][tx];
        if (DD.SOLID.indexOf(c) < 0 || ty === 0 || w.solid(tx, ty - 1)) continue;
        if (c === 'D') sc.drawImage(this.spr.grass, tx * T, ty * T - 5, T, 12);
        else { sc.fillStyle = 'rgba(255,255,255,0.20)'; sc.fillRect(tx * T, ty * T, T, 1.6); }
      }
      // hazards, pickups, door
      const open = g.hasTrophy || !w.hasTrophy;
      let fireLights = 0;
      for (let ty = 0; ty < w.h; ty++) for (let tx = tx0; tx <= tx1; tx++) {
        const c = w.g[ty][tx];
        if (c === '.' || DD.SOLID.indexOf(c) >= 0) continue;
        const X = tx * T, Y = ty * T;
        if (c === 'F') {
          D.fire(sc, X, Y, time, tx); D.fire(em, X, Y, time, tx);
          if (tx % 2 === 0 && fireLights < 7) { fireLights++; L(X + 16, Y + 14, 120, [1, 0.5, 0.16], 0.75 + 0.2 * Math.sin(time * 13 + tx)); }
        } else if (c === 'W') {
          D.water(sc, X, Y, time, false); D.water(em, X, Y, time, true);
        } else if (c === 'V') {
          D.weeds(sc, X, Y, time);
          em.globalAlpha = 0.35; D.weeds(em, X, Y, time); em.globalAlpha = 1;
        } else if (c === 'E') {
          sc.drawImage(this.spr.door[open ? 1 : 0], X, Y - 8, T, 40);
          if (open) { em.globalAlpha = 0.75; em.drawImage(this.spr.door[1], X, Y - 8, T, 40); em.globalAlpha = 1; L(X + 16, Y + 12, 130, [1, 0.9, 0.5], 0.6 + 0.15 * Math.sin(time * 4)); }
        } else if (this.spr.items[c]) {
          const bob = Math.sin(time * 3 + tx * 0.9) * 2, img = this.spr.items[c];
          sc.drawImage(img, X, Y + bob, T, T);
          em.globalAlpha = c === 'T' ? 0.95 : 0.5; em.drawImage(img, X, Y + bob, T, T); em.globalAlpha = 1;
          const tw = Math.sin(time * 2.3 + tx * 1.7 + ty);
          if (tw > 0.86) {
            const a = (tw - 0.86) / 0.14, sx = X + 22, sy = Y + 9 + bob;
            for (const cx of [sc, em]) {
              cx.fillStyle = 'rgba(255,255,255,' + a.toFixed(2) + ')';
              cx.beginPath(); cx.moveTo(sx, sy - 5 * a); cx.lineTo(sx + 1.2, sy - 1.2); cx.lineTo(sx + 5 * a, sy); cx.lineTo(sx + 1.2, sy + 1.2);
              cx.lineTo(sx, sy + 5 * a); cx.lineTo(sx - 1.2, sy + 1.2); cx.lineTo(sx - 5 * a, sy); cx.lineTo(sx - 1.2, sy - 1.2); cx.closePath(); cx.fill();
            }
          }
          if (c === 'T') L(X + 16, Y + 16, 120, [1, 0.85, 0.35], 0.7);
        }
      }

      // enemies and their shots
      for (const en of g.enemies) {
        if (!en.alive) continue;
        const x = en.px + (en.x - en.px) * alpha, y = en.py + (en.y - en.py) * alpha;
        if (x < cam - 60 || x > cam + W + 60) continue;
        D.enemy(sc, en, x, y, time);
        em.globalAlpha = 0.22; D.enemy(em, en, x, y, time); em.globalAlpha = 1;
      }
      for (const b of g.ebullets) {
        const x = b.px + (b.x - b.px) * alpha, dir = b.vx > 0 ? 1 : -1;
        D.bullet(sc, x, b.y, dir, true); D.bullet(em, x, b.y, dir, true);
        L(x, b.y, 70, [1, 0.25, 0.35], 0.7);
      }
      if (g.shot) {
        const x = g.shot.px + (g.shot.x - g.shot.px) * alpha, dir = g.shot.vx > 0 ? 1 : -1;
        D.bullet(sc, x, g.shot.y, dir, false); D.bullet(em, x, g.shot.y, dir, false);
        L(x, g.shot.y, 80, [1, 0.9, 0.5], 0.8);
      }

      // Dave
      const d = g.dave;
      if (g.state !== 'dying' && g.state !== 'gameover') {
        const x = d.px + (d.x - d.px) * alpha + d.w / 2, y = d.py + (d.y - d.py) * alpha + d.h;
        if (g.state === 'clear') sc.globalAlpha = Math.max(0, g.timer / 50);
        if (d.jetOn) {
          const fx = x - d.face * 7.5, fy = y - 9;
          D.jetFlame(sc, fx, fy, time); D.jetFlame(em, fx, fy, time);
          L(fx, fy + 6, 100, [0.4, 0.7, 1], 0.8);
          if (Math.random() < 0.6) this.parts.push({ x: fx, y: fy + 10, vx: (Math.random() - 0.5) * 0.8, vy: 1 + Math.random(), g: -0.02, life: 0.45, max: 0.45, size: 2.4, color: 'rgba(170,215,255,0.7)', glow: true });
        }
        D.dave(sc, {
          x: x, y: y, face: d.face, run: d.x * 0.3, moving: d.moving, air: !d.onGround && !d.jetOn,
          jet: g.hasJet, gun: g.gun,
          sx: 1 + 0.16 * this.squash - 0.1 * this.stretch, sy: 1 - 0.16 * this.squash + 0.12 * this.stretch
        });
        sc.globalAlpha = 1;
        L(x, y - 16, 150, [0.34, 0.32, 0.3]);
      }

      // particles, flashes, floating score text
      const step = dt * 60;
      for (let i = this.parts.length - 1; i >= 0; i--) {
        const p = this.parts[i];
        p.life -= dt;
        if (p.life <= 0) { this.parts.splice(i, 1); continue; }
        p.vy += p.g * step; p.x += p.vx * step; p.y += p.vy * step;
        const a = p.life / p.max;
        sc.globalAlpha = a; sc.fillStyle = p.color;
        D.circle(sc, p.x, p.y, p.size * (0.5 + 0.5 * a)); sc.fill();
        if (p.glow) { em.globalAlpha = a; em.fillStyle = p.color; D.circle(em, p.x, p.y, p.size); em.fill(); }
      }
      sc.globalAlpha = 1; em.globalAlpha = 1;
      for (let i = this.flashes.length - 1; i >= 0; i--) {
        const f = this.flashes[i];
        f.life -= dt;
        if (f.life <= 0) { this.flashes.splice(i, 1); continue; }
        L(f.x, f.y, f.r, f.c, 1.4 * f.life / f.max);
      }
      for (let i = this.texts.length - 1; i >= 0; i--) {
        const t = this.texts[i];
        t.life -= dt;
        if (t.life <= 0) { this.texts.splice(i, 1); continue; }
        t.y -= 22 * dt;
        const a = Math.min(1, t.life * 3);
        sc.globalAlpha = a;
        this.text(sc, t.str, t.x + 1, t.y + 1, 12, 'rgba(0,0,0,0.6)', 'center', 800);
        this.text(sc, t.str, t.x, t.y, 12, '#fff6c4', 'center', 800);
        em.globalAlpha = a * 0.6;
        this.text(em, t.str, t.x, t.y, 12, '#ffe07a', 'center', 800);
      }
      sc.globalAlpha = 1; em.globalAlpha = 1;
      sc.restore(); em.restore();
    }

    drawHud(g, time) {
      const sc = this.sctx;
      const bar = y => {
        sc.fillStyle = D.grad(sc, 0, y, 0, y + 40, [0, '#1b1828', 1, '#0d0c14']);
        sc.fillRect(0, y, W, 40);
      };
      bar(0); bar(H - 40);
      sc.fillStyle = 'rgba(255,255,255,0.14)';
      sc.fillRect(0, 39, W, 1); sc.fillRect(0, H - 40, W, 1);

      const label = '#8f8aa8';
      this.text(sc, 'SCORE', 18, 15, 9.5, label, 'left', 700, 1.5);
      this.text(sc, String(g.score).padStart(5, '0'), 18, 33, 18, '#ffffff', 'left', 800, 1);
      this.text(sc, 'HIGH', 130, 15, 9.5, label, 'left', 700, 1.5);
      this.text(sc, String(Math.max(g.hi, g.score)).padStart(5, '0'), 130, 33, 18, '#cfc9ea', 'left', 800, 1);
      const isWarp = g.levelId && g.levelId[0] === 'w';
      this.text(sc, isWarp ? 'WARP ZONE' : 'LEVEL', W / 2, 15, 9.5, isWarp ? '#ffd34d' : label, 'center', 700, 1.5);
      this.text(sc, isWarp ? '★' : String(g.levelId || 1).padStart(2, '0'), W / 2, 33, 18, isWarp ? '#ffd34d' : '#ffffff', 'center', 800, 1);
      this.text(sc, 'DAVES', W - 18, 15, 9.5, label, 'right', 700, 1.5);
      const shown = Math.min(g.lives, 6);
      for (let i = 0; i < shown; i++) {
        const x = W - 26 - i * 17, y = 28;
        sc.fillStyle = '#f2c9a0'; D.circle(sc, x, y, 5); sc.fill();
        sc.fillStyle = '#d8322e'; sc.beginPath(); sc.arc(x, y - 1, 5.5, Math.PI, 0); sc.closePath(); sc.fill();
        D.rr(sc, x + 1, y - 2.4, 7.5, 2.3, 1); sc.fill();
        sc.fillStyle = '#1d1a26'; D.circle(sc, x + 2.4, y + 0.6, 0.9); sc.fill();
      }
      if (g.lives > 6) this.text(sc, '+' + (g.lives - 6), W - 26 - 6 * 17 + 8, 32, 11, '#ffffff', 'right', 800);

      // bottom bar
      const by = H - 40;
      if (g.hasJet) {
        sc.drawImage(this.spr.items.J, 12, by + 6, 28, 28);
        this.text(sc, 'JETPACK', 46, by + 16, 9.5, label, 'left', 700, 1.5);
        sc.fillStyle = '#2a2740'; D.rr(sc, 46, by + 21, 120, 9, 4.5); sc.fill();
        const f = Math.max(0, g.fuel / DD.FUEL);
        if (f > 0) {
          sc.fillStyle = D.grad(sc, 46, 0, 166, 0, [0, f < 0.25 ? '#ff5a4a' : '#4fd8ff', 1, f < 0.25 ? '#ffb02e' : '#9fe0ff']);
          D.rr(sc, 46, by + 21, Math.max(9, 120 * f), 9, 4.5); sc.fill();
        }
      }
      if (g.gun) {
        sc.drawImage(this.spr.items.G, W - 44, by + 5, 30, 30);
        this.text(sc, 'GUN', W - 50, by + 25, 9.5, label, 'right', 700, 1.5);
      }
      if (g.hasTrophy) sc.drawImage(this.spr.items.T, W - 110, by + 5, 30, 30);
      if (g.state === 'play' || g.state === 'clear') {
        if (g.hasTrophy) {
          const a = 0.6 + 0.4 * Math.sin(time * 6);
          sc.globalAlpha = a;
          this.text(sc, 'GO THRU THE DOOR!', W / 2, by + 26, 15, '#ffe27a', 'center', 800, 2);
          sc.globalAlpha = 1;
        } else if (g.world && !g.world.hasTrophy) {
          this.text(sc, 'GRAB THE LOOT, THEN TAKE THE DOOR', W / 2, by + 25, 11, '#ffd34d', 'center', 700, 2);
        }
      }
    }

    drawOverlay(g, time) {
      if (g.state !== 'gameover' && g.state !== 'win') return;
      const sc = this.sctx, em = this.ectx;
      const a = Math.min(1, g.timer / 40);
      sc.fillStyle = 'rgba(6,5,12,' + (0.72 * a).toFixed(2) + ')';
      sc.fillRect(0, PY, W, FH);
      sc.globalAlpha = a; em.globalAlpha = a * 0.45;
      const win = g.state === 'win';
      const title = win ? 'YOU DID IT, DAVE!' : 'GAME OVER';
      const col = win ? '#ffe27a' : '#ff6a5a';
      this.text(sc, title, W / 2 + 2, 180 + 3, 46, 'rgba(0,0,0,0.6)', 'center', 900, 2);
      this.text(sc, title, W / 2, 180, 46, col, 'center', 900, 2);
      this.text(em, title, W / 2, 180, 46, col, 'center', 900, 2);
      this.text(sc, 'SCORE  ' + g.score, W / 2, 222, 18, '#ffffff', 'center', 700, 2);
      if (g.score > 0 && g.score >= g.hi) this.text(sc, 'NEW HIGH SCORE', W / 2, 246, 12, '#ffd34d', 'center', 700, 3);
      if (Math.sin(time * 5) > -0.3) this.text(sc, 'PRESS ENTER', W / 2, 286, 13, '#cfc9ea', 'center', 700, 3);
      sc.globalAlpha = 1; em.globalAlpha = 1;
    }

    drawInterlude(g, alpha, time) {
      const sc = this.sctx, em = this.ectx;
      this.ambient = [0.62, 0.58, 0.7];
      this.drawBg(sc, DD.THEMES[3], time * 30, time);
      const tiles = this.spr.tiles['#'];
      sc.save(); sc.beginPath(); sc.rect(0, PY, W, FH); sc.clip();
      for (let tx = 0; tx < 20; tx++) {
        for (const row of [0, 1, 7, 8, 9]) sc.drawImage(tiles[(tx + row) % 2], tx * T, PY + row * T, T, T);
        sc.fillStyle = 'rgba(0,0,0,0.3)'; sc.fillRect(tx * T, PY + 2 * T - 3, T, 3);
        sc.fillStyle = 'rgba(255,255,255,0.2)'; sc.fillRect(tx * T, PY + 7 * T, T, 1.6);
      }
      const p = 1 - (g.timer - alpha) / g.dur;
      const x = -24 + p * (W + 48), y = PY + 7 * T;
      D.dave(sc, { x: x, y: y, face: 1, run: x * 0.3, moving: true, air: false, jet: false, gun: false });
      sc.restore();
      this.light(x, y - 16, 190, [0.6, 0.55, 0.45]);
      this.light(W / 2, PY + 110, 300, [0.35, 0.3, 0.2]);
      const warp = /WARP/.test(g.msg), col = warp ? '#ffe27a' : '#ffffff';
      this.text(sc, g.msg, W / 2 + 2, PY + 142, 24, 'rgba(0,0,0,0.6)', 'center', 900, 2);
      this.text(sc, g.msg, W / 2, PY + 140, 24, col, 'center', 900, 2);
      em.globalAlpha = warp ? 0.6 : 0.3;
      this.text(em, g.msg, W / 2, PY + 140, 24, col, 'center', 900, 2);
      em.globalAlpha = 1;
    }

    drawTitle(g, time) {
      const sc = this.sctx, em = this.ectx;
      this.ambient = [0.5, 0.44, 0.58];
      sc.fillStyle = D.grad(sc, 0, 0, 0, H, [0, '#120c26', 0.6, '#3a1838', 1, '#6b2a2a']);
      sc.fillRect(0, 0, W, H);
      if (!this.bg) this.bg = this.buildBg();
      for (let i = 0; i < 2; i++) {
        const off = -((time * (i ? 14 : 6)) % W);
        sc.drawImage(this.bg[i], off, 30, W, H - 60); sc.drawImage(this.bg[i], off + W, 30, W, H - 60);
      }
      // ground and fire
      const gy = H - 32, tiles = this.spr.tiles['#'];
      for (let tx = 0; tx < 20; tx++) {
        sc.drawImage(tiles[tx % 2], tx * T, gy, T, T);
        sc.fillStyle = 'rgba(255,255,255,0.2)'; sc.fillRect(tx * T, gy, T, 1.6);
        if (tx >= 5 && tx <= 14) {
          D.fire(sc, tx * T, gy - T, time, tx); D.fire(em, tx * T, gy - T, time, tx);
          if (tx % 2) this.light(tx * T + 16, gy - 14, 150, [1, 0.5, 0.16], 0.7 + 0.2 * Math.sin(time * 13 + tx));
        }
      }
      D.dave(sc, { x: 84, y: gy, face: 1, run: 0, moving: false, air: false, jet: true, gun: true });
      this.light(84, gy - 18, 130, [0.5, 0.45, 0.4]);
      const bob = Math.sin(time * 3) * 3;
      sc.drawImage(this.spr.items.T, W - 108, gy - 44 + bob, 40, 40);
      em.globalAlpha = 0.9; em.drawImage(this.spr.items.T, W - 108, gy - 44 + bob, 40, 40); em.globalAlpha = 1;
      this.light(W - 88, gy - 24, 140, [1, 0.85, 0.35], 0.8);

      // logo
      const logo = (c, glow) => {
        c.save();
        c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.lineJoin = 'round';
        const line = (str, y, size, sp) => {
          c.font = 'italic 900 ' + size + 'px ' + FONT;
          if ('letterSpacing' in c) c.letterSpacing = sp + 'px';
          if (!glow) {
            c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillText(str, W / 2 + 4, y + 5);
            c.strokeStyle = '#2a0d14'; c.lineWidth = 7; c.strokeText(str, W / 2, y);
          }
          c.fillStyle = D.grad(c, 0, y - size * 0.8, 0, y, [0, '#fff7c2', 0.45, '#ffc531', 1, '#f0541e']);
          c.fillText(str, W / 2, y);
        };
        line('DANGEROUS', 104, 50, 4);
        line('DAVE', 186, 96, 8);
        if ('letterSpacing' in c) c.letterSpacing = '0px';
        c.restore();
      };
      logo(sc, false);
      em.globalAlpha = 0.4; logo(em, true); em.globalAlpha = 1;
      this.light(W / 2, 140, 330, [0.75, 0.6, 0.45]);

      this.text(sc, 'R E I M A G I N E D', W / 2, 214, 12, '#e9d9ff', 'center', 700, 3);
      if (g.hi > 0) this.text(sc, 'HIGH SCORE  ' + g.hi, W / 2, 242, 12, '#ffd34d', 'center', 700, 2);
      if (Math.sin(time * 5) > -0.3) {
        this.text(sc, 'PRESS ENTER TO START', W / 2, 272, 15, '#ffffff', 'center', 800, 3);
        em.globalAlpha = 0.35; this.text(em, 'PRESS ENTER TO START', W / 2, 272, 15, '#ffffff', 'center', 800, 3); em.globalAlpha = 1;
      }
      const dim = '#b9b2d6';
      this.text(sc, 'ARROWS  move and jump      CTRL / X  shoot      ALT / Z  jetpack', W / 2, 298, 10.5, dim, 'center', 600, 0.5);
      this.text(sc, 'P  pause      C  CRT mode      M  mute      ESC  give up a life', W / 2, 314, 10.5, dim, 'center', 600, 0.5);
    }
  }

  DD.Renderer = Renderer;
})(globalThis.DD = globalThis.DD || {});
