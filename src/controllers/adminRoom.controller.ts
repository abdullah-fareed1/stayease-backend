import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { success, error } from '../utils/response';
import { uploadImage, deleteImage } from '../services/cloudinary.service';
import { RoomCategory, AvailabilityStatus } from '../generated/prisma/client';

const VALID_CATEGORIES: RoomCategory[] = ['STANDARD', 'DELUXE', 'SUITE', 'FAMILY'];
const VALID_STATUSES: AvailabilityStatus[] = ['AVAILABLE', 'TEMP_UNAVAILABLE', 'PERMANENTLY_UNAVAILABLE'];

type MulterFile = { mimetype: string; size: number; buffer: Buffer };

export const createRoom = async (req: Request, res: Response) => {
  let { title, category, description, pricePerNight, maxGuests, amenities } = req.body;

  title = (title || '').trim();
  description = (description || '').trim();

  if (!title || title.length < 3 || title.length > 200) {
    return error(res, 'Title must be between 3 and 200 characters.', 400);
  }
  if (!category || !VALID_CATEGORIES.includes(category)) {
    return error(res, 'A valid category is required (STANDARD, DELUXE, SUITE, FAMILY).', 400);
  }
  if (!description || description.length < 20) {
    return error(res, 'Description must be at least 20 characters.', 400);
  }

  const price = parseFloat(pricePerNight);
  if (!pricePerNight || isNaN(price) || price <= 0 || price > 99999.99) {
    return error(res, 'pricePerNight must be a positive number up to 99999.99.', 400);
  }

  const guests = parseInt(maxGuests);
  if (!maxGuests || isNaN(guests) || guests < 1 || guests > 20) {
    return error(res, 'maxGuests must be an integer between 1 and 20.', 400);
  }

  let cleanAmenities: string[] = [];
  if (amenities !== undefined) {
    if (!Array.isArray(amenities)) return error(res, 'amenities must be an array of strings.', 400);
    cleanAmenities = [...new Set((amenities as any[]).map((a) => String(a).trim()).filter(Boolean))];
  }

  const room = await prisma.room.create({
    data: { title, category, description, pricePerNight: price, maxGuests: guests, amenities: cleanAmenities },
  });

  return success(res, { room }, 'Room created successfully', 201);
};

export const updateRoom = async (req: Request, res: Response) => {
  const roomId = req.params.roomId as string;

  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) return error(res, 'Room not found.', 404);

  const { title, category, description, pricePerNight, maxGuests, amenities } = req.body;

  if (
    title === undefined &&
    category === undefined &&
    description === undefined &&
    pricePerNight === undefined &&
    maxGuests === undefined &&
    amenities === undefined
  ) {
    return error(res, 'No update fields provided.', 400);
  }

  const updateData: any = {};

  if (title !== undefined) {
    const t = String(title).trim();
    if (t.length < 3 || t.length > 200) return error(res, 'Title must be between 3 and 200 characters.', 400);
    updateData.title = t;
  }
  if (category !== undefined) {
    if (!VALID_CATEGORIES.includes(category)) return error(res, 'Invalid category.', 400);
    updateData.category = category;
  }
  if (description !== undefined) {
    const d = String(description).trim();
    if (d.length < 20) return error(res, 'Description must be at least 20 characters.', 400);
    updateData.description = d;
  }
  if (pricePerNight !== undefined) {
    const price = parseFloat(pricePerNight);
    if (isNaN(price) || price <= 0 || price > 99999.99) return error(res, 'Invalid pricePerNight.', 400);
    updateData.pricePerNight = price;
  }
  if (maxGuests !== undefined) {
    const guests = parseInt(maxGuests);
    if (isNaN(guests) || guests < 1 || guests > 20) return error(res, 'maxGuests must be between 1 and 20.', 400);
    updateData.maxGuests = guests;
  }
  if (amenities !== undefined) {
    if (!Array.isArray(amenities)) return error(res, 'amenities must be an array of strings.', 400);
    updateData.amenities = [...new Set((amenities as any[]).map((a) => String(a).trim()).filter(Boolean))];
  }

  const updated = await prisma.room.update({ where: { id: roomId }, data: updateData });
  return success(res, { room: updated }, 'Room updated successfully');
};

export const setAvailability = async (req: Request, res: Response) => {
  const roomId = req.params.roomId as string;
  const { availabilityStatus } = req.body;

  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) return error(res, 'Room not found.', 404);

  if (!availabilityStatus || !VALID_STATUSES.includes(availabilityStatus)) {
    return error(res, 'Invalid availabilityStatus.', 400);
  }

  if (availabilityStatus === 'PERMANENTLY_UNAVAILABLE') {
    const activeBookings = await prisma.booking.count({
      where: {
        roomId,
        status: { in: ['PENDING', 'CONFIRMED'] },
        checkIn: { gte: new Date() },
      },
    });
    if (activeBookings > 0) {
      return error(res, `Cannot permanently disable room. There are ${activeBookings} upcoming confirmed bookings. Cancel them first.`, 400);
    }
  }

  const updated = await prisma.room.update({ where: { id: roomId }, data: { availabilityStatus } });
  return success(res, { room: updated }, 'Availability updated successfully');
};

export const addImage = async (req: Request, res: Response) => {
  const roomId = req.params.roomId as string;
  const file = (req as any).file as MulterFile | undefined;

  if (!file) return error(res, 'Image file is required.', 400);

  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.mimetype)) {
    return error(res, 'Only JPEG, PNG, and WebP images are allowed.', 400);
  }
  if (file.size > 5 * 1024 * 1024) {
    return error(res, 'Image must be under 5MB.', 400);
  }

  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) return error(res, 'Room not found.', 404);

  const isPrimary = req.body.isPrimary === 'true' || req.body.isPrimary === true;

  const { secure_url, public_id } = await uploadImage(file.buffer, `stayease/rooms/${roomId}`);

  if (isPrimary) {
    await prisma.roomImage.updateMany({ where: { roomId }, data: { isPrimary: false } });
  }

  const image = await prisma.roomImage.create({
    data: { roomId, cloudinaryUrl: secure_url, cloudinaryPublicId: public_id, isPrimary },
  });

  return success(res, { image: { id: image.id, url: image.cloudinaryUrl, isPrimary: image.isPrimary } }, 'Image uploaded successfully', 201);
};

export const deleteImageFromRoom = async (req: Request, res: Response) => {
  const roomId = req.params.roomId as string;
  const imageId = req.params.imageId as string;

  const image = await prisma.roomImage.findFirst({ where: { id: imageId, roomId } });
  if (!image) return error(res, 'Image not found.', 404);

  await deleteImage(image.cloudinaryPublicId);
  await prisma.roomImage.delete({ where: { id: imageId } });

  if (image.isPrimary) {
    const next = await prisma.roomImage.findFirst({ where: { roomId }, orderBy: { uploadedAt: 'asc' } });
    if (next) {
      await prisma.roomImage.update({ where: { id: next.id }, data: { isPrimary: true } });
    }
  }

  return success(res, null, 'Image removed successfully');
};

export const setPrimaryImage = async (req: Request, res: Response) => {
  const roomId = req.params.roomId as string;
  const imageId = req.params.imageId as string;

  const image = await prisma.roomImage.findFirst({ where: { id: imageId, roomId } });
  if (!image) return error(res, 'Image not found.', 404);

  await prisma.roomImage.updateMany({ where: { roomId }, data: { isPrimary: false } });
  const updated = await prisma.roomImage.update({ where: { id: imageId }, data: { isPrimary: true } });

  return success(res, { image: { id: updated.id, url: updated.cloudinaryUrl, isPrimary: updated.isPrimary } }, 'Primary image updated');
};

export const deleteRoom = async (req: Request, res: Response) => {
  const roomId = req.params.roomId as string;

  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: { images: true },
  });
  if (!room) return error(res, 'Room not found.', 404);

  const activeBookings = await prisma.booking.count({
    where: { roomId, status: { notIn: ['CANCELLED'] } },
  });
  if (activeBookings > 0) {
    return error(res, 'Cannot delete room with existing bookings. Set it as permanently unavailable instead.', 400);
  }

  for (const img of room.images) {
    await deleteImage(img.cloudinaryPublicId);
  }

  await prisma.roomImage.deleteMany({ where: { roomId } });
  await prisma.room.delete({ where: { id: roomId } });

  return success(res, null, 'Room deleted successfully');
};

export const adminListRooms = async (req: Request, res: Response) => {
  const rooms = await prisma.room.findMany({
    include: {
      images: { where: { isPrimary: true }, take: 1 },
      _count: { select: { bookings: true, reviews: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return success(res, {
    rooms: rooms.map((room) => ({
      id: room.id,
      title: room.title,
      category: room.category,
      pricePerNight: room.pricePerNight,
      maxGuests: room.maxGuests,
      availabilityStatus: room.availabilityStatus,
      bookingCount: room._count.bookings,
      reviewCount: room._count.reviews,
      primaryImage: room.images[0] ? { id: room.images[0].id, url: room.images[0].cloudinaryUrl } : null,
    })),
  }, 'Rooms fetched successfully');
};