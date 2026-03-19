import { Router } from 'express';
import { listRooms, getRoomById } from '../controllers/room.controller';
import { getRoomReviews } from '../controllers/review.controller';

const router = Router();

router.get('/', listRooms);
router.get('/:roomId', getRoomById);
router.get('/:roomId/reviews', getRoomReviews);

export default router;