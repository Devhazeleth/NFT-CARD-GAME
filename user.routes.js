/** @format */

const users = require('../controllers/user.controller.js');
var router = require('express').Router();
const { authenticate } = require('../controllers/auth');

router.get('/', (req, res) => {
	res.json({ message: 'Welcome to tiger' });
});

router.post('/findOne', authenticate, users.findOne);
router.post('/saveProfile', authenticate, users.saveProfile);
router.post('/users', authenticate, users.getAllUser);
router.post('/nfts', authenticate, users.getAllNfts);
router.get('/nonce', users.getNonce);
router.post('/verify', users.verify);

module.exports = router;
