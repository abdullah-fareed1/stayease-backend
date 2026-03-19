import { Router } from 'express';
import { requireCustomerAuth } from '../middleware/authMiddleware';
import { createReview } from '../controllers/review.controller';

const router = Router();

router.post('/', requireCustomerAuth, createReview);

export default router;