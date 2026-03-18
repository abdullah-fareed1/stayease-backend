import { Router } from 'express';
import { requireAdminAuth } from '../middleware/adminMiddleware';
import { sendNotification, getNotifications } from '../controllers/notification.controller';

const router = Router();

router.use(requireAdminAuth);
router.post('/send', sendNotification);
router.get('/', getNotifications);

export default router;