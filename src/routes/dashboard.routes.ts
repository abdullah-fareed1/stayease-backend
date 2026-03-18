import { Router } from 'express';
import { requireAdminAuth } from '../middleware/adminMiddleware';
import { getDashboardOverview } from '../controllers/dashboard.controller';

const router = Router();

router.use(requireAdminAuth);
router.get('/overview', getDashboardOverview);

export default router;