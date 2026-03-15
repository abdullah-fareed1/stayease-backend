import { Router } from 'express';
import { requireAdminAuth } from '../middleware/adminMiddleware';
import { getAllBookings, getBookingById, createWalkIn, updateBookingStatus } from '../controllers/adminBooking.controller';

const router = Router();

router.use(requireAdminAuth);

router.get('/', getAllBookings);
router.post('/walk-in', createWalkIn);
router.get('/:bookingId', getBookingById);
router.patch('/:bookingId/status', updateBookingStatus);

export default router;