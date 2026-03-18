import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { success } from '../utils/response';

export const getDashboardOverview = async (req: Request, res: Response) => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalRooms,
    availableRooms,
    todayCheckIns,
    todayCheckOuts,
    totalRevenueAgg,
    monthlyRevenueAgg,
    totalBookings,
    pendingBookings,
    topRooms,
  ] = await Promise.all([
    prisma.room.count(),
    prisma.room.count({ where: { availabilityStatus: 'AVAILABLE' } }),
    prisma.booking.count({ where: { checkIn: { gte: todayStart, lt: todayEnd }, status: 'CONFIRMED' } }),
    prisma.booking.count({ where: { checkOut: { gte: todayStart, lt: todayEnd }, status: 'CHECKED_IN' } }),
    prisma.payment.aggregate({ where: { status: 'PAID' }, _sum: { amount: true } }),
    prisma.payment.aggregate({ where: { status: 'PAID', createdAt: { gte: monthStart, lt: monthEnd } }, _sum: { amount: true } }),
    prisma.booking.count({ where: { status: { not: 'CANCELLED' } } }),
    prisma.booking.count({ where: { status: 'PENDING' } }),
    prisma.booking.groupBy({
      by: ['roomId'],
      where: { createdAt: { gte: thirtyDaysAgo }, status: { not: 'CANCELLED' } },
      _count: { roomId: true },
      orderBy: { _count: { roomId: 'desc' } },
      take: 5,
    }),
  ]);

  const topRoomIds = topRooms.map((r) => r.roomId);
  const topRoomDetails = await prisma.room.findMany({
    where: { id: { in: topRoomIds } },
    include: { images: { where: { isPrimary: true }, take: 1 } },
  });

  const bestPerformingRooms = topRooms.map((r) => {
    const room = topRoomDetails.find((d) => d.id === r.roomId);
    return {
      roomId: r.roomId,
      bookingCount: r._count.roomId,
      title: room?.title ?? '',
      category: room?.category ?? '',
      primaryImage: room?.images[0] ? { url: room.images[0].cloudinaryUrl } : null,
    };
  });

  const revenueByMonth = await prisma.$queryRaw<{ month: string; revenue: number }[]>`
    SELECT TO_CHAR(DATE_TRUNC('month', "createdAt"), 'YYYY-MM') AS month,
           COALESCE(SUM(amount), 0)::float AS revenue
    FROM "Payment"
    WHERE status = 'PAID'
      AND "createdAt" >= NOW() - INTERVAL '6 months'
    GROUP BY DATE_TRUNC('month', "createdAt")
    ORDER BY DATE_TRUNC('month', "createdAt") ASC
  `;

  return success(res, {
    totalRooms,
    availableRooms,
    todayCheckIns,
    todayCheckOuts,
    totalRevenue: Number(totalRevenueAgg._sum.amount ?? 0),
    monthlyRevenue: Number(monthlyRevenueAgg._sum.amount ?? 0),
    totalBookings,
    pendingBookings,
    bestPerformingRooms,
    revenueByMonth,
  }, 'Dashboard data fetched successfully');
};