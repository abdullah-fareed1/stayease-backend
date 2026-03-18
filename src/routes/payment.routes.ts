import { Router } from 'express';
import express from 'express';
import { requireCustomerAuth } from '../middleware/authMiddleware';
import { initiatePayment, stripeWebhook, getPaymentsForBooking } from '../controllers/payment.controller';

const router = Router();

router.post('/webhook', express.raw({ type: 'application/json' }), stripeWebhook);

router.use(requireCustomerAuth);
router.post('/initiate', initiatePayment);
router.get('/booking/:bookingId', getPaymentsForBooking);

export default router;