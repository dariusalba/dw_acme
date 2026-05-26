const { Router } = require('express');
const ctrl = require('../controllers/timeSeriesController');

const router = Router();

router.get('/instrument/:instrumentId', ctrl.getTimeSeriesByInstrument);
router.get('/:instrumentId/:dataSourceId', ctrl.getTimeSeries);
router.post('/ingest', ctrl.ingestTimeSeries);

module.exports = router;
