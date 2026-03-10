import { Response } from 'express';

export const success = (res: Response, data: any, message = 'Success', statusCode = 200) =>
  res.status(statusCode).json({ status: true, message, data });

export const error = (res: Response, message = 'Something went wrong', statusCode = 400) =>
  res.status(statusCode).json({ status: false, message, data: null });