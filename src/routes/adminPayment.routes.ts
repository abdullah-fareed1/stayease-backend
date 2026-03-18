import { Router } from 'express';
import { requireAdminAuth } from '../middleware/adminMiddleware';
import { adminRefundPayment } from '../controllers/adminPayment.controller';

const router = Router();

router.use(requireAdminAuth);
router.post('/:paymentId/refund', adminRefundPayment);

export default router;