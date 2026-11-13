// Boot and main loop: fixed 60 Hz game steps, rendering interpolated in between.
(function (DD) {
  'use strict';
  const STEP = 1 / 60;

  function loadHi() { try { return parseInt(localStorage.getItem('dd_hi'), 10) || 0; } catch (e) { return 0; } }
  function saveHi(v) { try { localStorage.setItem('dd_hi', String(v)); } catch (e) { /* storage is optional */ } }

  function showError(msg) {
    const el = document.getElementById('err');
    if (el) { el.textContent = String(msg); el.style.display = 'block'; }
  }
  window.addEventListener('error', e => showError(e.message + ' (' + (e.filename || '').split('/').pop() + ':' + e.lineno + ')'));

  function boot() {
    const renderer = new DD.Renderer(document.getElementById('screen'));
    const game = new DD.Game({ hi: loadHi(), onHi: saveHi });
    let paused = false;

    DD.Input.attach(code => {
      DD.Audio.unlock();
      if (code === 'KeyP' && game.state === 'play') paused = !paused;
      else if (code === 'KeyC') renderer.crt = !renderer.crt;
      else if (code === 'KeyM') DD.Audio.toggleMute();
    });
    window.addEventListener('pointerdown', () => DD.Audio.unlock());

    // ?level=3 or ?level=w1 jumps straight into a level; ?crt=1 starts in CRT mode.
    const q = new URLSearchParams(location.search);
    const lvl = q.get('level');
    if (lvl && DD.LEVELS[lvl]) game.start(lvl);
    if (q.get('crt')) renderer.crt = true;

    let last = performance.now(), acc = 0;
    function frame(now) {
      const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
      last = now;
      if (!paused) {
        acc += dt;
        while (acc >= STEP) {
          game.update(DD.Input.state);
          for (const e of game.events) { renderer.onEvent(e); DD.Audio.play(e.t); }
          game.events.length = 0;
          if (game.state === 'play' && game.dave.jetOn && game.tick % 6 === 0) DD.Audio.play('thrust');
          acc -= STEP;
        }
      }
      renderer.render(game, paused ? 1 : acc / STEP, now / 1000, paused ? 0 : dt);
      document.getElementById('paused').style.display = paused ? 'flex' : 'none';
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    window.__dd = { game: game, renderer: renderer };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(globalThis.DD = globalThis.DD || {});
