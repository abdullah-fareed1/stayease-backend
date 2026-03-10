import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { prisma } from '../config/db';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { success, error } from '../utils/response';
import { sendWelcomeEmail, sendPasswordResetEmail, sendPasswordChangedEmail } from '../services/email.service';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

export const register = async (req: Request, res: Response) => {
  const { phone } = req.body;
  let { name, email, password } = req.body;

  const trimmedName = (name || '').trim();
  if (!trimmedName || trimmedName.length < 2 || trimmedName.length > 100) {
    return error(res, 'Name is required and must be between 2 and 100 characters.', 400);
  }

  email = (email || '').trim().toLowerCase();
  if (!email || !EMAIL_REGEX.test(email)) {
    return error(res, 'Invalid email format.', 400);
  }

  if (!password || password.length < 8) {
    return error(res, 'Password must be at least 8 characters.', 400);
  }
  if (!PASSWORD_REGEX.test(password)) {
    return error(res, 'Password must contain uppercase, lowercase, and number.', 400);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return error(res, 'An account with this email already exists.', 409);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: { name: trimmedName, email, passwordHash, phone: phone || null },
  });

  const accessToken = generateAccessToken({ userId: user.id, role: 'CUSTOMER' });
  const refreshToken = generateRefreshToken({ userId: user.id, role: 'CUSTOMER' });
  const hashedRefresh = await bcrypt.hash(refreshToken, 10);

  await prisma.user.update({ where: { id: user.id }, data: { refreshToken: hashedRefresh } });

  await prisma.cart.create({ data: { userId: user.id } });

  sendWelcomeEmail(user).catch(() => {});

  return success(
    res,
    { user: { id: user.id, name: user.name, email: user.email, phone: user.phone }, accessToken, refreshToken },
    'Registration successful',
    201
  );
};

export const login = async (req: Request, res: Response) => {
  let { email, password, fcmToken } = req.body;

  email = (email || '').trim().toLowerCase();
  if (!email || !EMAIL_REGEX.test(email)) {
    return error(res, 'Email is required.', 400);
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

  const updateData: Record<string, string> = { refreshToken: hashedRefresh };
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
    return error(res, 'Refresh token is required.', 401);
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

  const RESPONSE = 'If this email is registered, you will receive a reset link shortly.';

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return success(res, null, RESPONSE);
  }

  const plainToken = randomBytes(32).toString('hex');
  const hashedToken = await bcrypt.hash(plainToken, 10);
  const expiry = new Date(Date.now() + 3600000);

  await prisma.user.update({
    where: { id: user.id },
    data: { resetToken: hashedToken, resetTokenExp: expiry },
  });

  const resetUrl = `${process.env.CLIENT_BASE_URL}/reset-password?token=${plainToken}&email=${email}`;

  sendPasswordResetEmail(email, user.name, resetUrl).catch(() => {});

  return success(res, null, RESPONSE);
};

export const resetPassword = async (req: Request, res: Response) => {
  const { token, newPassword } = req.body;
  let { email } = req.body;

  email = (email || '').trim().toLowerCase();

  if (!newPassword || newPassword.length < 8) {
    return error(res, 'Password must be at least 8 characters.', 400);
  }
  if (!PASSWORD_REGEX.test(newPassword)) {
    return error(res, 'Password must contain uppercase, lowercase, and number.', 400);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.resetToken) {
    return error(res, 'Invalid or expired reset link.', 400);
  }

  if (!user.resetTokenExp || user.resetTokenExp < new Date()) {
    await prisma.user.update({ where: { id: user.id }, data: { resetToken: null, resetTokenExp: null } });
    return error(res, 'Reset link has expired. Please request a new one.', 400);
  }

  const valid = await bcrypt.compare(token, user.resetToken);
  if (!valid) {
    return error(res, 'Invalid or expired reset link.', 400);
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, resetToken: null, resetTokenExp: null, refreshToken: null },
  });

  sendPasswordChangedEmail(email, user.name).catch(() => {});

  return success(res, null, 'Password reset successfully. Please log in with your new password.');
};