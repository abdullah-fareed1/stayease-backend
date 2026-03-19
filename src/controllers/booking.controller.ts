import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { success, error } from '../utils/response';
import { buildMeta, buildSkipTake } from '../utils/pagination';
import { checkRoomAvailability } from '../utils/availability';
import { sendBookingConfirmationEmail, sendCancellationEmail } from '../services/email.service';
import { BookingStatus } from '../generated/prisma/client';

const VALID_STATUSES: BookingStatus[] = ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED'];

export const createBooking = async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { roomId, checkIn, checkOut, guestCount, paymentType } = req.body;

  if (!roomId || typeof roomId !== 'string') {
    return error(res, 'roomId is required.', 400);
  }

  const checkInDate = new Date(checkIn);
  const checkOutDate = new Date(checkOut);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (!checkIn || isNaN(checkInDate.getTime())) {
    return error(res, 'checkIn must be a valid date.', 400);
  }
  if (checkInDate < todayStart) {
    return error(res, 'checkIn cannot be in the past.', 400);
  }

  const maxAdvance = new Date();
  maxAdvance.setDate(maxAdvance.getDate() + 365);
  if (checkInDate > maxAdvance) {
    return error(res, 'checkIn cannot be more than 365 days in the future.', 400);
  }

  if (!checkOut || isNaN(checkOutDate.getTime())) {
    return error(res, 'checkOut must be a valid date.', 400);
  }
  if (checkOutDate <= checkInDate) {
    return error(res, 'checkOut must be after checkIn.', 400);
  }

  const nights = Math.round((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24));
  if (nights < 1) {
    return error(res, 'Minimum stay is 1 night.', 400);
  }

  const guests = parseInt(guestCount);
  if (!guestCount || isNaN(guests) || guests < 1) {
    return error(res, 'guestCount must be a positive integer.', 400);
  }

  if (!paymentType || !['PARTIAL', 'FULL'].includes(paymentType)) {
    return error(res, 'paymentType must be PARTIAL or FULL.', 400);
  }

  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) return error(res, 'Room not found.', 404);
  if (room.availabilityStatus !== 'AVAILABLE') {
    return error(res, 'This room is currently unavailable for booking.', 400);
  }
  if (guests > room.maxGuests) {
    return error(res, `This room accommodates max ${room.maxGuests} guests.`, 400);
  }

  const availability = await checkRoomAvailability(prisma, roomId, checkInDate, checkOutDate);
  if (!availability.available) {
    return error(res, availability.message!, 409);
  }

  const totalAmount = parseFloat((Number(room.pricePerNight) * nights).toFixed(2));
  const paymentAmount = paymentType === 'PARTIAL'
    ? parseFloat((totalAmount * 0.5).toFixed(2))
    : totalAmount;

  const booking = await prisma.booking.create({
    data: {
      roomId,
      userId: user.id,
      guestName: user.name,
      guestEmail: user.email,
      guestPhone: user.phone || '',
      checkIn: checkInDate,
      checkOut: checkOutDate,
      guestCount: guests,
      totalAmount,
      status: 'PENDING',
    },
  });

  sendBookingConfirmationEmail(user.email, user.name, booking.id).catch(() => {});

  return success(res, { booking, paymentAmount, nights }, 'Booking created successfully', 201);
};

export const getMyBookings = async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { status } = req.query;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize as string) || 10));

  if (status && !VALID_STATUSES.includes(status as BookingStatus)) {
    return error(res, 'Invalid status filter.', 400);
  }

  const where: any = { userId: user.id };
  if (status) where.status = status;

  const { skip, take } = buildSkipTake(page, pageSize);

  const [bookings, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        room: {
          include: {
            images: { where: { isPrimary: true }, take: 1 },
          },
        },
        payments: true,
      },
    }),
    prisma.booking.count({ where }),
  ]);

  return success(res, {
    bookings: bookings.map((b) => ({
      id: b.id,
      checkIn: b.checkIn,
      checkOut: b.checkOut,
      guestCount: b.guestCount,
      totalAmount: b.totalAmount,
      status: b.status,
      cancelledAt: b.cancelledAt,
      createdAt: b.createdAt,
      room: {
        id: b.room.id,
        title: b.room.title,
        category: b.room.category,
        pricePerNight: b.room.pricePerNight,
        primaryImage: b.room.images[0] ? { id: b.room.images[0].id, url: b.room.images[0].cloudinaryUrl } : null,
      },
      payments: b.payments,
    })),
    meta: buildMeta(total, page, pageSize),
  }, 'Bookings fetched successfully');
};

export const getMyBookingById = async (req: Request, res: Response) => {
  const user = (req as any).user;
  const bookingId = req.params.bookingId as string;

  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, userId: user.id },
    include: {
      room: {
        include: {
          images: { orderBy: [{ isPrimary: 'desc' }, { uploadedAt: 'asc' }] },
        },
      },
      payments: true,
    },
  });

  if (!booking) return error(res, 'Booking not found.', 404);

  return success(res, { booking }, 'Booking fetched successfully');
};

export const cancelBooking = async (req: Request, res: Response) => {
  const user = (req as any).user;
  const bookingId = req.params.bookingId as string;

  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, userId: user.id },
    include: { payments: true },
  });

  if (!booking) return error(res, 'Booking not found.', 404);

  if (!['PENDING', 'CONFIRMED'].includes(booking.status)) {
    return error(res, 'This booking cannot be cancelled.', 400);
  }

  const twentyFourHoursFromNow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  if (booking.checkIn <= twentyFourHoursFromNow) {
    return error(res, 'Bookings cannot be cancelled within 24 hours of check-in.', 400);
  }

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: { status: 'CANCELLED', cancelledAt: new Date() },
  });

  sendCancellationEmail(user.email, user.name, bookingId).catch(() => {});

  return success(res, { booking: updated }, 'Booking cancelled successfully');
};