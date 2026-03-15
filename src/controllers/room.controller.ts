import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { success, error } from '../utils/response';
import { buildMeta, buildSkipTake } from '../utils/pagination';
import { RoomCategory } from '../generated/prisma/client';

const VALID_CATEGORIES: RoomCategory[] = ['STANDARD', 'DELUXE', 'SUITE', 'FAMILY'];

export const listRooms = async (req: Request, res: Response) => {
  const { category, available, minPrice, maxPrice, maxGuests } = req.query;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize as string) || 10));

  if (category && !VALID_CATEGORIES.includes(category as RoomCategory)) {
    return error(res, 'Invalid category value.', 400);
  }

  const minP = minPrice ? parseFloat(minPrice as string) : undefined;
  const maxP = maxPrice ? parseFloat(maxPrice as string) : undefined;

  if (minP !== undefined && isNaN(minP)) return error(res, 'minPrice must be a number.', 400);
  if (maxP !== undefined && isNaN(maxP)) return error(res, 'maxPrice must be a number.', 400);
  if (minP !== undefined && maxP !== undefined && minP >= maxP) {
    return error(res, 'minPrice must be less than maxPrice.', 400);
  }

  const maxG = maxGuests ? parseInt(maxGuests as string) : undefined;
  if (maxG !== undefined && (isNaN(maxG) || maxG < 1)) {
    return error(res, 'maxGuests must be a positive integer.', 400);
  }

  const where: any = {};
  if (category) where.category = category;
  if (available === 'true') where.availabilityStatus = 'AVAILABLE';
  if (minP !== undefined || maxP !== undefined) {
    where.pricePerNight = {};
    if (minP !== undefined) where.pricePerNight.gte = minP;
    if (maxP !== undefined) where.pricePerNight.lte = maxP;
  }
  if (maxG !== undefined) where.maxGuests = { gte: maxG };

  const { skip, take } = buildSkipTake(page, pageSize);

  const [rooms, total] = await Promise.all([
    prisma.room.findMany({
      where,
      skip,
      take,
      include: {
        images: { where: { isPrimary: true }, take: 1 },
        _count: { select: { reviews: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.room.count({ where }),
  ]);

  const roomsWithRating = await Promise.all(
    rooms.map(async (room) => {
      const agg = await prisma.review.aggregate({
        where: { roomId: room.id },
        _avg: { rating: true },
      });
      const primaryImage = room.images[0] ?? null;
      return {
        id: room.id,
        title: room.title,
        category: room.category,
        description: room.description,
        pricePerNight: room.pricePerNight,
        maxGuests: room.maxGuests,
        amenities: room.amenities,
        availabilityStatus: room.availabilityStatus,
        averageRating: agg._avg.rating ? parseFloat(agg._avg.rating.toFixed(1)) : null,
        reviewCount: room._count.reviews,
        primaryImage: primaryImage
          ? { id: primaryImage.id, url: primaryImage.cloudinaryUrl }
          : null,
      };
    })
  );

  return success(res, { rooms: roomsWithRating, meta: buildMeta(total, page, pageSize) }, 'Rooms fetched successfully');
};

export const getRoomById = async (req: Request, res: Response) => {
  const roomId = req.params.roomId as string;

  if (!roomId) return error(res, 'Room ID is required.', 400);

  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: {
      images: { orderBy: [{ isPrimary: 'desc' }, { uploadedAt: 'asc' }] },
      reviews: {
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { name: true } } },
      },
      _count: { select: { reviews: true } },
    },
  });

  if (!room) return error(res, 'Room not found.', 404);

  const agg = await prisma.review.aggregate({
    where: { roomId: room.id },
    _avg: { rating: true },
  });

  return success(res, {
    room: {
      id: room.id,
      title: room.title,
      category: room.category,
      description: room.description,
      pricePerNight: room.pricePerNight,
      maxGuests: room.maxGuests,
      amenities: room.amenities,
      availabilityStatus: room.availabilityStatus,
      createdAt: room.createdAt,
      averageRating: agg._avg.rating ? parseFloat(agg._avg.rating.toFixed(1)) : null,
      reviewCount: room._count.reviews,
      images: room.images.map((img) => ({
        id: img.id,
        url: img.cloudinaryUrl,
        isPrimary: img.isPrimary,
        uploadedAt: img.uploadedAt,
      })),
      reviews: room.reviews.map((rev) => ({
        id: rev.id,
        rating: rev.rating,
        comment: rev.comment,
        createdAt: rev.createdAt,
        user: { name: rev.user.name },
      })),
    },
  }, 'Room fetched successfully');
};