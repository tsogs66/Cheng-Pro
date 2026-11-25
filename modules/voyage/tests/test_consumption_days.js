#!/usr/bin/env node
/*
 * Consumption plan: the days of a sea leg are distance / (speed x 24) and the quantity is the daily consumption x the exact
 * days. Calculated days are shown to two decimals (the Days box, the result boxes); days typed by hand and port stays show as typed.
 * Run: node tests/test_consumption_days.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'www', 'voyage_manager.html'), 'utf8');
let checks = 0, failures = 0;
function check(label, cond) { checks++; if (!cond) failures++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}`); }
const near = (a, b, e = 1e-9) => a != null && Math.abs(a - b) <= e;
function extract(name) {
  const start = HTML.indexOf(`function ${name}(`); if (start < 0) throw new Error(name + ' not found');
  let depth = 0, i = HTML.indexOf('{', start);
  for (; i < HTML.length; i++) { if (HTML[i] === '{') depth++; else if (HTML[i] === '}') { depth--; if (!depth) break; } }
  return HTML.slice(start, i + 1);
}
const sb = { console, StemAdvice: undefined };
vm.createContext(sb);
vm.runInContext('const FUEL_DECIMALS = 3;', sb);
vm.runInContext(['fmt', 'fmtFuel', 'bunkerLegDays', 'bunkerLegQty', 'bunkerLegMarginMt', 'summarizeBunkerSide', 'bunkerResultCard', 'bunkerResultCardsHtml', 'bunkerDaysShown']
  .map(extract).join('\n'), sb);

const sea = { port: false, from: 'A', to: 'B', distance: 1000, speed: 12, dailyCons: 30, days: null, marginPct: 10 };
check('sea days = distance / (speed x 24) = 3.4722...', near(sb.bunkerLegDays(sea), 1000 / 288));
check('quantity = daily consumption x the exact days (104.1666...)', near(sb.bunkerLegQty(sea), 30 * 1000 / 288));
check('the margin is a percentage of that quantity', near(sb.bunkerLegMarginMt(sea), sb.bunkerLegQty(sea) * 0.1));
check('the Days box shows the worked days to two decimals (3.47)', sb.bunkerDaysShown(sea, sb.bunkerLegDays(sea)) === 3.47);
check('and rounds the second decimal (3.819 -> 3.82)', sb.bunkerDaysShown({ ...sea, distance: 1100 }, 1100 / 288) === 3.82);
check('days typed by hand show as typed', sb.bunkerDaysShown({ ...sea, days: 3.456, daysManual: true }, 3.456) === 3.456);
check('a port stay shows as typed', sb.bunkerDaysShown({ port: true, days: 1.5 }, 1.5) === 1.5);

const port = { port: true, from: 'P', to: 'P', distance: null, speed: null, dailyCons: 5, days: 2.5, marginPct: 0 };
const side = { grade: 'HFO', legs: [sea, port, { ...sea, distance: 777, speed: 11.3 }], currentRob: 1000, qtyReceive: 0, deliveryRob: null };
const sum = sb.summarizeBunkerSide(side);
const seaDays = 1000 / 288 + 777 / (11.3 * 24);
check('the totals add the exact days of the sea legs and of the port stays', near(sum.daysSea, seaDays) && near(sum.daysPort, 2.5));
check('total consumption adds every leg', near(sum.totalCons, 30 * 1000 / 288 + 5 * 2.5 + 30 * 777 / (11.3 * 24)));
const html = sb.bunkerResultCardsHtml(sum);
const cards = {};
for (const m of html.matchAll(/<b>([^<]*)<\/b>(?:<span[^>]*>[^<]*<\/span>)?<\/div><div class="bp-result-title">([^<]*)</g)) cards[m[2]] = m[1];
check('the Days at Sea box shows two decimals: ' + cards['Days at Sea'], cards['Days at Sea'] === seaDays.toFixed(2));
check('the Days at Port / Anchor box shows two decimals', cards['Days at Port / Anchor'] === '2.50');
check('no third decimal in the days boxes', !/\.\d{3}/.test(cards['Days at Sea']) && !/\.\d{3}/.test(cards['Days at Port / Anchor']));
check('the quantity boxes are still three decimals', /^\d+\.\d{3}$/.test(cards['Total Consumption']));

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
