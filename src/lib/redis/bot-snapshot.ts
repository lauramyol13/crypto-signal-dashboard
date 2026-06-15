import type { BotSignalSnapshot } from '@/lib/types';
import { cacheGetExternalJson } from './cache';
import { botSignalKey } from './keys';

export async function getBotSignalSnapshot(pair: string): Promise<BotSignalSnapshot | null> {
  return cacheGetExternalJson<BotSignalSnapshot>(botSignalKey(pair));
}
