window.ChengProModules = window.ChengProModules || {};

function parseSemverParts(v) {
  const m = String(v || '').trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}
function isNewerVersion(latest, current) {
  const a = parseSemverParts(latest);
  const b = parseSemverParts(current);
  if (!a || !b) return String(latest) !== String(current);
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return false;
}
function currentAioVersion() {
  const el = document.getElementById('appVersion');
  const raw = (el && el.textContent) || '';
  const m = raw.match(/v?(\d+\.\d+\.\d+)/);
  if (m) return m[1];
  try {
    return (window.CHENG_PRO_VERSION || '').replace(/^v/i, '') || '0.3.63';
  } catch {
    return '0.3.63';
  }
}
async function checkAioAppUpdate() {
  const status = document.getElementById('about-update-status');
  const link = document.getElementById('about-update-link');
  const current = currentAioVersion();
  if (status) status.textContent = 'Checking GitHub for the latest ChEng AIO release…';
  if (link) link.style.display = 'none';
  try {
    const res = await fetch('https://api.github.com/repos/tsogs66/Cheng-Pro/releases/latest', {
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error('GitHub returned HTTP ' + res.status);
    const data = await res.json();
    const tag = String(data.tag_name || '').replace(/^v/i, '');
    const url = data.html_url || 'https://github.com/tsogs66/Cheng-Pro/releases/latest';
    const apk = Array.isArray(data.assets)
      ? data.assets.find((a) => /\.apk$/i.test(a.name || ''))
      : null;
    if (link) {
      link.href = apk && apk.browser_download_url ? apk.browser_download_url : url;
      link.textContent = apk ? ('Download ' + (apk.name || 'APK')) : 'Open latest release';
      link.style.display = 'inline';
    }
    if (!tag) {
      if (status) status.textContent = 'Could not read the latest release tag.';
      return;
    }
    if (isNewerVersion(tag, current)) {
      if (status) {
        status.textContent =
          'Update available: v' + tag + ' (this device: v' + current +
          '). Download the APK and open it — Android installs over the existing app; do not uninstall first.';
      }
    } else {
      if (status) status.textContent = 'You are on the latest release (v' + current + ').';
    }
  } catch (err) {
    if (status) {
      status.textContent =
        'Could not check for updates (' + (err && err.message ? err.message : 'offline') +
        '). Open GitHub releases when you have internet.';
    }
    if (link) {
      link.href = 'https://github.com/tsogs66/Cheng-Pro/releases/latest';
      link.textContent = 'Open latest release';
      link.style.display = 'inline';
    }
  }
}

window.ChengProModules.about = {
  title: 'About & Guide',
  async render(root) {
    const ver = currentAioVersion();
    root.innerHTML = `
      <section class="panel home-hero">
        <p class="home-kicker">About</p>
        <h1>ChEng AIO</h1>
        <p class="home-lead">
          Marine Engineer Suite brings Voyage Chief, Tank Chief, e-ORB, and Performance
          onto one vessel identity. Built for daily work at sea — offline first, sync when the link is up.
        </p>
        <p class="home-meta">ts0gs · Marvin C. Endozo · v${ver}</p>
        <div class="form-actions" style="margin-top:14px;">
          <button type="button" class="btn primary" id="btnCheckAioUpdate">Check for latest release</button>
          <a class="btn" id="about-update-link" href="https://github.com/tsogs66/Cheng-Pro/releases/latest" target="_blank" rel="noopener" style="display:none;">Open latest release</a>
        </div>
        <p class="hint" id="about-update-status" role="status" aria-live="polite" style="margin-top:10px;"></p>
      </section>

      <section class="panel home-section" id="about-licensing">
        <h2>How licensing works here</h2>
        <p class="home-copy">
          You activate once in ChEng AIO with the email and key from your office.
          Voyage Chief and Tank Chief opened from this menu use that same seat —
          you do not sign in again. Standalone Voyage or Tank installs keep their own keys.
        </p>
        <div class="form-actions">
          <button type="button" class="btn" data-go-about="license">License</button>
          <button type="button" class="btn" data-go-about="vessel">Vessel Setup</button>
        </div>
      </section>

      <section class="panel home-section" id="about-programs">
        <h2>Programs in this suite</h2>
        <div class="home-feature-list">
          <article>
            <h3>ChEng AIO (shell)</h3>
            <p>Vessel list, active ship, license seat, Performance, and the menu that opens the other programs. Activate once here; programs launched from AIO do not ask for the key again.</p>
          </article>
          <article>
            <h3>Voyage Chief</h3>
            <p>Noon and intermediate reports, ROB chain, bunker receipts, voyage library, abstracts, and printouts. Sync URL stays on the Setup tab when you use a self-hosted server.</p>
          </article>
          <article>
            <h3>Tank Chief</h3>
            <p>Soundings with trim/list, calibration tables, fuel condition reports, bunkering, and peer sync of vessel folders.</p>
          </article>
          <article>
            <h3>e-ORB</h3>
            <p>Electronic Oil Record Book Part I — coded entries, signatures, browse and print. In AIO it opens in place; in standalone Voyage it appears only if the license includes e-ORB.</p>
          </article>
          <article>
            <h3>Performance</h3>
            <p>Watch or voyage performance between two times — distance, slip, consumption, and engine run hours from the figures you already keep.</p>
          </article>
          <article>
            <h3>License</h3>
            <p>Email + key activation, Android/Windows seats, pairing, and seat transfer. Office issues keys from <code>/license-admin</code>.</p>
          </article>
        </div>
      </section>

      <section class="panel home-section" id="about-faq">
        <h2>FAQ — how to operate</h2>
        <p class="home-copy">
          Search a question, or pick a group. Each answer says what the job is for, the steps,
          what the buttons do, and how to undo a mistake. Day-to-day use is answered here.
        </p>
        <div id="about-guide-host"></div>
      </section>
    `;
    if (window.ChengProAboutGuide) ChengProAboutGuide.render(root.querySelector('#about-guide-host'));
    root.querySelector('#btnCheckAioUpdate')?.addEventListener('click', checkAioAppUpdate);
    root.querySelectorAll('[data-go-about]').forEach((btn) => {
      btn.onclick = () =>
        window.dispatchEvent(new CustomEvent('chengpro:navigate', { detail: btn.dataset.goAbout }));
    });
  },
};
