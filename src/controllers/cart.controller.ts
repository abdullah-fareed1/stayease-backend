import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { success, error } from '../utils/response';
import { checkRoomAvailability } from '../utils/availability';

export const getCart = async (req: Request, res: Response) => {
  const user = (req as any).user;

  let cart = await prisma.cart.findUnique({
    where: { userId: user.id },
    include: {
      items: {
        include: {
          room: {
            include: { images: { where: { isPrimary: true }, take: 1 } },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!cart) {
    cart = await prisma.cart.create({
      data: { userId: user.id },
      include: { items: { include: { room: { include: { images: { where: { isPrimary: true }, take: 1 } } } } } },
    });
  }

  const itemsWithSubtotal = cart.items.map((item) => {
    const nights = Math.round(
      (item.checkOut.getTime() - item.checkIn.getTime()) / (1000 * 60 * 60 * 24)
    );
    const subtotal = parseFloat((Number(item.room.pricePerNight) * nights).toFixed(2));
    return {
      id: item.id,
      checkIn: item.checkIn,
      checkOut: item.checkOut,
      guestCount: item.guestCount,
      nights,
      subtotal,
      isRoomAvailable: item.room.availabilityStatus === 'AVAILABLE',
      room: {
        id: item.room.id,
        title: item.room.title,
        category: item.room.category,
        pricePerNight: item.room.pricePerNight,
        maxGuests: item.room.maxGuests,
        availabilityStatus: item.room.availabilityStatus,
        primaryImage: item.room.images[0] ? { id: item.room.images[0].id, url: item.room.images[0].cloudinaryUrl } : null,
      },
    };
  });

  const cartTotal = itemsWithSubtotal.reduce((sum, i) => sum + i.subtotal, 0);

  return success(res, { cart: { id: cart.id, items: itemsWithSubtotal, cartTotal: parseFloat(cartTotal.toFixed(2)) } }, 'Cart fetched successfully');
};

export const addItemToCart = async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { roomId, checkIn, checkOut, guestCount } = req.body;

  if (!roomId || typeof roomId !== 'string') return error(res, 'roomId is required.', 400);

  const checkInDate = new Date(checkIn);
  const checkOutDate = new Date(checkOut);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  if (!checkIn || isNaN(checkInDate.getTime())) return error(res, 'checkIn must be a valid date.', 400);
  if (checkInDate < todayStart) return error(res, 'checkIn cannot be in the past.', 400);
  if (!checkOut || isNaN(checkOutDate.getTime())) return error(res, 'checkOut must be a valid date.', 400);
  if (checkOutDate <= checkInDate) return error(res, 'checkOut must be after checkIn.', 400);

  const guests = parseInt(guestCount);
  if (!guestCount || isNaN(guests) || guests < 1) return error(res, 'guestCount must be a positive integer.', 400);

  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) return error(res, 'Room not found.', 404);
  if (room.availabilityStatus !== 'AVAILABLE') return error(res, 'This room is currently unavailable.', 400);
  if (guests > room.maxGuests) return error(res, `This room accommodates max ${room.maxGuests} guests.`, 400);

  const availability = await checkRoomAvailability(prisma, roomId, checkInDate, checkOutDate);
  if (!availability.available) return error(res, availability.message!, 409);

  let cart = await prisma.cart.findUnique({ where: { userId: user.id } });
  if (!cart) {
    cart = await prisma.cart.create({ data: { userId: user.id } });
  }

  const existing = await prisma.cartItem.findFirst({ where: { cartId: cart.id, roomId } });

  if (existing) {
    await prisma.cartItem.update({
      where: { id: existing.id },
      data: { checkIn: checkInDate, checkOut: checkOutDate, guestCount: guests },
    });
  } else {
    await prisma.cartItem.create({
      data: { cartId: cart.id, roomId, checkIn: checkInDate, checkOut: checkOutDate, guestCount: guests },
    });
  }

  return success(res, null, 'Item added to cart successfully');
};

export const removeItemFromCart = async (req: Request, res: Response) => {
  const user = (req as any).user;
  const cartItemId = req.params.cartItemId as string;

  const cart = await prisma.cart.findUnique({ where: { userId: user.id } });
  if (!cart) return error(res, 'Cart not found.', 404);

  const item = await prisma.cartItem.findFirst({ where: { id: cartItemId, cartId: cart.id } });
  if (!item) return error(res, 'Cart item not found.', 404);

  await prisma.cartItem.delete({ where: { id: cartItemId } });

  return success(res, null, 'Item removed from cart');
};

export const clearCart = async (req: Request, res: Response) => {
  const user = (req as any).user;

  const cart = await prisma.cart.findUnique({ where: { userId: user.id } });
  if (!cart) return error(res, 'Cart not found.', 404);

  await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });

  return success(res, null, 'Cart cleared');
};

export const checkoutCart = async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { paymentType } = req.body;

  if (!paymentType || !['PARTIAL', 'FULL'].includes(paymentType)) {
    return error(res, 'paymentType must be PARTIAL or FULL.', 400);
  }

  const cart = await prisma.cart.findUnique({
    where: { userId: user.id },
    include: {
      items: { include: { room: true } },
    },
  });

  if (!cart || cart.items.length === 0) return error(res, 'Cart is empty.', 400);

  const conflicts: string[] = [];
  for (const item of cart.items) {
    if (item.room.availabilityStatus !== 'AVAILABLE') {
      conflicts.push(item.room.title);
      continue;
    }
    const avail = await checkRoomAvailability(prisma, item.roomId, item.checkIn, item.checkOut);
    if (!avail.available) conflicts.push(item.room.title);
  }

  if (conflicts.length > 0) {
    return error(res, `Some rooms are no longer available: ${conflicts.join(', ')}. Please remove them from your cart.`, 409);
  }

  const bookings = await prisma.$transaction(async (tx) => {
    const created = [];
    for (const item of cart.items) {
      const nights = Math.round((item.checkOut.getTime() - item.checkIn.getTime()) / (1000 * 60 * 60 * 24));
      const totalAmount = parseFloat((Number(item.room.pricePerNight) * nights).toFixed(2));
      const paymentAmount = paymentType === 'PARTIAL'
        ? parseFloat((totalAmount * 0.5).toFixed(2))
        : totalAmount;

      const booking = await tx.booking.create({
        data: {
          roomId: item.roomId,
          userId: user.id,
          guestName: user.name,
          guestEmail: user.email,
          guestPhone: user.phone || '',
          checkIn: item.checkIn,
          checkOut: item.checkOut,
          guestCount: item.guestCount,
          totalAmount,
          status: 'PENDING',
        },
      });
      created.push({ bookingId: booking.id, totalAmount, paymentAmount, nights });
    }
    await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
    return created;
  });

  return success(res, { bookings }, 'Checkout successful', 201);
};