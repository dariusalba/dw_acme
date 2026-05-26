const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/sparkController');

router.get('/status', ctrl.getStatus);
router.get('/aggregations', ctrl.getAggregations);
router.get('/predictions', ctrl.getPredictions);
router.get('/predictions/:symbol', ctrl.getPredictionBySymbol);
router.post('/run', ctrl.runJob);

router.get('/internal/source-data', ctrl.getSourceData);
router.post('/internal/save-aggregations', ctrl.saveAggregations);
router.post('/internal/save-predictions', ctrl.savePredictions);

module.exports = router;
