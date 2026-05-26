const { Router } = require('express');
const ctrl = require('../controllers/dataSourceController');

const router = Router();

router.get('/', ctrl.listDataSources);
router.get('/:id', ctrl.getDataSource);
router.post('/', ctrl.createDataSource);

module.exports = router;
