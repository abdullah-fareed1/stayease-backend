import { Router } from 'express';
import { requireCustomerAuth } from '../middleware/authMiddleware';
import { createReview, getRoomReviews } from '../controllers/review.controller';

const router = Router();

router.get('/rooms/:roomId/reviews', getRoomReviews);
router.post('/reviews', requireCustomerAuth, createReview);

export default router;