import { Router } from 'express';
import { requireCustomerAuth } from '../middleware/authMiddleware';
import { createBooking, getMyBookings, getMyBookingById, cancelBooking } from '../controllers/booking.controller';

const router = Router();

router.use(requireCustomerAuth);

router.post('/', createBooking);
router.get('/my', getMyBookings);
router.get('/my/:bookingId', getMyBookingById);
router.delete('/:bookingId/cancel', cancelBooking);

export default router;