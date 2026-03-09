const { Resend } = require('resend');

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.EMAIL_FROM;

const sendWelcomeEmail = async (user) => {
  if (!resend) {
    console.log(`[EMAIL] Welcome email would send to ${user.email}`);
    return;
  }
  await resend.emails.send({
    from: FROM,
    to: user.email,
    subject: 'Welcome to Grand Horizon Hotels',
    html: `<p>Hi ${user.name.split(' ')[0]},</p><p>Welcome to Grand Horizon Hotels. Your account is ready.</p>`,
  });
};

const sendPasswordResetEmail = async (email, name, resetUrl) => {
  if (!resend) {
    console.log(`[EMAIL] Password reset email would send to ${email} — URL: ${resetUrl}`);
    return;
  }
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: 'Reset your password — Grand Horizon Hotels',
    html: `<p>Hi ${name.split(' ')[0]},</p><p>Click the link below to reset your password. This link expires in 1 hour.</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you did not request this, ignore this email.</p>`,
  });
};

const sendPasswordChangedEmail = async (email, name) => {
  if (!resend) {
    console.log(`[EMAIL] Password changed email would send to ${email}`);
    return;
  }
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: 'Your password was changed — Grand Horizon Hotels',
    html: `<p>Hi ${name.split(' ')[0]},</p><p>Your password was successfully changed. If this was not you, contact us immediately.</p>`,
  });
};

const sendBookingConfirmationEmail = async (booking, room, user) => {
  if (!resend) {
    console.log(`[EMAIL] Booking confirmation would send to ${user.email}`);
    return;
  }
  await resend.emails.send({
    from: FROM,
    to: user.email,
    subject: `Booking Confirmed — ${room.name}`,
    html: `<p>Hi ${user.name.split(' ')[0]},</p><p>Your booking for <strong>${room.name}</strong> from ${booking.checkIn} to ${booking.checkOut} is confirmed.</p><p>Booking ID: ${booking.id}</p>`,
  });
};

const sendPaymentReceiptEmail = async (payment, booking, room, user) => {
  if (!resend) {
    console.log(`[EMAIL] Payment receipt would send to ${user.email}`);
    return;
  }
  await resend.emails.send({
    from: FROM,
    to: user.email,
    subject: `Payment Receipt — Grand Horizon Hotels`,
    html: `<p>Hi ${user.name.split(' ')[0]},</p><p>We received your payment of $${payment.amount} for booking ${booking.id} (${room.name}).</p>`,
  });
};

const sendCancellationEmail = async (booking, room, user) => {
  if (!resend) {
    console.log(`[EMAIL] Cancellation email would send to ${user.email}`);
    return;
  }
  await resend.emails.send({
    from: FROM,
    to: user.email,
    subject: `Booking Cancelled — ${room.name}`,
    html: `<p>Hi ${user.name.split(' ')[0]},</p><p>Your booking for <strong>${room.name}</strong> (ID: ${booking.id}) has been cancelled.</p>`,
  });
};

module.exports = {
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
  sendBookingConfirmationEmail,
  sendPaymentReceiptEmail,
  sendCancellationEmail,
};