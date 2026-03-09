const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const errorHandler = require('./middleware/errorHandler');
const authRouter = require('./routes/auth.routes');
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

app.use(errorHandler);

module.exports = app;