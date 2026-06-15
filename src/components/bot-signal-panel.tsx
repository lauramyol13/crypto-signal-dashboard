'use client';

import type { BotSignalSnapshot } from '@/lib/types';
import { cn } from '@/lib/cn';
import { Bot, TrendingDown, TrendingUp, Minus } from 'lucide-react';

interface Props {
  snapshot: BotSignalSnapshot;
}

export function BotSignalPanel({ snapshot }: Props) {
  const score = snapshot.trade_score ?? 0;
  const bias =
    snapshot.buy_signal ? 'buy' : snapshot.sell_signal ? 'sell' : score > 0.01 ? 'buy' : score < -0.01 ? 'sell' : 'neutral';

  const config = {
    buy: { icon: TrendingUp, color: 'text-og-success', label: 'Bot: Buy bias' },
    sell: { icon: TrendingDown, color: 'text-og-error', label: 'Bot: Sell bias' },
    neutral: { icon: Minus, color: 'text-zinc-400', label: 'Bot: Neutral' },
  }[bias];

  const Icon = config.icon;

  return (
    <div className="rounded-xl border border-og-mid/40 bg-og-card/60 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Bot className="w-4 h-4 text-og-primary" />
        <span className="text-sm font-semibold text-white">ML Bot Signal</span>
        <span className="text-xs text-zinc-500 ml-auto">{snapshot.freq ?? 'pipeline'}</span>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={cn('w-5 h-5', config.color)} />
          <span className={cn('text-sm font-medium', config.color)}>{config.label}</span>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold text-white">{score.toFixed(3)}</div>
          <div className="text-xs text-zinc-500">trade score</div>
        </div>
      </div>
      <p className="text-xs text-zinc-500 mt-2">
        Updated {new Date(snapshot.updated_at).toLocaleString()} · close ${snapshot.close.toLocaleString()}
      </p>
    </div>
  );
}
