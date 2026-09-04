window.ChengProModules = window.ChengProModules || {};

function bpLicenseNeededPanel(title, message) {
  return `
    <section class="panel">
      <h2>${title}</h2>
      <p class="empty">${message}</p>
      <div class="form-actions">
        <button type="button" class="btn primary" data-go="license">Open License</button>
        <button type="button" class="btn" data-go="home">Back to Home</button>
      </div>
    </section>`;
}

function bpBindNav(root) {
  root.querySelectorAll('[data-go]').forEach((btn) => {
    btn.onclick = () =>
      window.dispatchEvent(new CustomEvent('chengpro:navigate', { detail: btn.dataset.go }));
  });
}

/* Consumption Plan is a program of its own on the key, not something a
   Voyage or Tank tick implies — the office decides whether it is sold. */
function bpProgramAllowed() {
  if (!window.ChengLicense) return true;
  if (typeof ChengLicense.consumptionPlanLicensed === 'function') {
    return !!ChengLicense.consumptionPlanLicensed();
  }
  return ChengLicense.moduleAllowed('bunkerplan');
}

window.ChengProModules.bunkerplan = {
  title: 'Consumption Plan',
  async render(root) {
    if (!bpProgramAllowed()) {
      root.innerHTML = bpLicenseNeededPanel(
        'Consumption Plan',
        'Consumption Plan is not on this license. Ask your office to include the <strong>Consumption Plan</strong> program when they issue or renew the key, then open <strong>License</strong> to re-check.'
      );
      bpBindNav(root);
      return;
    }
    const src = ChengPro.voyageEmbedUrl({ page: 'bunkerplan' });
    root.innerHTML = `
      <div class="aio-embed-wrap" id="bpEmbedWrap">
        <iframe
          class="aio-embed-frame"
          title="Consumption Plan"
          src="${src}"
          allow="clipboard-read; clipboard-write"
        ></iframe>
      </div>`;

    /* Bridge: when the Voyage iframe requests Tank ROB, forward to the Tank iframe. */
    const handler = (ev) => {
      const msg = ev.data || {};
      if (msg.type === 'chengaio-request-tank-rob') {
        requestTankRob(root);
      }
    };
    window.addEventListener('message', handler);
    root.dataset.bpHandler = 'bound';
  },
};

let _tankRobFrame = null;

function requestTankRob(root) {
  if (_tankRobFrame && _tankRobFrame.parentNode) {
    try {
      _tankRobFrame.contentWindow.postMessage({ type: 'request-tank-rob' }, '*');
    } catch (_) {}
    return;
  }
  _tankRobFrame = document.createElement('iframe');
  _tankRobFrame.style.cssText = 'position:absolute;width:0;height:0;border:none;opacity:0;pointer-events:none;';
  _tankRobFrame.src = ChengPro.tankEmbedUrl({ robOnly: '1' });
  _tankRobFrame.title = 'Tank ROB bridge';
  document.body.appendChild(_tankRobFrame);

  const onMsg = (ev) => {
    const msg = ev.data || {};
    if (msg.type === 'tank-rob-response' && msg.rob) {
      const bpFrame = root.querySelector('.aio-embed-frame');
      if (bpFrame && bpFrame.contentWindow) {
        bpFrame.contentWindow.postMessage({ type: 'tank-rob-response', rob: msg.rob }, '*');
      }
      window.removeEventListener('message', onMsg);
      try { _tankRobFrame.remove(); } catch (_) {}
      _tankRobFrame = null;
    }
  };
  window.addEventListener('message', onMsg);

  _tankRobFrame.onload = () => {
    setTimeout(() => {
      try {
        _tankRobFrame.contentWindow.postMessage({ type: 'request-tank-rob' }, '*');
      } catch (_) {}
    }, 1500);
  };
}
