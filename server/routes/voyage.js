'use strict';

const express = require('express');
const store = require('../store');

const router = express.Router();

router.get('/:vesselId', (req, res) => {
  try {
    const legs = store.listVoyageLegs(req.params.vesselId);
    const bundle = store.getVoyageBundle(req.params.vesselId);
    res.json({ ...bundle, legs });
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

router.put('/:vesselId/:part', (req, res) => {
  try {
    // Prevent writing shared identity through voyage setup blindly —
    // setup may hold machinery fields; identity mirrors stay in vessel.json
    if (req.params.part === 'setup') {
      const body = { ...(req.body || {}) };
      const shared = store.getSharedVessel(req.params.vesselId).vessel;
      body.vesselName = shared.name;
      body.imoNo = shared.imo;
      body.company = shared.company;
      body.flag = shared.flag;
      body.dwt = shared.dwt;
      return res.json(store.saveVoyagePart(req.params.vesselId, 'setup', body));
    }
    res.json(store.saveVoyagePart(req.params.vesselId, req.params.part, req.body));
  } catch (e) {
    const status = /Unknown|not found/i.test(e.message) ? 404 : 400;
    res.status(status).json({ error: e.message });
  }
});

router.get('/:vesselId/:voyageNumber', (req, res) => {
  try {
    const legs = store.listVoyageLegs(req.params.vesselId)
      .filter((l) => String(l.voyageNumber) === String(req.params.voyageNumber));
    res.json({ vesselId: req.params.vesselId, voyageNumber: req.params.voyageNumber, legs });
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

router.get('/:vesselId/:voyageNumber/:condition', (req, res) => {
  try {
    res.json(store.getVoyageLeg(req.params.vesselId, req.params.voyageNumber, req.params.condition));
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

router.put('/:vesselId/:voyageNumber/:condition', (req, res) => {
  try {
    const merged = store.putVoyageLeg(
      req.params.vesselId,
      req.params.voyageNumber,
      req.params.condition,
      req.body || {}
    );
    res.json(merged);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
