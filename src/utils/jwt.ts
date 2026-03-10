import jwt from 'jsonwebtoken';

export const generateAccessToken = (payload: object): string =>
  jwt.sign(payload, process.env.JWT_ACCESS_SECRET as string, { expiresIn: '15m' });

export const generateRefreshToken = (payload: object): string =>
  jwt.sign(payload, process.env.JWT_REFRESH_SECRET as string, { expiresIn: '7d' });

export const verifyAccessToken = (token: string): any =>
  jwt.verify(token, process.env.JWT_ACCESS_SECRET as string);

export const verifyRefreshToken = (token: string): any =>
  jwt.verify(token, process.env.JWT_REFRESH_SECRET as string);