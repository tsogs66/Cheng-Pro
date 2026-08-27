'use strict';

const express = require('express');
const store = require('../store');
const { computeTank } = require('../calc');

const router = express.Router();

function resolveId(req) {
  return req.params.vesselId || req.query.vesselId || store.getActiveVesselId();
}

router.get('/:vesselId', (req, res) => {
  try {
    res.json(store.getTanksBundle(req.params.vesselId));
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

router.put('/:vesselId/:part', (req, res) => {
  try {
    res.json(store.saveTankPart(req.params.vesselId, req.params.part, req.body));
  } catch (e) {
    const status = /Unknown|not found/i.test(e.message) ? 404 : 400;
    res.status(status).json({ error: e.message });
  }
});

router.post('/:vesselId/tanks', (req, res) => {
  try {
    res.status(201).json(store.upsertTank(req.params.vesselId, req.body || {}));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/:vesselId/tanks/:tankId', (req, res) => {
  try {
    res.json(store.upsertTank(req.params.vesselId, { ...(req.body || {}), id: req.params.tankId }));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/:vesselId/tanks/:tankId', (req, res) => {
  try {
    res.json(store.deleteTank(req.params.vesselId, req.params.tankId));
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

router.put('/:vesselId/tanks/:tankId/calibration', (req, res) => {
  try {
    res.json(store.updateCalibration(req.params.vesselId, req.params.tankId, req.body || {}));
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

router.post('/:vesselId/calculate', (req, res) => {
  try {
    const bundle = store.getTanksBundle(req.params.vesselId);
    const tankId = req.body?.tankId;
    const tank = store.findTankInBundle(bundle.tanks, tankId);
    if (!tank) return res.status(404).json({ error: 'Tank not found' });
    const reading = {
      ...(bundle.readings[tankId] || {}),
      ...(req.body || {}),
    };
    const result = computeTank(tank, reading);
    res.json({ tankId, tank, reading, result });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/', (req, res) => {
  try {
    const id = resolveId(req);
    if (!id) return res.status(400).json({ error: 'No active vessel' });
    res.json(store.getTanksBundle(id));
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

module.exports = router;
