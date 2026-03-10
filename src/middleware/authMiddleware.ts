import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { error } from '../utils/response';
import { prisma } from '../config/db';

export const requireCustomerAuth = async (req: Request, res: Response, next: NextFunction) => {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return error(res, 'No token provided. Please log in.', 401);
  }

  const token = header.split(' ')[1];

  let payload: any;
  try {
    payload = verifyAccessToken(token);
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      return error(res, 'Session expired. Please refresh your token.', 401);
    }
    return error(res, 'Invalid token.', 401);
  }

  if (payload.role !== 'CUSTOMER') {
    return error(res, 'Access denied.', 403);
  }

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user) {
    return error(res, 'User not found.', 401);
  }

  (req as any).user = user;
  next();
};