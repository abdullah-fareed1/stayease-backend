import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { success, error } from '../utils/response';

const CONFIG_KEYS = ['name', 'address', 'phone', 'email', 'latitude', 'longitude', 'description', 'checkInTime', 'checkOutTime'];

export const getHotelConfig = async (req: Request, res: Response) => {
  const configs = await prisma.hotelConfig.findMany();
  const config: Record<string, string> = {};
  configs.forEach((c) => { config[c.key] = c.value; });
  return success(res, { config }, 'Hotel config fetched successfully');
};

export const updateHotelConfig = async (req: Request, res: Response) => {
  const updates = req.body;

  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    return error(res, 'Request body must be a key-value object.', 400);
  }

  const keys = Object.keys(updates);
  if (keys.length === 0) return error(res, 'No fields provided.', 400);

  const invalidKeys = keys.filter((k) => !CONFIG_KEYS.includes(k));
  if (invalidKeys.length > 0) {
    return error(res, `Invalid config keys: ${invalidKeys.join(', ')}.`, 400);
  }

  await Promise.all(
    keys.map((key) =>
      prisma.hotelConfig.upsert({
        where: { key },
        update: { value: String(updates[key]) },
        create: { key, value: String(updates[key]) },
      })
    )
  );

  const configs = await prisma.hotelConfig.findMany();
  const config: Record<string, string> = {};
  configs.forEach((c) => { config[c.key] = c.value; });

  return success(res, { config }, 'Hotel config updated successfully');
};