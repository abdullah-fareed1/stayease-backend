import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import errorHandler from './middleware/errorHandler';
import authRouter from './routes/auth.routes';
import adminAuthRouter from './routes/adminAuth.routes';
import roomRouter from './routes/room.routes';
import adminRoomRouter from './routes/adminRoom.routes';
import bookingRouter from './routes/booking.routes';
import adminBookingRouter from './routes/adminBooking.routes';
import cartRouter from './routes/cart.routes';

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_BASE_URL || '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: false, message: 'Too many requests, please try again later.', data: null },
});

app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: true, message: 'API is running' });
});

app.use('/api/auth', authLimiter, authRouter);
app.use('/api/admin/auth', authLimiter, adminAuthRouter);
app.use('/api/rooms', roomRouter);
app.use('/api/admin/rooms', adminRoomRouter);
app.use('/api/bookings', bookingRouter);
app.use('/api/admin/bookings', adminBookingRouter);
app.use('/api/cart', cartRouter);

app.use(errorHandler);

export default app;