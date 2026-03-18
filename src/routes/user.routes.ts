import { Router } from 'express';
import { requireCustomerAuth } from '../middleware/authMiddleware';
import { updateFcmToken } from '../controllers/notification.controller';

const router = Router();

router.patch('/fcm-token', requireCustomerAuth, updateFcmToken);

export default router;