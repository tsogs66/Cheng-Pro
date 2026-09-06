'use strict';
const fs = require('fs');
const path = require('path');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'voyage_manager.html'), 'utf8');
let fails = 0, n = 0;
function check(label, ok) {
  n++; console.log(ok ? `  ok   ${label}` : `  FAIL ${label}`);
  if (!ok) fails++;
}
console.log('\nvoyage manual sync + opening recalc + undo');
check('autoSync forced false in ensureSyncConfig', /s\.autoSync\s*=\s*false/.test(HTML) && /_manualSyncV1\s*=\s*true/.test(HTML));
check('markPendingSync does not queue background sync', /function markPendingSync\(\)\{[\s\S]*?Never auto-sync|operator presses Sync Now[\s\S]*?renderSyncUi\(\);\s*\}/.test(HTML));
check('queueBackgroundSync is noop', /function queueBackgroundSync\(\)\{[\s\S]{0,200}permanently disabled/.test(HTML));
check('online handler does not auto sync', /addEventListener\('online'[\s\S]{0,180}Manual sync only/.test(HTML));
check('Vessel Data has opening-meters recalculate button', HTML.includes('id="btnRecalcFromOpeningMeters"'));
check('recalculateFromOpeningMetersAndRob exists', HTML.includes('async function recalculateFromOpeningMetersAndRob'));
check('clears carryover before rebuild', /state\.setup\.carryover\s*=\s*null/.test(HTML));
check('undo stack + undoVoyageRecalculate', HTML.includes('voyageRecalcUndoStack') && HTML.includes('async function undoVoyageRecalculate'));
check('summary recalculate pushes undo snapshot', /pushVoyageRecalcUndo\(/.test(HTML));
check('Undo buttons in summary UI', HTML.includes('id="btnUndoVoyageRecalc"') && HTML.includes('id="btnUndoVoyageRecalcTop"') && HTML.includes('id="btnUndoSummaryRecalc"'));
check('auto-sync option disabled in UI', /option value="true"[^>]*disabled/.test(HTML));
console.log(fails ? `\nFAILED ${fails}/${n}` : `\nPASSED ${n}`);
process.exit(fails ? 1 : 0);
