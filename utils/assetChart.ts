/**
 * Asset price chart helpers — port of wartbunker `dexPrice.js` chart paths.
 *
 * Flow:
 *  1. GET /chart/candles/:hash/:interval  (or /chart/trades/:hash)
 *  2. On missing chart API / empty index → build from /transaction/latest matches
 *  3. If still empty but pool has reserves → single pool-spot point
 */
import { normalizeNodeUrl } from "./nodes";
import { isValidAssetHash, normalizeAssetHash } from "./warthogFormat";
import { computePoolSpotPrice, getNodeData } from "./defiApi";

export type ChartInterval = "5m" | "1h" | "1d";
export type ChartMode = "candles" | "trades";

export type CandlePoint = {
  timestamp: number;
  height: number;
  open: number;
  high: number;
  low: number;
  close: number;
  baseVol?: number;
  quoteVol?: number;
};

export type TradePoint = {
  timestamp: number;
  height: number;
  base: number;
  quote: number;
  price: number | null;
};

export type ChartSeriesPoint = {
  x: number;
  y: number;
  label: string;
  meta: string;
};

export const CHART_INTERVALS: { id: ChartInterval; label: string }[] = [
  { id: "5m", label: "5m" },
  { id: "1h", label: "1h" },
  { id: "1d", label: "1d" },
];

const INTERVAL_SECONDS: Record<ChartInterval, number> = {
  "5m": 300,
  "1h": 3600,
  "1d": 86400,
};

/** Node: chart endpoints not registered. */
const CHART_API_UNSUPPORTED_CODE = 324;
/** Node: chart service has not indexed this asset yet. */
const CHART_ASSET_NOT_INDEXED = new Set([185, 186]);

export function shouldUseChartFallback(code: number | undefined | null): boolean {
  if (code == null) return false;
  return code === CHART_API_UNSUPPORTED_CODE || CHART_ASSET_NOT_INDEXED.has(code);
}

type NodeJson = {
  code?: number;
  data?: unknown;
  error?: string;
};

async function fetchNodePath(
  nodeBase: string,
  path: string,
): Promise<NodeJson> {
  const base = normalizeNodeUrl(nodeBase);
  if (!base) throw new Error("Invalid node URL");
  try {
    const res = await getNodeData(base, path.replace(/^\//, ""));
    return {
      code: res.code,
      data: res.data,
      error: res.error,
    };
  } catch (e) {
    return {
      code: CHART_API_UNSUPPORTED_CODE,
      error: e instanceof Error ? e.message : "Chart request failed",
    };
  }
}

function parseAmountObj(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === "object") {
    const o = v as {
      str?: string;
      E8?: number | string;
      u64?: number | string;
      decimals?: number;
    };
    if (o.str != null) {
      const n = parseFloat(o.str);
      return Number.isFinite(n) ? n : null;
    }
    if (o.E8 != null) return Number(o.E8) / 1e8;
    if (o.u64 != null) {
      const d = o.decimals ?? 0;
      return Number(o.u64) / 10 ** Number(d);
    }
  }
  return null;
}

export function parseCandleResponse(data: unknown): CandlePoint[] {
  if (!Array.isArray(data)) return [];
  const out: CandlePoint[] = [];
  for (const row of data) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const [timestamp, height, open, high, low, close, baseVol, quoteVol] = row;
    if (![open, high, low, close].every((v) => Number.isFinite(Number(v)))) {
      continue;
    }
    const point: CandlePoint = {
      timestamp: Number(timestamp),
      height: Number(height),
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
    };
    if (baseVol != null) point.baseVol = Number(baseVol);
    if (quoteVol != null) point.quoteVol = Number(quoteVol);
    out.push(point);
  }
  return out.sort((a, b) => a.timestamp - b.timestamp);
}

export function parseTradeResponse(data: unknown): TradePoint[] {
  if (!Array.isArray(data)) return [];
  return data
    .map((row) => {
      if (!Array.isArray(row) || row.length < 4) return null;
      const [timestamp, height, base, quote] = row;
      const baseN = Number(base);
      const quoteN = Number(quote);
      const price =
        baseN > 0 && Number.isFinite(quoteN) ? quoteN / baseN : null;
      return {
        timestamp: Number(timestamp),
        height: Number(height),
        base: baseN,
        quote: quoteN,
        price,
      };
    })
    .filter((x): x is TradePoint => x != null)
    .sort((a, b) => a.timestamp - b.timestamp);
}

/** Matched swaps from GET /transaction/latest when /chart/* is missing or empty. */
export function parseMatchTradesFromLatest(
  latestData: unknown,
  assetHash: string,
): TradePoint[] {
  const normalized = normalizeAssetHash(assetHash).toLowerCase();
  if (!isValidAssetHash(normalized)) return [];

  const root = latestData as { perBlock?: unknown[] } | null;
  const perBlock = root?.perBlock;
  if (!Array.isArray(perBlock)) return [];

  const trades: TradePoint[] = [];
  for (const block of perBlock) {
    const b = block as {
      height?: number;
      timestamp?: number;
      header?: { time?: { timestamp?: number }; timestamp?: number };
      body?: { match?: unknown[] };
    };
    const timestamp = Number(
      b?.header?.time?.timestamp ?? b?.header?.timestamp ?? b?.timestamp,
    );
    const height = Number(b?.height);
    if (!Number.isFinite(timestamp) || !Number.isFinite(height)) continue;

    const matches = b?.body?.match;
    if (!Array.isArray(matches)) continue;

    for (const entry of matches) {
      const data = (entry as { transaction?: { data?: Record<string, unknown> } })
        ?.transaction?.data;
      if (!data) continue;
      const baseAsset = data.baseAsset as { hash?: string } | undefined;
      const baseHash = String(baseAsset?.hash || "")
        .replace(/^0x/i, "")
        .toLowerCase();
      if (baseHash !== normalized) continue;

      const buy = (data.buySwaps as unknown[]) || [];
      const sell = (data.sellSwaps as unknown[]) || [];
      for (const swap of [...buy, ...sell]) {
        const swapped = (swap as { swapped?: { base?: unknown; quote?: unknown } })
          ?.swapped;
        if (!swapped) continue;
        const baseN = parseAmountObj(swapped.base);
        const quoteN = parseAmountObj(swapped.quote);
        if (baseN == null || quoteN == null || baseN <= 0) continue;
        trades.push({
          timestamp,
          height,
          base: baseN,
          quote: quoteN,
          price: quoteN / baseN,
        });
      }
    }
  }

  return trades.sort(
    (a, b) => a.timestamp - b.timestamp || a.height - b.height,
  );
}

export function aggregateTradesToCandles(
  trades: TradePoint[],
  interval: ChartInterval,
  maxN = 200,
): CandlePoint[] {
  const bucketSec = INTERVAL_SECONDS[interval] || 3600;
  if (!trades.length) return [];

  const buckets = new Map<number, CandlePoint>();
  for (const trade of trades) {
    if (trade.price == null || !Number.isFinite(trade.price)) continue;
    const bucketStart = Math.floor(trade.timestamp / bucketSec) * bucketSec;
    const prev = buckets.get(bucketStart);
    if (!prev) {
      buckets.set(bucketStart, {
        timestamp: bucketStart,
        height: trade.height,
        open: trade.price,
        high: trade.price,
        low: trade.price,
        close: trade.price,
        baseVol: trade.base,
        quoteVol: trade.quote,
      });
      continue;
    }
    prev.high = Math.max(prev.high, trade.price);
    prev.low = Math.min(prev.low, trade.price);
    prev.close = trade.price;
    prev.height = trade.height;
    prev.baseVol = (prev.baseVol ?? 0) + trade.base;
    prev.quoteVol = (prev.quoteVol ?? 0) + trade.quote;
  }

  return [...buckets.values()]
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-maxN);
}

export function buildPoolSpotChartPoint(
  poolSpot: number | null | undefined,
  { height = 0, timestamp }: { height?: number; timestamp?: number } = {},
): CandlePoint | null {
  if (poolSpot == null || !Number.isFinite(poolSpot)) return null;
  const ts =
    timestamp != null && Number.isFinite(timestamp)
      ? timestamp
      : Math.floor(Date.now() / 1000);
  return {
    timestamp: ts,
    height,
    open: poolSpot,
    high: poolSpot,
    low: poolSpot,
    close: poolSpot,
  };
}

export function toChartSeries(
  points: CandlePoint[] | TradePoint[],
  mode: ChartMode,
): ChartSeriesPoint[] {
  return points
    .map((pt) => {
      const price =
        mode === "candles"
          ? (pt as CandlePoint).close
          : (pt as TradePoint).price;
      if (price == null || !Number.isFinite(price)) return null;
      const date = new Date(pt.timestamp * 1000);
      const label = Number.isFinite(date.getTime())
        ? date.toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : `Block ${pt.height}`;
      return {
        x: pt.timestamp,
        y: price,
        label,
        meta: String(price),
      };
    })
    .filter((x): x is ChartSeriesPoint => x != null);
}

export function computeChartStats(points: CandlePoint[] | TradePoint[], mode: ChartMode = "candles") {
  const series = toChartSeries(points, mode);
  if (!series.length) return null;
  const prices = series.map((p) => p.y);
  const first = prices[0];
  const last = prices[prices.length - 1];
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const change = first > 0 ? ((last - first) / first) * 100 : 0;
  return { first, last, min, max, change, count: series.length };
}

export type ChartLoadResult = {
  points: CandlePoint[] | TradePoint[];
  error: string | null;
  interval: ChartInterval | "trades" | "pool";
  mode: ChartMode;
  usedFallback: boolean;
  poolSpotOnly: boolean;
  poolSpot: number | null;
  note: string | null;
};

async function loadMarketSnapshot(
  nodeBase: string,
  hash: string,
): Promise<{ hasLiquidity: boolean; poolSpot: number | null }> {
  try {
    const res = await fetchNodePath(nodeBase, `dex/market/${hash}`);
    if (res.code !== 0 || !res.data) {
      return { hasLiquidity: true, poolSpot: null };
    }
    const market = res.data as Record<string, unknown>;
    const pool = (market.liquidityPool || market.liquidity) as
      | Record<string, unknown>
      | undefined;
    if (!pool) return { hasLiquidity: false, poolSpot: null };
    const spot = computePoolSpotPrice(market as Parameters<typeof computePoolSpotPrice>[0]);
    const wart = parseAmountObj(pool.wart);
    const asset = parseAmountObj(pool.asset);
    const hasLiquidity =
      wart != null && asset != null && wart > 0 && asset > 0;
    return { hasLiquidity, poolSpot: hasLiquidity ? spot : null };
  } catch {
    return { hasLiquidity: true, poolSpot: null };
  }
}

async function loadFromLatest(
  nodeBase: string,
  hash: string,
  mode: ChartMode,
  interval: ChartInterval,
  n: number,
): Promise<{ points: CandlePoint[] | TradePoint[]; error: string | null }> {
  const latest = await fetchNodePath(nodeBase, "transaction/latest");
  if (latest.code !== 0) {
    return {
      points: [],
      error:
        "Chart history unavailable and recent trades could not be loaded.",
    };
  }
  const trades = parseMatchTradesFromLatest(latest.data, hash);
  if (!trades.length) {
    return {
      points: [],
      error: "No DEX trades found for this asset in recent blocks.",
    };
  }
  if (mode === "candles") {
    return {
      points: aggregateTradesToCandles(trades, interval, n),
      error: null,
    };
  }
  return { points: trades.slice(-n), error: null };
}

/**
 * Load price history for an asset (candles preferred, with wartbunker-style fallbacks).
 */
export async function loadAssetPriceChart(
  nodeBase: string,
  assetHash: string,
  {
    mode = "candles",
    interval = "1h",
    n = 80,
  }: {
    mode?: ChartMode;
    interval?: ChartInterval;
    n?: number;
  } = {},
): Promise<ChartLoadResult> {
  const hash = normalizeAssetHash(assetHash);
  if (!isValidAssetHash(hash)) {
    return {
      points: [],
      error: "Invalid asset hash",
      interval,
      mode,
      usedFallback: false,
      poolSpotOnly: false,
      poolSpot: null,
      note: null,
    };
  }
  const base = normalizeNodeUrl(nodeBase);
  if (!base) {
    return {
      points: [],
      error: "Invalid node URL",
      interval,
      mode,
      usedFallback: false,
      poolSpotOnly: false,
      poolSpot: null,
      note: null,
    };
  }

  const path =
    mode === "candles"
      ? `chart/candles/${hash}/${interval}?n=${n}`
      : `chart/trades/${hash}?n=${n}`;

  let chartRes: NodeJson;
  try {
    chartRes = await fetchNodePath(base, path);
  } catch (e) {
    chartRes = {
      code: CHART_API_UNSUPPORTED_CODE,
      error: e instanceof Error ? e.message : "Chart request failed",
    };
  }

  if (chartRes.code === 0) {
    const points =
      mode === "candles"
        ? parseCandleResponse(chartRes.data)
        : parseTradeResponse(chartRes.data);
    if (points.length) {
      const { poolSpot } = await loadMarketSnapshot(base, hash);
      return {
        points,
        error: null,
        interval: mode === "trades" ? "trades" : interval,
        mode,
        usedFallback: false,
        poolSpotOnly: false,
        poolSpot,
        note: null,
      };
    }
  } else if (
    chartRes.code != null &&
    chartRes.code !== 0 &&
    !shouldUseChartFallback(chartRes.code) &&
    chartRes.code !== -1
  ) {
    return {
      points: [],
      error: chartRes.error || `Node error (code ${chartRes.code})`,
      interval,
      mode,
      usedFallback: false,
      poolSpotOnly: false,
      poolSpot: null,
      note: null,
    };
  }

  // Fallback path (unsupported chart API, empty index, or HTTP soft-fail).
  const { hasLiquidity, poolSpot } = await loadMarketSnapshot(base, hash);
  const fallback = await loadFromLatest(base, hash, mode, interval, n);
  if (fallback.points.length) {
    return {
      points: fallback.points,
      error: null,
      interval: mode === "trades" ? "trades" : interval,
      mode,
      usedFallback: true,
      poolSpotOnly: false,
      poolSpot,
      note: "Chart index unavailable — built from recent DEX match trades.",
    };
  }

  if (hasLiquidity && poolSpot != null) {
    const point = buildPoolSpotChartPoint(poolSpot);
    return {
      points: point ? [point] : [],
      error: null,
      interval: "pool",
      mode: "candles",
      usedFallback: true,
      poolSpotOnly: true,
      poolSpot,
      note: "No trade history yet — showing current pool spot from DEX reserves.",
    };
  }

  return {
    points: [],
    error:
      fallback.error ||
      chartRes.error ||
      "No chart data for this asset yet",
    interval,
    mode,
    usedFallback: true,
    poolSpotOnly: false,
    poolSpot,
    note: null,
  };
}

/** @deprecated Prefer loadAssetPriceChart — kept for older call sites. */
export async function loadAssetCandles(
  nodeBase: string,
  assetHash: string,
  interval: ChartInterval = "1h",
  n = 80,
): Promise<{
  points: CandlePoint[];
  error: string | null;
  interval: ChartInterval;
}> {
  const result = await loadAssetPriceChart(nodeBase, assetHash, {
    mode: "candles",
    interval,
    n,
  });
  const points =
    result.mode === "candles"
      ? (result.points as CandlePoint[])
      : aggregateTradesToCandles(
          result.points as TradePoint[],
          interval,
          n,
        );
  return {
    points,
    error: result.error,
    interval:
      result.interval === "trades" || result.interval === "pool"
        ? interval
        : result.interval,
  };
}
