'use strict';

const express = require('express');
const store = require('../store');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    vessels: store.listVessels(),
    activeVesselId: store.getActiveVesselId(),
  });
});

router.post('/', (req, res) => {
  try {
    const vessel = store.createVessel(req.body || {});
    res.status(201).json(vessel);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/active', (req, res) => {
  try {
    const { id } = req.body || {};
    res.json(store.setActiveVessel(id));
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    res.json(store.getSharedVessel(req.params.id));
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    res.json(store.updateVesselDetails(req.params.id, req.body || {}));
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

router.put('/:id/assets', (req, res) => {
  try {
    res.json(store.saveAssets(req.params.id, req.body || {}));
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    res.json(store.deleteVessel(req.params.id));
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

module.exports = router;
