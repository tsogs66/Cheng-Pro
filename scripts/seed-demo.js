'use strict';

/**
 * Seed demo vessel into the shared Tank Chief store (Cheng-Pro data dir).
 */
const path = require('path');
process.env.CHENG_PRO_DATA_DIR = process.env.CHENG_PRO_DATA_DIR || path.join(__dirname, '..', 'data');
process.env.TMS_DATA_DIR = process.env.CHENG_PRO_DATA_DIR;

const store = require('../modules/tanks/server/store');

store.ensureDirs();

const existing = store.listVessels().find((v) => v.id === 'mv-demo-harbour' || v.id === 'captain-veniamis');
if (existing) {
  store.setActiveVessel(existing.id);
  console.log('Demo vessel already present:', existing.id);
  process.exit(0);
}

// Prefer tank-management seed if available
const fs = require('fs');
const seedDir = path.join(__dirname, '..', 'modules', 'tanks', 'seed');
if (fs.existsSync(path.join(seedDir, 'vessel.json'))) {
  const vessel = JSON.parse(fs.readFileSync(path.join(seedDir, 'vessel.json'), 'utf8'));
  const tanks = JSON.parse(fs.readFileSync(path.join(seedDir, 'tanks.json'), 'utf8'));
  const readings = fs.existsSync(path.join(seedDir, 'readings.json'))
    ? JSON.parse(fs.readFileSync(path.join(seedDir, 'readings.json'), 'utf8'))
    : {};
  const created = store.createVessel({
    id: vessel.id || 'captain-veniamis',
    name: vessel.name,
    imo: vessel.imo,
    callSign: vessel.callSign,
    flag: vessel.flag,
    type: vessel.type,
    owner: vessel.owner,
    dwt: vessel.dwt,
    notes: vessel.notes,
    tanks,
    readings,
  });
  store.setActiveVessel(created.id);
  console.log('Seeded from Tank Chief seed:', created.id);
} else {
  const vessel = store.createVessel({
    id: 'mv-demo-harbour',
    name: 'MV DEMO HARBOUR',
    imo: '9123456',
    callSign: 'DMOH',
    flag: 'PA',
    company: 'Cheng-Pro Demo Line',
    type: 'Bulk Carrier',
    dwt: '82000',
  });
  store.upsertTank(vessel.id, {
    id: 'fuel1', name: 'NO.1 H.F.O. TANK (P)', category: 'fuel',
    fuelGrade: 'hfo', fuelRole: 'storage', capacity: 850, side: 'port',
  });
  store.setActiveVessel(vessel.id);
  console.log('Seeded minimal demo:', vessel.id);
}

console.log('Data dir:', store.DATA_DIR);
console.log('Active:', store.getActiveVesselId());
