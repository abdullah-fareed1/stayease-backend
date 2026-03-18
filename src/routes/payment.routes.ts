import { Router } from 'express';
import { requireCustomerAuth } from '../middleware/authMiddleware';
import { initiatePayment, getPaymentsForBooking } from '../controllers/payment.controller';

const router = Router();

router.use(requireCustomerAuth);
router.post('/initiate', initiatePayment);
router.get('/booking/:bookingId', getPaymentsForBooking);

export default router;