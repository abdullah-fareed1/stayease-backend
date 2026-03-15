import { Router } from 'express';
import { listRooms, getRoomById } from '../controllers/room.controller';

const router = Router();

router.get('/', listRooms);
router.get('/:roomId', getRoomById);

export default router;