const { Router } = require('express');
const ctrl = require('../controllers/instrumentController');

const router = Router();

router.get('/', ctrl.listInstruments);
router.get('/:id', ctrl.getInstrument);
router.get('/:id/at', ctrl.getInstrumentAtTime);
router.get('/:id/versions', ctrl.getInstrumentVersions);
router.post('/', ctrl.createInstrument);
router.put('/:id', ctrl.updateInstrument);
router.delete('/:id', ctrl.deleteInstrument);

module.exports = router;
