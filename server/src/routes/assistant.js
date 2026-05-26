const { Router } = require('express');
const ctrl = require('../controllers/assistantController');

const router = Router();

router.get('/tools', ctrl.getTools);
router.post('/call', ctrl.callTool);
router.post('/chat', ctrl.chat);

module.exports = router;
