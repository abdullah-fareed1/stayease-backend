import { Router } from 'express';
import { adminLogin, adminRefresh, adminLogout, adminForgotPassword, adminResetPassword } from '../controllers/adminAuth.controller';
import { requireAdminAuth } from '../middleware/adminMiddleware';

const router = Router();

router.post('/login', adminLogin);
router.post('/refresh', adminRefresh);
router.post('/logout', requireAdminAuth, adminLogout);
router.post('/forgot-password', adminForgotPassword);
router.post('/reset-password', adminResetPassword);

export default router;