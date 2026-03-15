import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { success, error } from '../utils/response';
import { buildMeta, buildSkipTake } from '../utils/pagination';
import { checkRoomAvailability } from '../utils/availability';
import { BookingStatus } from '../generated/prisma/client';

const VALID_STATUSES: BookingStatus[] = ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED'];

const ALLOWED_TRANSITIONS: Record<string, BookingStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['CHECKED_IN', 'CANCELLED'],
  CHECKED_IN: ['CHECKED_OUT', 'CANCELLED'],
  CHECKED_OUT: [],
  CANCELLED: [],
};

export const getAllBookings = async (req: Request, res: Response) => {
  const { status, roomId, dateFrom, dateTo, search } = req.query;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize as string) || 10));

  if (status && !VALID_STATUSES.includes(status as BookingStatus)) {
    return error(res, 'Invalid status filter.', 400);
  }

  const where: any = {};
  if (status) where.status = status;
  if (roomId) where.roomId = roomId as string;
  if (dateFrom || dateTo) {
    where.checkIn = {};
    if (dateFrom) where.checkIn.gte = new Date(dateFrom as string);
    if (dateTo) where.checkIn.lte = new Date(dateTo as string);
  }
  if (search) {
    where.OR = [
      { guestName: { contains: search as string, mode: 'insensitive' } },
      { guestEmail: { contains: search as string, mode: 'insensitive' } },
    ];
  }

  const { skip, take } = buildSkipTake(page, pageSize);

  const [bookings, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        room: {
          include: { images: { where: { isPrimary: true }, take: 1 } },
        },
        payment: true,
        user: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.booking.count({ where }),
  ]);

  return success(res, {
    bookings: bookings.map((b) => ({
      id: b.id,
      guestName: b.guestName,
      guestEmail: b.guestEmail,
      guestPhone: b.guestPhone,
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
        primaryImage: b.room.images[0] ? { url: b.room.images[0].cloudinaryUrl } : null,
      },
      payment: b.payment ?? null,
      user: b.user ?? null,
    })),
    meta: buildMeta(total, page, pageSize),
  }, 'Bookings fetched successfully');
};

export const getBookingById = async (req: Request, res: Response) => {
  const bookingId = req.params.bookingId as string;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      room: {
        include: { images: { orderBy: [{ isPrimary: 'desc' }, { uploadedAt: 'asc' }] } },
      },
      payment: true,
      user: { select: { id: true, name: true, email: true, phone: true } },
    },
  });

  if (!booking) return error(res, 'Booking not found.', 404);

  return success(res, { booking }, 'Booking fetched successfully');
};

export const createWalkIn = async (req: Request, res: Response) => {
  const admin = (req as any).admin;
  const { roomId, checkIn, checkOut, guestCount, paymentType, guestName, guestEmail, guestPhone } = req.body;

  if (!roomId || typeof roomId !== 'string') return error(res, 'roomId is required.', 400);

  const checkInDate = new Date(checkIn);
  const checkOutDate = new Date(checkOut);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  if (!checkIn || isNaN(checkInDate.getTime())) return error(res, 'checkIn must be a valid date.', 400);
  if (checkInDate < todayStart) return error(res, 'checkIn cannot be in the past.', 400);
  if (!checkOut || isNaN(checkOutDate.getTime())) return error(res, 'checkOut must be a valid date.', 400);
  if (checkOutDate <= checkInDate) return error(res, 'checkOut must be after checkIn.', 400);

  const nights = Math.round((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24));
  if (nights < 1) return error(res, 'Minimum stay is 1 night.', 400);

  const guests = parseInt(guestCount);
  if (!guestCount || isNaN(guests) || guests < 1) return error(res, 'guestCount must be a positive integer.', 400);
  if (!paymentType || !['PARTIAL', 'FULL'].includes(paymentType)) return error(res, 'paymentType must be PARTIAL or FULL.', 400);

  const name = (guestName || '').trim();
  const email = (guestEmail || '').trim().toLowerCase();
  const phone = (guestPhone || '').trim();

  if (!name || name.length < 2) return error(res, 'guestName is required (min 2 characters).', 400);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return error(res, 'A valid guestEmail is required.', 400);
  if (!phone) return error(res, 'guestPhone is required.', 400);

  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) return error(res, 'Room not found.', 404);
  if (room.availabilityStatus !== 'AVAILABLE') return error(res, 'This room is currently unavailable for booking.', 400);
  if (guests > room.maxGuests) return error(res, `This room accommodates max ${room.maxGuests} guests.`, 400);

  const availability = await checkRoomAvailability(prisma, roomId, checkInDate, checkOutDate);
  if (!availability.available) return error(res, availability.message!, 409);

  const totalAmount = parseFloat((Number(room.pricePerNight) * nights).toFixed(2));
  const paymentAmount = paymentType === 'PARTIAL'
    ? parseFloat((totalAmount * 0.5).toFixed(2))
    : totalAmount;

  const booking = await prisma.booking.create({
    data: {
      roomId,
      userId: null,
      adminId: admin.id,
      guestName: name,
      guestEmail: email,
      guestPhone: phone,
      checkIn: checkInDate,
      checkOut: checkOutDate,
      guestCount: guests,
      totalAmount,
      status: 'PENDING',
    },
  });

  return success(res, { booking, paymentAmount, nights }, 'Walk-in booking created successfully', 201);
};

export const updateBookingStatus = async (req: Request, res: Response) => {
  const bookingId = req.params.bookingId as string;
  const { status } = req.body;

  if (!status || !VALID_STATUSES.includes(status)) {
    return error(res, 'Invalid status value.', 400);
  }

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) return error(res, 'Booking not found.', 404);

  const allowed = ALLOWED_TRANSITIONS[booking.status] ?? [];
  if (!allowed.includes(status)) {
    return error(res, `Cannot change status from ${booking.status} to ${status}.`, 400);
  }

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status,
      ...(status === 'CANCELLED' ? { cancelledAt: new Date() } : {}),
    },
  });

  return success(res, { booking: updated }, 'Booking status updated successfully');
};