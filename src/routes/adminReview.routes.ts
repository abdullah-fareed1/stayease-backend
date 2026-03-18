import { Router } from 'express';
import { requireAdminAuth, requireAdminRole } from '../middleware/adminMiddleware';
import { deleteReview } from '../controllers/review.controller';

const router = Router();

router.use(requireAdminAuth);
router.delete('/:reviewId', requireAdminRole(['ADMIN', 'MANAGER']), deleteReview);

export default router;