import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { success, error } from '../utils/response';
import { sendToOne, sendToMany } from '../services/fcm.service';

export const sendNotification = async (req: Request, res: Response) => {
  const admin = (req as any).admin;
  const { title, body, targetType, targetUserId } = req.body;

  const t = (title || '').trim();
  const b = (body || '').trim();

  if (!t || t.length < 1) return error(res, 'title is required.', 400);
  if (!b || b.length < 1) return error(res, 'body is required.', 400);
  if (!targetType || !['ALL', 'SPECIFIC'].includes(targetType)) {
    return error(res, 'targetType must be ALL or SPECIFIC.', 400);
  }

  if (targetType === 'SPECIFIC' && !targetUserId) {
    return error(res, 'targetUserId is required for SPECIFIC notifications.', 400);
  }

  const notification = await prisma.notification.create({
    data: { adminId: admin.id, title: t, body: b },
  });

  let successCount = 0;
  let failureCount = 0;

  if (targetType === 'ALL') {
    const users = await prisma.user.findMany({
      where: { fcmToken: { not: null } },
      select: { fcmToken: true },
    });
    const tokens = users.map((u) => u.fcmToken as string);
    const result = await sendToMany(tokens, t, b);
    successCount = result.successCount;
    failureCount = result.failureCount;
  } else {
    const user = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!user) return error(res, 'User not found.', 404);
    if (!user.fcmToken) return error(res, 'This user has not enabled push notifications.', 400);
    await sendToOne(user.fcmToken, t, b);
    successCount = 1;
  }

  return success(res, { notification, successCount, failureCount }, 'Notification sent');
};

export const getNotifications = async (req: Request, res: Response) => {
  const notifications = await prisma.notification.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { admin: { select: { name: true } } },
  });

  return success(res, { notifications }, 'Notifications fetched successfully');
};

export const updateFcmToken = async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { fcmToken } = req.body;

  if (!fcmToken || typeof fcmToken !== 'string' || fcmToken.trim().length === 0) {
    return error(res, 'fcmToken is required.', 400);
  }

  await prisma.user.update({ where: { id: user.id }, data: { fcmToken: fcmToken.trim() } });

  return success(res, null, 'FCM token updated successfully');
};