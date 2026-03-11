import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/db';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { success, error } from '../utils/response';
import { sendOtpEmail, sendPasswordChangedEmail } from '../services/email.service';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

const generateOtp = (): string => Math.floor(100000 + Math.random() * 900000).toString();

export const adminLogin = async (req: Request, res: Response) => {
  let { email, password } = req.body;

  email = (email || '').trim().toLowerCase();
  if (!email || !EMAIL_REGEX.test(email)) {
    return error(res, 'Email is required.', 400);
  }
  if (!password) {
    return error(res, 'Password is required.', 400);
  }

  const admin = await prisma.admin.findUnique({ where: { email } });
  if (!admin) {
    return error(res, 'Invalid email or password.', 401);
  }

  const match = await bcrypt.compare(password, admin.passwordHash);
  if (!match) {
    return error(res, 'Invalid email or password.', 401);
  }

  const accessToken = generateAccessToken({ adminId: admin.id, role: admin.role });
  const refreshToken = generateRefreshToken({ adminId: admin.id, role: admin.role });
  const hashedRefresh = await bcrypt.hash(refreshToken, 10);

  await prisma.admin.update({ where: { id: admin.id }, data: { refreshToken: hashedRefresh } });

  return success(res, {
    admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role },
    accessToken,
    refreshToken,
  }, 'Login successful');
};

export const adminRefresh = async (req: Request, res: Response) => {
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

  if (!payload.adminId) {
    return error(res, 'Invalid token.', 401);
  }

  const admin = await prisma.admin.findUnique({ where: { id: payload.adminId } });
  if (!admin) {
    return error(res, 'Admin not found.', 401);
  }

  if (!admin.refreshToken) {
    return error(res, 'Refresh token has been revoked. Please log in again.', 401);
  }

  const valid = await bcrypt.compare(refreshToken, admin.refreshToken);
  if (!valid) {
    return error(res, 'Refresh token has been revoked. Please log in again.', 401);
  }

  const newAccessToken = generateAccessToken({ adminId: admin.id, role: admin.role });
  const newRefreshToken = generateRefreshToken({ adminId: admin.id, role: admin.role });
  const hashedRefresh = await bcrypt.hash(newRefreshToken, 10);

  await prisma.admin.update({ where: { id: admin.id }, data: { refreshToken: hashedRefresh } });

  return success(res, { accessToken: newAccessToken, refreshToken: newRefreshToken }, 'Token refreshed');
};

export const adminLogout = async (req: Request, res: Response) => {
  const admin = (req as any).admin;

  await prisma.admin.update({
    where: { id: admin.id },
    data: { refreshToken: null },
  });

  return success(res, null, 'Logged out successfully.');
};

export const adminForgotPassword = async (req: Request, res: Response) => {
  let { email } = req.body;

  email = (email || '').trim().toLowerCase();
  if (!email || !EMAIL_REGEX.test(email)) {
    return error(res, 'A valid email is required.', 400);
  }

  const RESPONSE = 'If this email is registered, you will receive an OTP shortly.';

  const admin = await prisma.admin.findUnique({ where: { email } });
  if (!admin) {
    return success(res, null, RESPONSE);
  }

  const otp = generateOtp();
  const hashedOtp = await bcrypt.hash(otp, 10);
  const expiry = new Date(Date.now() + 10 * 60 * 1000);

  await prisma.admin.update({
    where: { id: admin.id },
    data: { resetToken: hashedOtp, resetTokenExp: expiry },
  });

  sendOtpEmail(email, admin.name, otp).catch(() => {});

  return success(res, null, RESPONSE);
};

export const adminResetPassword = async (req: Request, res: Response) => {
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

  const admin = await prisma.admin.findUnique({ where: { email } });
  if (!admin || !admin.resetToken) {
    return error(res, 'Invalid or expired OTP.', 400);
  }

  if (!admin.resetTokenExp || admin.resetTokenExp < new Date()) {
    await prisma.admin.update({ where: { id: admin.id }, data: { resetToken: null, resetTokenExp: null } });
    return error(res, 'OTP has expired. Please request a new one.', 400);
  }

  const valid = await bcrypt.compare(otp.toString(), admin.resetToken);
  if (!valid) {
    return error(res, 'Invalid or expired OTP.', 400);
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await prisma.admin.update({
    where: { id: admin.id },
    data: { passwordHash, resetToken: null, resetTokenExp: null, refreshToken: null },
  });

  sendPasswordChangedEmail(email, admin.name).catch(() => {});

  return success(res, null, 'Password reset successfully. Please log in with your new password.');
};