const { Router } = require('express');
const ctrl = require('../controllers/portfolioController');

const router = Router();

router.get('/owners', ctrl.listOwners);
router.get('/owners/:id', ctrl.getOwner);
router.post('/owners', ctrl.createOwner);

router.get('/', ctrl.listPortfolios);
router.get('/:id', ctrl.getPortfolio);
router.post('/', ctrl.createPortfolio);

router.post('/assets', ctrl.addAsset);
router.delete('/assets/:id', ctrl.removeAsset);

module.exports = router;
