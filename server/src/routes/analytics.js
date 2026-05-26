const { Router } = require('express');
const ctrl = require('../controllers/analyticsController');

const router = Router();

router.get('/stats/:instrumentId', ctrl.getAggregateStats);
router.get('/compare/:id1/:id2', ctrl.compareInstruments);
router.get('/trend/:instrumentId', ctrl.getPriceTrend);
router.get('/forecast/:instrumentId', ctrl.getForecast);
router.get('/export/:instrumentId', ctrl.exportTimeSeries);
router.get('/risk/:instrumentId', ctrl.getRiskMetrics);

module.exports = router;
