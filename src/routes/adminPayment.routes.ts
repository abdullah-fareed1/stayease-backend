import { Router } from 'express';
import { requireAdminAuth } from '../middleware/adminMiddleware';
import { adminRefundPayment, getPaymentsForBooking } from '../controllers/adminPayment.controller';

const router = Router();

router.use(requireAdminAuth);
router.post('/:paymentId/refund', adminRefundPayment);
router.get('/booking/:bookingId', getPaymentsForBooking);

export default router;