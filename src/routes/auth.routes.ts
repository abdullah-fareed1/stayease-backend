import { Router } from 'express';
import { register, login, refresh, logout, forgotPassword, resetPassword } from '../controllers/auth.controller';
import { requireCustomerAuth } from '../middleware/authMiddleware';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', requireCustomerAuth, logout);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

export default router;