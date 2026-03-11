import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.EMAIL_FROM as string;

export const sendWelcomeEmail = async (email: string, name: string) => {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[EMAIL] Welcome email to ${email}`);
    return;
  }
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: 'Welcome to Grand Horizon Hotels',
    html: `<p>Hi ${name},</p><p>Welcome to Grand Horizon Hotels. We look forward to hosting you.</p>`,
  });
};

export const sendOtpEmail = async (email: string, name: string, otp: string) => {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[EMAIL] OTP for ${email}: ${otp}`);
    return;
  }
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: 'Your Password Reset OTP — Grand Horizon Hotels',
    html: `<p>Hi ${name},</p><p>Your OTP for password reset is:</p><h2 style="letter-spacing:8px">${otp}</h2><p>This code expires in 10 minutes. Do not share it with anyone.</p>`,
  });
};

export const sendPasswordChangedEmail = async (email: string, name: string) => {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[EMAIL] Password changed confirmation to ${email}`);
    return;
  }
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: 'Your password has been changed — Grand Horizon Hotels',
    html: `<p>Hi ${name},</p><p>Your password was successfully changed. If you did not do this, contact support immediately.</p>`,
  });
};

export const sendBookingConfirmationEmail = async (email: string, name: string, bookingRef: string) => {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[EMAIL] Booking confirmation to ${email} for ${bookingRef}`);
    return;
  }
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: `Booking Confirmed — ${bookingRef}`,
    html: `<p>Hi ${name},</p><p>Your booking <strong>${bookingRef}</strong> has been confirmed.</p>`,
  });
};

export const sendPaymentReceiptEmail = async (email: string, name: string, amount: number, bookingRef: string) => {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[EMAIL] Payment receipt to ${email}`);
    return;
  }
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: `Payment Receipt — ${bookingRef}`,
    html: `<p>Hi ${name},</p><p>We received your payment of <strong>$${amount}</strong> for booking <strong>${bookingRef}</strong>.</p>`,
  });
};

export const sendCancellationEmail = async (email: string, name: string, bookingRef: string) => {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[EMAIL] Cancellation email to ${email} for ${bookingRef}`);
    return;
  }
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: `Booking Cancelled — ${bookingRef}`,
    html: `<p>Hi ${name},</p><p>Your booking <strong>${bookingRef}</strong> has been cancelled.</p>`,
  });
};