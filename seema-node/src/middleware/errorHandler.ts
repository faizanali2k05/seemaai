import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import logger from '../utils/logger';

interface ErrorResponse {
  error: true;
  message: string;
  statusCode: number;
  details?: unknown;
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  let statusCode = 500;
  let message = 'Internal server error';
  let details: unknown = undefined;

  // --- Prisma errors ---
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002': {
        statusCode = 409;
        const target = (err.meta?.target as string[]) || [];
        message = `Unique constraint violation on: ${target.join(', ')}`;
        break;
      }
      case 'P2025':
        statusCode = 404;
        message = 'Record not found';
        break;
      case 'P2003':
        statusCode = 400;
        message = 'Foreign key constraint failed';
        break;
      case 'P2014':
        statusCode = 400;
        message = 'Required relation violation';
        break;
      default:
        statusCode = 400;
        message = `Database error: ${err.code}`;
    }
  }

  // --- Zod validation errors ---
  else if (err instanceof ZodError) {
    statusCode = 400;
    message = 'Validation error';
    details = err.errors.map((e) => ({
      path: e.path.join('.'),
      message: e.message,
    }));
  }

  // --- Generic errors with a status code ---
  else if ('statusCode' in err && typeof (err as Record<string, unknown>).statusCode === 'number') {
    statusCode = (err as Record<string, unknown>).statusCode as number;
    message = err.message;
  }

  // --- Fallback ---
  else if (err.message) {
    message = process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message;
  }

  // Log the error
  if (statusCode >= 500) {
    logger.error('Unhandled error', {
      message: err.message,
      stack: err.stack,
      statusCode,
    });
  } else {
    logger.warn('Client error', {
      message: err.message,
      statusCode,
    });
  }

  const response: ErrorResponse = {
    error: true,
    message,
    statusCode,
  };

  if (details) {
    response.details = details;
  }

  res.status(statusCode).json(response);
}
