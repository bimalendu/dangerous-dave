// Keyboard mapping. Original keys (arrows, Ctrl, Alt) plus browser-friendly aliases.
(function (DD) {
  'use strict';
  const MAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up', Space: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ControlLeft: 'fire', ControlRight: 'fire', KeyX: 'fire',
    AltLeft: 'jet', AltRight: 'jet', KeyZ: 'jet',
    Enter: 'start', NumpadEnter: 'start',
    Escape: 'giveup'
  };

  DD.Input = {
    state: {},
    held: {},
    attach: function (onKey) {
      const st = this.state, held = this.held;
      const sync = () => {
        for (const k in st) st[k] = false;
        for (const code in held) if (held[code]) st[MAP[code]] = true;
        if (held.Space) st.start = true; // Space also starts the game
      };
      window.addEventListener('keydown', e => {
        if (MAP[e.code]) { held[e.code] = true; sync(); e.preventDefault(); }
        if (!e.repeat && onKey) onKey(e.code);
      });
      window.addEventListener('keyup', e => {
        if (MAP[e.code]) { held[e.code] = false; sync(); e.preventDefault(); }
      });
      window.addEventListener('blur', () => { for (const c in held) held[c] = false; sync(); });
    }
  };
})(globalThis.DD = globalThis.DD || {});
