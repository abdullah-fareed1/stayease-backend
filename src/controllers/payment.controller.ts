import { Request, Response } from 'express';
import { prisma } from '../config/db';
import stripe from '../config/stripe';
import { success, error } from '../utils/response';
import { sendPaymentReceiptEmail } from '../services/email.service';
import { sendToOne } from '../services/fcm.service';

export const initiatePayment = async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { bookingId, paymentType } = req.body;

  if (!bookingId || typeof bookingId !== 'string') return error(res, 'bookingId is required.', 400);
  if (!paymentType || !['PARTIAL', 'FULL'].includes(paymentType)) return error(res, 'paymentType must be PARTIAL or FULL.', 400);

  const booking = await prisma.booking.findFirst({ where: { id: bookingId, userId: user.id } });
  if (!booking) return error(res, 'Booking not found.', 404);
  if (booking.status === 'CANCELLED') return error(res, 'Cannot pay for a cancelled booking.', 400);

  const completedPayments = await prisma.payment.findMany({
    where: { bookingId, status: 'PAID' },
  });
  const alreadyPaid = completedPayments.reduce((sum, p) => sum + Number(p.amount), 0);
  const totalAmount = Number(booking.totalAmount);

  if (alreadyPaid >= totalAmount) return error(res, 'This booking is already fully paid.', 400);

  let chargeAmount: number;
  if (alreadyPaid > 0) {
    chargeAmount = parseFloat((totalAmount - alreadyPaid).toFixed(2));
  } else if (paymentType === 'PARTIAL') {
    chargeAmount = parseFloat((totalAmount * 0.5).toFixed(2));
  } else {
    chargeAmount = totalAmount;
  }

  const pi = await stripe.paymentIntents.create({
    amount: Math.round(chargeAmount * 100),
    currency: 'usd',
    metadata: { bookingId, userId: user.id, paymentType },
  });

  const payment = await prisma.payment.create({
    data: {
      bookingId,
      userId: user.id,
      stripePaymentIntentId: pi.id,
      amount: chargeAmount,
      type: alreadyPaid > 0 ? 'PARTIAL' : (paymentType as any),
      status: 'PENDING',
    },
  });

  return success(res, { clientSecret: pi.client_secret, paymentId: payment.id, amount: chargeAmount }, 'Payment initiated');
};

export const stripeWebhook = async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string;

  let event: any;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET as string);
  } catch {
    return res.status(400).send('Webhook signature verification failed');
  }

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object;
    const payment = await prisma.payment.findUnique({ where: { stripePaymentIntentId: pi.id } });
    if (!payment) return res.sendStatus(200);

    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'PAID', paidAt: new Date() },
    });

    const booking = await prisma.booking.findUnique({ where: { id: payment.bookingId } });
    if (booking) {
      if (booking.status === 'PENDING') {
        await prisma.booking.update({ where: { id: booking.id }, data: { status: 'CONFIRMED' } });
      }

      if (payment.userId) {
        const userRec = await prisma.user.findUnique({ where: { id: payment.userId } });
        if (userRec) {
          sendPaymentReceiptEmail(userRec.email, userRec.name, Number(payment.amount), booking.id).catch(() => {});
          if (userRec.fcmToken) {
            sendToOne(userRec.fcmToken, 'Payment Confirmed', `Your payment of $${payment.amount} has been received.`).catch(() => {});
          }
        }
      }
    }
  }

  if (event.type === 'payment_intent.payment_failed') {
    const pi = event.data.object;
    const payment = await prisma.payment.findUnique({ where: { stripePaymentIntentId: pi.id } });
    if (payment) {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
    }
  }

  return res.sendStatus(200);
};

export const getPaymentsForBooking = async (req: Request, res: Response) => {
  const bookingId = req.params.bookingId as string;
  const user = (req as any).user;
  const admin = (req as any).admin;

  let booking;

  if (admin) {
    booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  } else {
    booking = await prisma.booking.findFirst({ where: { id: bookingId, userId: user.id } });
  }

  if (!booking) return error(res, 'Booking not found.', 404);

  const payments = await prisma.payment.findMany({
    where: { bookingId },
    orderBy: { createdAt: 'asc' },
  });

  const totalPaid = payments
    .filter((p) => p.status === 'PAID')
    .reduce((sum, p) => sum + Number(p.amount), 0);

  return success(res, {
    payments,
    totalPaid: parseFloat(totalPaid.toFixed(2)),
    totalAmount: Number(booking.totalAmount),
    remainingBalance: parseFloat((Number(booking.totalAmount) - totalPaid).toFixed(2)),
  }, 'Payments fetched successfully');
};

export const adminRefundPayment = async (req: Request, res: Response) => {
  const paymentId = req.params.paymentId as string;

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return error(res, 'Payment not found.', 404);
  if (payment.status !== 'PAID') return error(res, 'Can only refund completed payments.', 400);
  if (!payment.stripePaymentIntentId) return error(res, 'No Stripe payment intent found.', 400);

  await stripe.refunds.create({ payment_intent: payment.stripePaymentIntentId });

  await prisma.payment.update({ where: { id: paymentId }, data: { status: 'REFUNDED' } });

  return success(res, null, 'Payment refunded successfully');
};