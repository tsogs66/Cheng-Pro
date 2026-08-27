'use strict';

/**
 * Seed a demo vessel with separate voyage + tank planes.
 */
const path = require('path');
const os = require('os');
const fs = require('fs');

// Use repo data dir unless overridden
process.env.CHENG_PRO_DATA_DIR = process.env.CHENG_PRO_DATA_DIR || path.join(__dirname, '..', 'data');

const store = require('../server/store');

store.ensureDirs();

const existing = store.listVessels().find((v) => v.id === 'mv-demo-harbour');
if (existing) {
  console.log('Demo vessel already present:', existing.id);
  process.exit(0);
}

const vessel = store.createVessel({
  id: 'mv-demo-harbour',
  name: 'MV DEMO HARBOUR',
  imo: '9123456',
  callSign: 'DMOH',
  flag: 'PA',
  company: 'Cheng-Pro Demo Line',
  type: 'Bulk Carrier',
  dwt: '82000',
  notes: 'Seed vessel for Cheng-Pro unified shell',
});

store.upsertTank(vessel.id, {
  id: 'fuel1',
  name: 'NO.1 H.F.O. TANK (P)',
  category: 'fuel',
  fuelGrade: 'hfo',
  fuelRole: 'storage',
  capacity: 850,
  side: 'port',
  tankNo: 1,
});

store.upsertTank(vessel.id, {
  id: 'fuel2',
  name: 'NO.1 H.F.O. TANK (S)',
  category: 'fuel',
  fuelGrade: 'hfo',
  fuelRole: 'storage',
  capacity: 850,
  side: 'starboard',
  tankNo: 1,
});

store.upsertTank(vessel.id, {
  id: 'mgo1',
  name: 'M.G.O. SERVICE TANK',
  category: 'fuel',
  fuelGrade: 'mgo',
  fuelRole: 'service',
  capacity: 45,
  side: 'center',
});

store.saveVoyagePart(vessel.id, 'setup', {
  ...store.emptyVoyageSetup(),
  vesselName: vessel.name,
  imoNo: vessel.imo,
  company: vessel.company,
  flag: vessel.flag,
  dwt: vessel.dwt,
  voyageNumber: '26-01',
  shipCondition: 'B',
  chEng: 'Demo Chief',
  departPort: 'SINGAPORE',
  arrivePort: 'ROTTERDAM',
});

store.saveVoyagePart(vessel.id, 'entries', [
  {
    id: 'e-demo-1',
    vesselId: vessel.id,
    datetime: '2026-08-01 12:00',
    operation: 'NOON',
    condition: 'B',
    distanceShip: 245,
    rpm: 78,
    updatedAt: new Date().toISOString(),
  },
]);

store.setActiveVessel(vessel.id);

console.log('Seeded', vessel.id);
console.log('Data dir:', store.DATA_DIR);
console.log('Host hint:', os.hostname());
console.log('Layout check:', fs.existsSync(path.join(store.VESSELS_DIR, vessel.id, 'tanks', 'tanks.json')) ? 'tanks/ ok' : 'tanks/ MISSING');
console.log('Layout check:', fs.existsSync(path.join(store.VESSELS_DIR, vessel.id, 'voyage', 'setup.json')) ? 'voyage/ ok' : 'voyage/ MISSING');
