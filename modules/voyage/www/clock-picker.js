/**
 * Analog-style clock time picker — pick hours, then minutes, then AM/PM.
 * Stored / printed values remain 24-hour (HH:MM or datetime-local YYYY-MM-DDTHH:MM).
 */
(function (global) {
  'use strict';

  const STYLE_ID = 'cheng-clock-picker-css';
  let active = null;

  function ensureCss() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
.ccp-overlay{position:fixed;inset:0;z-index:12000;background:rgba(4,10,18,.62);display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(3px)}
.ccp-dialog{width:min(340px,96vw);background:linear-gradient(160deg,rgba(18,34,56,.98),rgba(10,20,32,.98));border:1px solid rgba(201,154,83,.4);border-radius:18px;box-shadow:0 24px 60px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.1);padding:16px 16px 14px;color:#e9e4d6;font-family:Segoe UI,Helvetica Neue,sans-serif}
html.bright .ccp-dialog{background:linear-gradient(160deg,#fff,#f4f1ea);color:#122238;border-color:rgba(110,72,20,.35)}
.ccp-title{font-size:11px;letter-spacing:.12em;text-transform:uppercase;opacity:.7;margin-bottom:8px}
.ccp-face{position:relative;width:220px;height:220px;margin:8px auto 12px;border-radius:50%;background:radial-gradient(circle at 35% 30%,rgba(87,179,171,.18),transparent 45%),radial-gradient(circle at 50% 50%,rgba(18,34,56,.9),rgba(8,14,22,1));border:2px solid rgba(201,154,83,.45);box-shadow:inset 0 0 30px rgba(0,0,0,.45),0 0 24px rgba(87,179,171,.15)}
html.bright .ccp-face{background:radial-gradient(circle at 35% 30%,rgba(23,102,95,.1),transparent 45%),#f7f5ef}
.ccp-center{position:absolute;left:50%;top:50%;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;background:#c99a53;z-index:3}
.ccp-hand{position:absolute;left:50%;top:50%;width:2px;height:70px;margin-top:-70px;margin-left:-1px;background:#57b3ab;transform-origin:bottom center;border-radius:2px;z-index:2;transition:transform .15s ease}
.ccp-hand.min{height:90px;margin-top:-90px;background:#c99a53;width:1.5px}
.ccp-num{position:absolute;left:50%;top:50%;width:36px;height:36px;margin:-18px 0 0 -18px;display:flex;align-items:center;justify-content:center;border-radius:50%;font-weight:700;font-size:13px;cursor:pointer;user-select:none;color:inherit;opacity:.85}
.ccp-num:hover,.ccp-num.active{background:rgba(201,154,83,.28);opacity:1;box-shadow:0 0 0 1px rgba(201,154,83,.5)}
.ccp-readout{text-align:center;font-variant-numeric:tabular-nums;font-size:1.6rem;font-weight:700;letter-spacing:.06em;margin-bottom:10px}
.ccp-step{text-align:center;font-size:11px;letter-spacing:.08em;text-transform:uppercase;opacity:.65;margin-bottom:8px}
.ccp-ampm{display:flex;gap:8px;justify-content:center;margin-bottom:12px}
.ccp-ampm button{min-width:72px;padding:8px 12px;border-radius:10px;border:1px solid rgba(201,154,83,.35);background:rgba(0,0,0,.2);color:inherit;font-weight:700;cursor:pointer}
.ccp-ampm button.active{background:rgba(87,179,171,.25);border-color:#57b3ab}
.ccp-actions{display:flex;gap:8px;justify-content:flex-end}
.ccp-actions button{padding:8px 14px;border-radius:10px;border:1px solid rgba(233,228,214,.2);background:rgba(0,0,0,.25);color:inherit;cursor:pointer;font-weight:600}
.ccp-actions .ccp-ok{background:linear-gradient(180deg,rgba(87,179,171,.45),rgba(87,179,171,.2));border-color:#57b3ab}
input.ccp-bound{cursor:pointer}
`;
    document.head.appendChild(s);
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function parseValue(el) {
    const raw = String(el.value || '').trim();
    let h = 12, m = 0, datePart = '';
    if (el.type === 'datetime-local' || raw.includes('T')) {
      const mact = raw.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/);
      if (mact) {
        datePart = mact[1];
        h = Number(mact[2]);
        m = Number(mact[3]);
      }
    } else {
      const mact = raw.match(/^(\d{1,2}):(\d{2})/);
      if (mact) {
        h = Number(mact[1]);
        m = Number(mact[2]);
      }
    }
    if (!Number.isFinite(h)) h = 12;
    if (!Number.isFinite(m)) m = 0;
    const isPm = h >= 12;
    let h12 = h % 12;
    if (h12 === 0) h12 = 12;
    return { h24: h, h12, m, isPm, datePart };
  }

  function to24(h12, m, isPm) {
    let h = Number(h12) % 12;
    if (isPm) h += 12;
    if (!isPm && Number(h12) === 12) h = 0;
    if (isPm && Number(h12) === 12) h = 12;
    return { h, m: Number(m) || 0 };
  }

  function writeValue(el, state) {
    const { h, m } = to24(state.h12, state.m, state.isPm);
    if (el.type === 'datetime-local') {
      let datePart = state.datePart;
      if (!datePart) {
        const d = new Date();
        datePart = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      }
      el.value = `${datePart}T${pad(h)}:${pad(m)}`;
    } else if (el.type === 'time') {
      el.value = `${pad(h)}:${pad(m)}`;
    } else {
      el.value = `${pad(h)}:${pad(m)}`;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function close() {
    if (active && active.overlay && active.overlay.parentNode) {
      active.overlay.parentNode.removeChild(active.overlay);
    }
    active = null;
  }

  function open(el) {
    ensureCss();
    close();
    const state = Object.assign({ step: 'hour' }, parseValue(el));
    const overlay = document.createElement('div');
    overlay.className = 'ccp-overlay';
    overlay.innerHTML = `
      <div class="ccp-dialog" role="dialog" aria-label="Time picker">
        <div class="ccp-title">Ship clock</div>
        <div class="ccp-readout" data-ccp-readout></div>
        <div class="ccp-step" data-ccp-step></div>
        <div class="ccp-face" data-ccp-face>
          <div class="ccp-hand" data-ccp-hand-h></div>
          <div class="ccp-hand min" data-ccp-hand-m></div>
          <div class="ccp-center"></div>
        </div>
        <div class="ccp-ampm" data-ccp-ampm hidden>
          <button type="button" data-ampm="am">AM</button>
          <button type="button" data-ampm="pm">PM</button>
        </div>
        <div class="ccp-actions">
          <button type="button" data-ccp-cancel>Cancel</button>
          <button type="button" class="ccp-ok" data-ccp-ok>Set</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const face = overlay.querySelector('[data-ccp-face]');
    const readout = overlay.querySelector('[data-ccp-readout]');
    const stepEl = overlay.querySelector('[data-ccp-step]');
    const ampmRow = overlay.querySelector('[data-ccp-ampm]');
    const handH = overlay.querySelector('[data-ccp-hand-h]');
    const handM = overlay.querySelector('[data-ccp-hand-m]');

    function placeNums(count, mapLabel) {
      face.querySelectorAll('.ccp-num').forEach((n) => n.remove());
      for (let i = 0; i < count; i++) {
        const label = mapLabel(i);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ccp-num';
        btn.textContent = label;
        const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
        const r = 82;
        btn.style.transform = `translate(${Math.cos(angle) * r}px, ${Math.sin(angle) * r}px)`;
        btn.dataset.val = String(label);
        face.appendChild(btn);
      }
    }

    function refresh() {
      const { h, m } = to24(state.h12, state.m, state.isPm);
      readout.textContent = `${pad(h)}:${pad(m)}`;
      const hAngle = ((state.h12 % 12) / 12) * 360;
      const mAngle = (state.m / 60) * 360;
      handH.style.transform = `rotate(${hAngle}deg)`;
      handM.style.transform = `rotate(${mAngle}deg)`;
      if (state.step === 'hour') {
        stepEl.textContent = 'Select hour';
        ampmRow.hidden = true;
        ampmRow.style.display = 'none';
        placeNums(12, (i) => (i === 0 ? 12 : i));
        face.querySelectorAll('.ccp-num').forEach((n) => {
          n.classList.toggle('active', Number(n.dataset.val) === state.h12);
          n.onclick = () => {
            state.h12 = Number(n.dataset.val);
            state.step = 'minute';
            refresh();
          };
        });
      } else if (state.step === 'minute') {
        stepEl.textContent = 'Select minutes';
        ampmRow.hidden = true;
        ampmRow.style.display = 'none';
        placeNums(12, (i) => pad(i * 5));
        face.querySelectorAll('.ccp-num').forEach((n) => {
          const v = Number(n.dataset.val);
          n.classList.toggle('active', v === state.m);
          n.onclick = () => {
            state.m = v;
            state.step = 'ampm';
            refresh();
          };
        });
      } else {
        stepEl.textContent = 'Select AM / PM';
        ampmRow.hidden = false;
        ampmRow.style.display = 'flex';
        placeNums(12, (i) => (i === 0 ? 12 : i));
        face.querySelectorAll('.ccp-num').forEach((n) => {
          n.classList.toggle('active', Number(n.dataset.val) === state.h12);
          n.onclick = () => {
            state.h12 = Number(n.dataset.val);
            refresh();
          };
        });
        ampmRow.querySelectorAll('button').forEach((b) => {
          const pm = b.dataset.ampm === 'pm';
          b.classList.toggle('active', pm === state.isPm);
          b.onclick = () => {
            state.isPm = pm;
            refresh();
          };
        });
      }
    }

    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay) close();
    });
    overlay.querySelector('[data-ccp-cancel]').onclick = close;
    overlay.querySelector('[data-ccp-ok]').onclick = () => {
      writeValue(el, state);
      close();
    };

    active = { overlay, el };
    refresh();
  }

  function bindInput(el) {
    if (!el || el.dataset.ccpBound === '1') return;
    el.dataset.ccpBound = '1';
    el.classList.add('ccp-bound');
    el.setAttribute('readonly', 'readonly');
    el.addEventListener('click', (ev) => {
      ev.preventDefault();
      open(el);
    });
    el.addEventListener('focus', (ev) => {
      ev.preventDefault();
      try { el.blur(); } catch (_) {}
      open(el);
    });
  }

  function enhance(root) {
    const scope = root || document;
    scope.querySelectorAll('input[type="time"], input[type="datetime-local"]').forEach(bindInput);
  }

  function install() {
    ensureCss();
    enhance(document);
    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        m.addedNodes && m.addedNodes.forEach((n) => {
          if (n.nodeType !== 1) return;
          if (n.matches && (n.matches('input[type="time"]') || n.matches('input[type="datetime-local"]'))) {
            bindInput(n);
          } else if (n.querySelectorAll) enhance(n);
        });
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  global.ChengClockPicker = { open, bindInput, enhance, install, to24, parseValue };
})(typeof window !== 'undefined' ? window : globalThis);
