import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { success, error } from '../utils/response';
import { buildMeta, buildSkipTake } from '../utils/pagination';

export const createReview = async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { bookingId, rating, comment } = req.body;

  if (!bookingId || typeof bookingId !== 'string') return error(res, 'bookingId is required.', 400);

  const ratingNum = parseInt(rating);
  if (!rating || isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    return error(res, 'rating must be an integer between 1 and 5.', 400);
  }

  if (comment !== undefined && typeof comment === 'string' && comment.length > 1000) {
    return error(res, 'comment must be 1000 characters or fewer.', 400);
  }

  const booking = await prisma.booking.findFirst({ where: { id: bookingId, userId: user.id } });
  if (!booking) return error(res, 'Booking not found.', 404);
  if (booking.status !== 'CHECKED_OUT') return error(res, 'You can only review rooms after check-out.', 400);

  const existing = await prisma.review.findUnique({ where: { bookingId } });
  if (existing) return error(res, 'You have already reviewed this booking.', 409);

  const review = await prisma.review.create({
    data: {
      roomId: booking.roomId,
      userId: user.id,
      bookingId,
      rating: ratingNum,
      comment: (comment || '').trim(),
    },
    include: { user: { select: { name: true } } },
  });

  return success(res, {
    review: {
      id: review.id,
      rating: review.rating,
      comment: review.comment,
      createdAt: review.createdAt,
      user: { name: review.user.name },
    },
  }, 'Review submitted successfully', 201);
};

export const getRoomReviews = async (req: Request, res: Response) => {
  const roomId = req.params.roomId as string;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize as string) || 10));

  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) return error(res, 'Room not found.', 404);

  const { skip, take } = buildSkipTake(page, pageSize);

  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where: { roomId },
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { name: true } } },
    }),
    prisma.review.count({ where: { roomId } }),
  ]);

  const agg = await prisma.review.aggregate({ where: { roomId }, _avg: { rating: true } });

  return success(res, {
    reviews: reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
      user: { name: r.user.name },
    })),
    averageRating: agg._avg.rating ? parseFloat(agg._avg.rating.toFixed(1)) : null,
    totalCount: total,
    meta: buildMeta(total, page, pageSize),
  }, 'Reviews fetched successfully');
};

export const deleteReview = async (req: Request, res: Response) => {
  const reviewId = req.params.reviewId as string;

  const review = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!review) return error(res, 'Review not found.', 404);

  await prisma.review.delete({ where: { id: reviewId } });

  return success(res, null, 'Review deleted successfully');
};