import { execSync } from 'node:child_process';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchCandles } from '../src/lib/binance';
import { analyzeAll, getConsensus } from '../src/lib/indicators';
import { cacheGetJson, cacheSetJson, clearMemoryCache } from '../src/lib/redis/cache';
import { botSignalKey, signalCacheKey } from '../src/lib/redis/keys';
import { isRedisEnabled, pingRedis } from '../src/lib/redis/client';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number.parseInt(process.env.TEST_PORT ?? '3099', 10);
const BASE_URL = process.env.TEST_BASE_URL ?? `http://127.0.0.1:${PORT}`;

function step(label: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve(fn()).then(() => console.log(`✓ ${label}`));
}

async function waitForServer(url: string, timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server did not become ready at ${url}`);
}

async function testMarketData(): Promise<void> {
  const candles = await fetchCandles('BTCUSDT', '1h', 100);
  if (candles.length < 48) throw new Error(`expected >= 48 candles, got ${candles.length}`);
  const indicators = analyzeAll(candles);
  const consensus = getConsensus(indicators);
  if (!['bullish', 'bearish', 'neutral'].includes(consensus.overall)) {
    throw new Error(`invalid consensus: ${consensus.overall}`);
  }
}

async function testRedisCache(): Promise<void> {
  clearMemoryCache();
  process.env.REDIS_ENABLED = 'false';
  const key = 'pipeline:test';
  await cacheSetJson(key, { ok: true, pair: 'BTCUSDT' }, 30);
  const val = await cacheGetJson<{ ok: boolean }>(key);
  if (!val?.ok) throw new Error('cache round-trip failed');
}

async function testKeys(): Promise<void> {
  if (!signalCacheKey('btcusdt').includes('signals:BTCUSDT')) {
    throw new Error('signalCacheKey normalization failed');
  }
  if (!botSignalKey('ethusdt').endsWith('signal:ETHUSDT:latest')) {
    throw new Error('botSignalKey shape failed');
  }
}

async function testHealthApi(): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/health`);
  if (!res.ok) throw new Error(`health failed: ${res.status}`);
  const body = (await res.json()) as { status: string; redis: { configured: boolean; connected: boolean } };
  if (body.status !== 'ok') throw new Error('health status not ok');
  console.log(`  redis configured=${body.redis.configured} connected=${body.redis.connected}`);
}

async function testSignalsApi(): Promise<void> {
  const url = `${BASE_URL}/api/signals?pair=BTCUSDT&refresh=1`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`signals API failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const body = (await res.json()) as { pair: string; indicators: unknown[]; cached?: boolean };
  if (body.pair !== 'BTCUSDT' || !Array.isArray(body.indicators) || body.indicators.length === 0) {
    throw new Error('invalid signals response shape');
  }
  console.log(`  indicators=${body.indicators.length} cached=${body.cached ?? false}`);

  const res2 = await fetch(`${BASE_URL}/api/signals?pair=BTCUSDT`);
  const body2 = (await res2.json()) as { cached?: boolean };
  console.log(`  second fetch cached=${body2.cached ?? false}`);
}

async function main(): Promise<void> {
  console.log('Crypto Signal Board — pipeline test\n');

  await step('Redis key helpers', testKeys);
  await step('Redis cache (memory fallback)', testRedisCache);
  await step('Binance + TA indicators', testMarketData);
  console.log(`✓ redis ping (enabled=${isRedisEnabled()}, ping=${await pingRedis()})`);

  console.log('\n> npm run build');
  execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });

  let server: ChildProcess | null = null;
  try {
    server = spawn('npm', ['run', 'start', '--', '-p', String(PORT)], {
      cwd: ROOT,
      stdio: 'pipe',
      shell: true,
      env: { ...process.env, REDIS_ENABLED: 'false' },
    });

    await waitForServer(`${BASE_URL}/api/health`);
    await step('/api/health', testHealthApi);
    await step('/api/signals', testSignalsApi);
  } finally {
    if (server && !server.killed) {
      if (process.platform === 'win32' && server.pid) {
        spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { shell: true });
      } else {
        server.kill('SIGTERM');
      }
    }
  }

  console.log('\nAll pipeline checks passed.');
}

main().catch((err) => {
  console.error('\nPipeline FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});
