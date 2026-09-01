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
    return (window.CHENG_PRO_VERSION || '').replace(/^v/i, '') || '0.3.30';
  } catch {
    return '0.3.30';
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
          Chief Engineer All-In-One brings Voyage Chief, Tank Chief, e-ORB, and Performance
          onto one vessel identity. Built for daily work at sea — offline first, sync when the link is up.
        </p>
        <p class="home-meta">ts0gs · Marvin C. Endozo · v${ver}</p>
        <div class="form-actions" style="margin-top:14px;">
          <button type="button" class="btn primary" id="btnCheckAioUpdate">Check for latest release</button>
          <a class="btn" id="about-update-link" href="https://github.com/tsogs66/Cheng-Pro/releases/latest" target="_blank" rel="noopener" style="display:none;">Open latest release</a>
        </div>
        <p class="hint" id="about-update-status" role="status" aria-live="polite" style="margin-top:10px;"></p>
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

      <section class="panel home-section" id="about-howto">
        <h2>How to use — step by step</h2>

        <h3 class="about-sub">1. First start (any device)</h3>
        <ol class="about-steps">
          <li>Open ChEng AIO in the browser, PWA, or installed app.</li>
          <li>Enter the <strong>email</strong> and <strong>license key</strong> from your office (prefixes: <code>CA-</code> AIO, <code>VC-</code> Voyage, <code>TC-</code> Tank, <code>MA-</code> master).</li>
          <li>Create or select the vessel (name, IMO). That ship becomes the active vessel for every program.</li>
          <li>Open Voyage or Tanks from the menu — they inherit the AIO seat when launched from here.</li>
        </ol>

        <h3 class="about-sub">2. Voyage Chief (daily noon)</h3>
        <ol class="about-steps">
          <li>Confirm vessel particulars and tank/engine setup under Vessel Data.</li>
          <li>Enter the noon (or intermediate) report; save so ROB carries forward.</li>
          <li>Log bunker receipts when fuel is received; keep the voyage library for past B/L legs.</li>
          <li>Optional: Setup → Server Sync — set URL and API token, then push/pull the active leg.</li>
        </ol>

        <h3 class="about-sub">3. Tank Chief (sounding / bunker)</h3>
        <ol class="about-steps">
          <li>Open Tanks on the active vessel.</li>
          <li>Import or edit calibration tables; take soundings with trim and list.</li>
          <li>Build the fuel oil (tank condition) report; use bunker plan / after / summary as needed.</li>
          <li>Backup / Sync to another PC or the AIO server when online.</li>
        </ol>

        <h3 class="about-sub">4. e-ORB</h3>
        <ol class="about-steps">
          <li>From AIO, open <strong>e-ORB</strong> (full book in the shell).</li>
          <li>Complete ship particulars for the book, then add coded entries with officer/CE signatures.</li>
          <li>Browse, filter, and print/export the book for inspection.</li>
        </ol>

        <h3 class="about-sub">5. Performance</h3>
        <ol class="about-steps">
          <li>Set period start and end (and note any clock change).</li>
          <li>Enter distance, revolutions or run hours, and consumption as required.</li>
          <li>Read slip, SFOC-related figures, and totals for the watch or voyage segment.</li>
        </ol>

        <h3 class="about-sub">6. Android APK updates</h3>
        <ol class="about-steps">
          <li>Use <strong>Check for latest release</strong> above when online.</li>
          <li>Download the new <code>ChEngAIO-*.apk</code> and open it — Android updates in place; do not uninstall first.</li>
          <li>If a very old debug-signed build is installed, uninstall that one once; later builds overwrite cleanly.</li>
        </ol>
      </section>

      <section class="panel home-section" id="about-scenarios">
        <h2>Operational scenarios</h2>
        <div class="home-feature-list">
          <article>
            <h3>At sea, no internet</h3>
            <p>Work fully offline after activation. Grace window refreshes when the device next reaches the license host. Voyage and tank data stay on the device until you sync.</p>
          </article>
          <article>
            <h3>Hand-over to relief CE</h3>
            <p>Export vessel / full database backup from Voyage Setup or Tank Backup. On the new machine, activate with the same email+key (seat transfer if the old device still holds a seat), then import.</p>
          </article>
          <article>
            <h3>Office issues a new AIO key</h3>
            <p>In <code>/license-admin</code>, choose <code>cheng-aio</code>, tick Voyage / Tank / e-ORB as needed, enter the CE email, Issue &amp; email. CE activates once in AIO.</p>
          </article>
          <article>
            <h3>Standalone Voyage only</h3>
            <p>Use a <code>VC-</code> key. e-ORB tab appears only with the e-ORB add-on. Sync URL remains on Setup. No fleet username login in the current packaging.</p>
          </article>
          <article>
            <h3>Inspection — ORB book</h3>
            <p>Open e-ORB, filter the period, print or export. Entries remain tied to the voyage vessel database.</p>
          </article>
          <article>
            <h3>Two ships on one tablet</h3>
            <p>Switch active vessel in AIO (or Voyage vessel list). Each ship keeps its own voyage and tank records under that vessel id.</p>
          </article>
        </div>
      </section>

      <section class="panel home-section" id="about-faq">
        <h2>FAQ</h2>
        <dl class="about-faq">
          <dt>Why do Voyage/Tank open without asking for a key from AIO?</dt>
          <dd>AIO already holds the seat. Programs opened with <code>chengaio=1</code> reuse that entitlement. Standalone installs still activate on their own.</dd>

          <dt>Menu shows a warning on Voyage or Tanks</dt>
          <dd>That program is not on your AIO key. Ask the office to re-issue with the Voyage Chief and/or Tank Chief boxes ticked (or use a standalone VC/TC key).</dd>

          <dt>Where is Fleet Office / account sign-in?</dt>
          <dd>Archived in Voyage for later restore. Current model is license email + local vessels + optional sync URL.</dd>

          <dt>Can I use Desktop mode on my phone browser?</dt>
          <dd>No — the apps lock the viewport to the mobile layout so forms and navigation stay usable on phone and tablet.</dd>

          <dt>Lost phone / PC</dt>
          <dd>Use seat transfer from the License page (cooldown applies) or ask the office to force-clear the seat in license admin.</dd>

          <dt>Where is my data?</dt>
          <dd>On the device (browser/app storage). Server copies live under the license email folder when sync is configured. Master keys can open any user folder on the host.</dd>

          <dt>Who built this?</dt>
          <dd>ts0gs — Marvin C. Endozo. Marine chief engineer tools for real shipboard use.</dd>
        </dl>
      </section>
    `;
    root.querySelector('#btnCheckAioUpdate')?.addEventListener('click', checkAioAppUpdate);
  },
};
