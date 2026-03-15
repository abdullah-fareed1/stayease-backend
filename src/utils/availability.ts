import { PrismaClient } from '../generated/prisma/client';

export const checkRoomAvailability = async (
  prisma: PrismaClient,
  roomId: string,
  checkIn: Date,
  checkOut: Date,
  excludeBookingId?: string
): Promise<{ available: boolean; message?: string }> => {
  const overlap = await prisma.booking.findFirst({
    where: {
      roomId,
      status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN'] },
      AND: [
        { checkIn: { lt: checkOut } },
        { checkOut: { gt: checkIn } },
      ],
      ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
    },
  });

  if (overlap) {
    return { available: false, message: 'This room is not available for the selected dates.' };
  }

  return { available: true };
};