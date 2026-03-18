import { Router } from 'express';
import { requireAdminAuth } from '../middleware/adminMiddleware';
import { getHotelConfig, updateHotelConfig } from '../controllers/config.controller';

const router = Router();

router.get('/', getHotelConfig);
router.put('/', requireAdminAuth, updateHotelConfig);

export default router;