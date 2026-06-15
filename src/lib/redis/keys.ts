const PREFIX = process.env.REDIS_KEY_PREFIX?.trim() || 'csb';

export function redisKey(key: string): string {
  return `${PREFIX}:${key}`;
}

export function signalCacheKey(pair: string): string {
  return `signals:${pair.toUpperCase()}`;
}

/** Key used by intelligent-trading-bot (prefix itb by default). */
export function botSignalKey(pair: string): string {
  const botPrefix = process.env.BOT_REDIS_KEY_PREFIX?.trim() || 'itb';
  return `${botPrefix}:signal:${pair.toUpperCase()}:latest`;
}
