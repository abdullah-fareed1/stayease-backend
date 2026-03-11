import { Request, Response, NextFunction } from 'express';
import { AdminRole } from '../generated/prisma/client';
import { verifyAccessToken } from '../utils/jwt';
import { error } from '../utils/response';
import { prisma } from '../config/db';

export const requireAdminAuth = async (req: Request, res: Response, next: NextFunction) => {
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

  if (!payload.adminId) {
    return error(res, 'Access denied.', 403);
  }

  const admin = await prisma.admin.findUnique({ where: { id: payload.adminId } });
  if (!admin) {
    return error(res, 'Admin not found.', 401);
  }

  (req as any).admin = admin;
  next();
};

export const requireAdminRole = (allowedRoles: AdminRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const admin = (req as any).admin;

    if (!admin || !allowedRoles.includes(admin.role)) {
      return error(res, 'You do not have permission to perform this action.', 403);
    }

    next();
  };
};