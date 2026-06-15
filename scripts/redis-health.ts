import { isRedisEnabled, pingRedis } from '../src/lib/redis/client';

async function main(): Promise<void> {
  const enabled = isRedisEnabled();
  const connected = enabled ? await pingRedis() : false;
  console.log(JSON.stringify({ enabled, connected }, null, 2));
  process.exit(connected || !enabled ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
