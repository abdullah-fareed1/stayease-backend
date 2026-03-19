import { Router } from 'express';
import { requireAdminAuth, requireAdminRole } from '../middleware/adminMiddleware';
import { getHotelConfig, updateHotelConfig } from '../controllers/config.controller';

const router = Router();

router.get('/config', getHotelConfig);
router.put('/config', requireAdminAuth, requireAdminRole(['ADMIN']), updateHotelConfig);

export default router;