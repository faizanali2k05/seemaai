import Redis from 'ioredis';
import logger from '../utils/logger';

// BullMQ requires `maxRetriesPerRequest: null` because workers issue blocking
// commands (BRPOPLPUSH, BLPOP). Setting a finite retry count would cause
// BullMQ to throw on construction. `enableReadyCheck: false` is also
// recommended — Redis clusters that don't respond to INFO would otherwise
// stall worker startup.
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy(times: number) {
    const delay = Math.min(times * 200, 2000);
    return delay;
  },
});

redis.on('connect', () => {
  logger.info('Redis connected');
});

redis.on('error', (err: Error) => {
  logger.error('Redis connection error', { error: err.message });
});

export default redis;
