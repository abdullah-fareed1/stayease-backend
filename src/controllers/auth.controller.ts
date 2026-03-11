import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/db';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { success, error } from '../utils/response';
import { sendWelcomeEmail, sendOtpEmail, sendPasswordChangedEmail } from '../services/email.service';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

const generateOtp = (): string => Math.floor(100000 + Math.random() * 900000).toString();

export const register = async (req: Request, res: Response) => {
  let { name, email, phone, password } = req.body;

  name = (name || '').trim();
  email = (email || '').trim().toLowerCase();

  if (!name || name.length < 2 || name.length > 100) {
    return error(res, 'Name must be between 2 and 100 characters.', 400);
  }
  if (!email || !EMAIL_REGEX.test(email)) {
    return error(res, 'A valid email is required.', 400);
  }
  if (!password || !PASSWORD_REGEX.test(password)) {
    return error(res, 'Password must be at least 8 characters and contain uppercase, lowercase, and a number.', 400);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return error(res, 'An account with this email already exists.', 409);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const accessToken = generateAccessToken({ userId: '', role: 'CUSTOMER' });
  const refreshToken = generateRefreshToken({ userId: '', role: 'CUSTOMER' });
  const hashedRefresh = await bcrypt.hash(refreshToken, 10);

  const user = await prisma.user.create({
    data: { name, email, passwordHash, phone: phone || null, refreshToken: hashedRefresh },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: {
      refreshToken: await bcrypt.hash(
        generateRefreshToken({ userId: user.id, role: 'CUSTOMER' }),
        10
      ),
    },
  });

  const finalAccessToken = generateAccessToken({ userId: user.id, role: 'CUSTOMER' });
  const finalRefreshToken = generateRefreshToken({ userId: user.id, role: 'CUSTOMER' });
  const finalHashedRefresh = await bcrypt.hash(finalRefreshToken, 10);

  await prisma.user.update({ where: { id: user.id }, data: { refreshToken: finalHashedRefresh } });
  await prisma.cart.create({ data: { userId: user.id } });

  sendWelcomeEmail(email, user.name).catch(() => {});

  return success(res, {
    user: { id: user.id, name: user.name, email: user.email, phone: user.phone },
    accessToken: finalAccessToken,
    refreshToken: finalRefreshToken,
  }, 'Registration successful', 201);
};

export const login = async (req: Request, res: Response) => {
  let { email, password, fcmToken } = req.body;

  email = (email || '').trim().toLowerCase();
  if (!email || !EMAIL_REGEX.test(email)) {
    return error(res, 'A valid email is required.', 400);
  }
  if (!password) {
    return error(res, 'Password is required.', 400);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return error(res, 'Invalid email or password.', 401);
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    return error(res, 'Invalid email or password.', 401);
  }

  const accessToken = generateAccessToken({ userId: user.id, role: 'CUSTOMER' });
  const refreshToken = generateRefreshToken({ userId: user.id, role: 'CUSTOMER' });
  const hashedRefresh = await bcrypt.hash(refreshToken, 10);

  const updateData: any = { refreshToken: hashedRefresh };
  if (fcmToken) updateData.fcmToken = fcmToken;

  await prisma.user.update({ where: { id: user.id }, data: updateData });

  return success(res, {
    user: { id: user.id, name: user.name, email: user.email, phone: user.phone },
    accessToken,
    refreshToken,
  }, 'Login successful');
};

export const refresh = async (req: Request, res: Response) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return error(res, 'Refresh token is required.', 400);
  }

  let payload: any;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    return error(res, 'Invalid or expired refresh token. Please log in again.', 401);
  }

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user) {
    return error(res, 'User not found.', 401);
  }

  if (!user.refreshToken) {
    return error(res, 'Refresh token has been revoked. Please log in again.', 401);
  }

  const valid = await bcrypt.compare(refreshToken, user.refreshToken);
  if (!valid) {
    return error(res, 'Refresh token has been revoked. Please log in again.', 401);
  }

  const newAccessToken = generateAccessToken({ userId: user.id, role: 'CUSTOMER' });
  const newRefreshToken = generateRefreshToken({ userId: user.id, role: 'CUSTOMER' });
  const hashedRefresh = await bcrypt.hash(newRefreshToken, 10);

  await prisma.user.update({ where: { id: user.id }, data: { refreshToken: hashedRefresh } });

  return success(res, { accessToken: newAccessToken, refreshToken: newRefreshToken }, 'Token refreshed');
};

export const logout = async (req: Request, res: Response) => {
  const user = (req as any).user;

  await prisma.user.update({
    where: { id: user.id },
    data: { refreshToken: null, fcmToken: null },
  });

  return success(res, null, 'Logged out successfully.');
};

export const forgotPassword = async (req: Request, res: Response) => {
  let { email } = req.body;

  email = (email || '').trim().toLowerCase();
  if (!email || !EMAIL_REGEX.test(email)) {
    return error(res, 'A valid email is required.', 400);
  }

  const RESPONSE = 'If this email is registered, you will receive an OTP shortly.';

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return success(res, null, RESPONSE);
  }

  const otp = generateOtp();
  const hashedOtp = await bcrypt.hash(otp, 10);
  const expiry = new Date(Date.now() + 10 * 60 * 1000);

  await prisma.user.update({
    where: { id: user.id },
    data: { resetToken: hashedOtp, resetTokenExp: expiry },
  });

  sendOtpEmail(email, user.name, otp).catch(() => {});

  return success(res, null, RESPONSE);
};

export const resetPassword = async (req: Request, res: Response) => {
  const { otp, newPassword } = req.body;
  let { email } = req.body;

  email = (email || '').trim().toLowerCase();

  if (!email || !EMAIL_REGEX.test(email)) {
    return error(res, 'A valid email is required.', 400);
  }
  if (!otp || otp.toString().length !== 6) {
    return error(res, 'A valid 6-digit OTP is required.', 400);
  }
  if (!newPassword || !PASSWORD_REGEX.test(newPassword)) {
    return error(res, 'Password must be at least 8 characters and contain uppercase, lowercase, and a number.', 400);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.resetToken) {
    return error(res, 'Invalid or expired OTP.', 400);
  }

  if (!user.resetTokenExp || user.resetTokenExp < new Date()) {
    await prisma.user.update({ where: { id: user.id }, data: { resetToken: null, resetTokenExp: null } });
    return error(res, 'OTP has expired. Please request a new one.', 400);
  }

  const valid = await bcrypt.compare(otp.toString(), user.resetToken);
  if (!valid) {
    return error(res, 'Invalid or expired OTP.', 400);
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, resetToken: null, resetTokenExp: null, refreshToken: null },
  });

  sendPasswordChangedEmail(email, user.name).catch(() => {});

  return success(res, null, 'Password reset successfully. Please log in with your new password.');
};