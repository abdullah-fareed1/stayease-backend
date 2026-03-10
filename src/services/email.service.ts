import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.EMAIL_FROM as string;

export const sendWelcomeEmail = async (user: { email: string; name: string }) => {
  if (!resend) { console.log(`[EMAIL] Welcome → ${user.email}`); return; }
  await resend.emails.send({
    from: FROM,
    to: user.email,
    subject: 'Welcome to Grand Horizon Hotels',
    html: `<p>Hi ${user.name.split(' ')[0]},</p><p>Welcome to Grand Horizon Hotels. Your account is ready.</p>`,
  });
};

export const sendPasswordResetEmail = async (email: string, name: string, resetUrl: string) => {
  if (!resend) { console.log(`[EMAIL] Reset → ${email} URL: ${resetUrl}`); return; }
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: 'Reset your password — Grand Horizon Hotels',
    html: `<p>Hi ${name.split(' ')[0]},</p><p>Click the link to reset your password (expires in 1 hour):</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
  });
};

export const sendPasswordChangedEmail = async (email: string, name: string) => {
  if (!resend) { console.log(`[EMAIL] PwChanged → ${email}`); return; }
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: 'Your password was changed — Grand Horizon Hotels',
    html: `<p>Hi ${name.split(' ')[0]},</p><p>Your password was successfully changed. If this was not you, contact us immediately.</p>`,
  });
};

export const sendBookingConfirmationEmail = async (booking: any, room: any, user: any) => {
  if (!resend) { console.log(`[EMAIL] BookingConfirm → ${user.email}`); return; }
  await resend.emails.send({
    from: FROM,
    to: user.email,
    subject: `Booking Confirmed — ${room.name}`,
    html: `<p>Hi ${user.name.split(' ')[0]},</p><p>Your booking for <strong>${room.name}</strong> from ${booking.checkIn} to ${booking.checkOut} is confirmed.</p><p>Booking ID: ${booking.id}</p>`,
  });
};

export const sendPaymentReceiptEmail = async (payment: any, booking: any, room: any, user: any) => {
  if (!resend) { console.log(`[EMAIL] PaymentReceipt → ${user.email}`); return; }
  await resend.emails.send({
    from: FROM,
    to: user.email,
    subject: 'Payment Receipt — Grand Horizon Hotels',
    html: `<p>Hi ${user.name.split(' ')[0]},</p><p>We received your payment of $${payment.amount} for booking ${booking.id} (${room.name}).</p>`,
  });
};

export const sendCancellationEmail = async (booking: any, room: any, user: any) => {
  if (!resend) { console.log(`[EMAIL] Cancellation → ${user.email}`); return; }
  await resend.emails.send({
    from: FROM,
    to: user.email,
    subject: `Booking Cancelled — ${room.name}`,
    html: `<p>Hi ${user.name.split(' ')[0]},</p><p>Your booking for <strong>${room.name}</strong> (ID: ${booking.id}) has been cancelled.</p>`,
  });
};