import { NextRequest, NextResponse } from 'next/server';
import { fetchCandles, fetchCurrentPrice, fetch24hStats, ALL_PAIRS, type Pair } from '@/lib/binance';
import { analyzeAll, getConsensus } from '@/lib/indicators';
import { getAIVerdict } from '@/lib/opengradient';
import { runModelHub } from '@/lib/og-models';
import { cacheGetJson, cacheSetJson } from '@/lib/redis/cache';
import { signalCacheKey } from '@/lib/redis/keys';
import { getBotSignalSnapshot } from '@/lib/redis/bot-snapshot';
import type { SignalResponse, ModelPrediction } from '@/lib/types';

const CACHE_TTL_SEC = Number.parseInt(process.env.REDIS_SIGNAL_TTL_SEC ?? '60', 10) || 60;

export async function GET(req: NextRequest) {
  const pair = (req.nextUrl.searchParams.get('pair') ?? 'BTCUSDT').toUpperCase() as Pair;
  const skipCache = req.nextUrl.searchParams.get('refresh') === '1';

  if (!(ALL_PAIRS as readonly string[]).includes(pair)) {
    return NextResponse.json({ error: `Invalid pair. Use: ${ALL_PAIRS.join(', ')}` }, { status: 400 });
  }

  try {
    if (!skipCache) {
      const cached = await cacheGetJson<SignalResponse>(signalCacheKey(pair));
      if (cached) {
        return NextResponse.json({ ...cached, cached: true });
      }
    }

    const [candles, price, stats, botSignal] = await Promise.all([
      fetchCandles(pair, '1h', 100),
      fetchCurrentPrice(pair),
      fetch24hStats(pair),
      getBotSignalSnapshot(pair),
    ]);

    const indicators = analyzeAll(candles);
    const consensus = getConsensus(indicators);

    let ai: import('@/lib/types').AIVerdict;
    let models: ModelPrediction[] = [];
    let modelHubError: string | undefined;

    const [aiResult, modelsResult] = await Promise.allSettled([
      getAIVerdict(pair, price, stats, indicators, candles),
      runModelHub(pair),
    ]);

    if (aiResult.status === 'fulfilled') {
      ai = aiResult.value;
    } else {
      ai = {
        macro_events: [],
        macro_risk: 'low',
        combined_verdict: 'neutral',
        confidence: 0,
        summary: 'AI analysis unavailable — TEE node could not be reached. Showing technical indicators only.',
        txHash: null,
      };
    }

    if (modelsResult.status === 'fulfilled') {
      models = modelsResult.value;
    } else {
      modelHubError = modelsResult.reason instanceof Error ? modelsResult.reason.message : String(modelsResult.reason);
    }

    const miniCandles = candles.slice(-48).map((c) => ({
      time: c.openTime,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    const response: SignalResponse = {
      pair,
      price,
      stats,
      candles: miniCandles,
      indicators,
      consensus,
      ai,
      models,
      modelHubError,
      botSignal,
      timestamp: new Date().toISOString(),
      cached: false,
    };

    await cacheSetJson(signalCacheKey(pair), response, CACHE_TTL_SEC);

    return NextResponse.json(response);
  } catch (err) {
    console.error('[signals] Error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';

    if (message.includes('APP_WALLET_PRIVATE_KEY')) {
      return NextResponse.json({ error: 'Server wallet not configured' }, { status: 500 });
    }
    if (message.includes('readContract') || message.includes('eth_call')) {
      return NextResponse.json({ error: 'Failed to connect to blockchain RPC' }, { status: 502 });
    }
    if (message.includes('TEE')) {
      return NextResponse.json({ error: `AI analysis unavailable — ${message}` }, { status: 502 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
