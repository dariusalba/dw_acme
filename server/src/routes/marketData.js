const { Router } = require('express');
const ctrl = require('../controllers/marketDataController');

const router = Router();

router.get('/quote/:symbol', ctrl.getGlobalQuote);
router.post('/ingest/:symbol', ctrl.ingestQuote);
router.post('/refresh', ctrl.refreshQuotes);

module.exports = router;
