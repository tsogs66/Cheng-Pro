/* Receipts log: sulphur content (% m/m) replaces LCV. */
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'www', 'voyage_manager.html'), 'utf8');
let fails = 0;
const ok = (l, v) => { console.log((v ? '  ok   ' : '  FAIL ') + l); if (!v) fails++; };
ok('form has a sulphur field', /id="rcpt_sulphur"/.test(html) && /Sulphur content \(% m\/m\)/.test(html));
ok('form still has an optional LCV box next to it', /id="rcpt_lcv"/.test(html) && /LCV \(kJ\/kg\) — if on the BDN/.test(html));
ok('the receipt stores LCV when given', /receipt\.lcv = lcvIn/.test(html));
ok('the receipt stores sulphur', /receipt\.sulphur = sulphur/.test(html));
ok('the log shows sulphur and LCV, each when present', /r\.sulphur!=null \? `S \$\{fmt\(r\.sulphur,3\)\} %`[^\n]*r\.lcv!=null \? `LCV/.test(html));
ok('the sulphur box is cleared after logging', /rcpt_sulphur'\)\.value = ''/.test(html));
console.log(fails ? `FAILED ${fails}` : 'PASSED');
process.exit(fails ? 1 : 0);
