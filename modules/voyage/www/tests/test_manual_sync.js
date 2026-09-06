'use strict';
const fs = require('fs');
const path = require('path');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'voyage_manager.html'), 'utf8');
let fails = 0, checks = 0;
function check(label, cond) {
  checks += 1;
  console.log(cond ? `  ok   ${label}` : `  FAIL ${label}`);
  if (!cond) fails += 1;
}
console.log('\nvoyage manual sync default');
check('Auto-sync select defaults to Manual only', /id="sync_auto"[^>]*>\s*<option value="false" selected>Manual only<\/option>/.test(HTML));
check('state default autoSync false', /autoSync:\s*false/.test(HTML));
check('ensureSyncConfig migrates to manual', HTML.includes('_manualSyncV1') && HTML.includes('s.autoSync = false'));
check('markPendingSync still gated by autoSync', /if \(sync\.autoSync && navigator\.onLine\) queueBackgroundSync\(\)/.test(HTML));
check('Sync Now button present', HTML.includes('id="btnSyncNow"'));
check('banner says Sync Now', HTML.includes('until you press Sync Now'));
console.log(fails ? `\nFAILED — ${fails} of ${checks}` : `\nPASSED — ${checks} checks`);
process.exit(fails ? 1 : 0);
