import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import errorHandler from './middleware/errorHandler';
import authRouter from './routes/auth.routes';
import adminAuthRouter from './routes/adminAuth.routes';

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_BASE_URL }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: true, message: 'API is running' });
});

app.use('/api/auth', authRouter);
app.use('/api/admin/auth', adminAuthRouter);

app.use(errorHandler);

export default app;