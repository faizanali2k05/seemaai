import rateLimit from 'express-rate-limit';

/**
 * Default rate limiter: 100 requests per 15-minute window per IP.
 */
export const defaultLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: true,
    message: 'Too many requests, please try again later.',
    statusCode: 429,
  },
});

/**
 * Stricter rate limiter for auth endpoints: 20 requests per 15-minute window per IP.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: true,
    message: 'Too many authentication attempts, please try again later.',
    statusCode: 429,
  },
});
