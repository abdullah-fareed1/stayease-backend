import { Router } from 'express';
import multer from 'multer';
import { requireAdminAuth, requireAdminRole } from '../middleware/adminMiddleware';
import {
  adminListRooms,
  createRoom,
  updateRoom,
  setAvailability,
  addImage,
  deleteImageFromRoom,
  setPrimaryImage,
  deleteRoom,
} from '../controllers/adminRoom.controller';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const router = Router();

router.use(requireAdminAuth);

router.get('/', adminListRooms);
router.post('/', createRoom);
router.put('/:roomId', updateRoom);
router.patch('/:roomId/availability', setAvailability);
router.post('/:roomId/images', upload.single('image'), addImage);
router.delete('/:roomId/images/:imageId', deleteImageFromRoom);
router.patch('/:roomId/images/:imageId/primary', setPrimaryImage);
router.delete('/:roomId', requireAdminRole(['ADMIN']), deleteRoom);

export default router;