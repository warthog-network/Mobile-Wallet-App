import React, { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import {
  CHART_INTERVALS,
  loadAssetPriceChart,
  type CandlePoint,
  type ChartInterval,
  type ChartMode,
  type TradePoint,
} from '../../utils/assetChart';
import AssetPriceChart from './AssetPriceChart';
import { defiStyles } from './defiStyles';

export default function AssetChartPanel({
  nodeUrl,
  hash,
  assetName,
}: {
  nodeUrl: string;
  hash: string;
  assetName: string;
}) {
  const [interval, setInterval] = useState<ChartInterval>('1h');
  const [mode, setMode] = useState<ChartMode>('candles');
  const [loading, setLoading] = useState(false);
  const [points, setPoints] = useState<CandlePoint[] | TradePoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [poolSpot, setPoolSpot] = useState<number | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    void loadAssetPriceChart(nodeUrl, hash, { mode, interval, n: 80 })
      .then((result) => {
        if (!live) return;
        setPoints(result.points);
        setError(result.points.length ? null : result.error);
        setNote(result.note);
        setPoolSpot(result.poolSpot);
      })
      .catch((e: unknown) => {
        if (!live) return;
        setError(e instanceof Error ? e.message : 'Failed to load chart');
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [nodeUrl, hash, interval, mode, tick]);

  const intervalLabel =
    mode === 'trades'
      ? 'Trades'
      : CHART_INTERVALS.find((i) => i.id === interval)?.label || interval;

  return (
    <View style={{ marginTop: 8 }}>
      <View style={[defiStyles.tabRow, { marginBottom: 6 }]}>
        {CHART_INTERVALS.map((iv) => (
          <TouchableOpacity
            key={iv.id}
            style={[
              defiStyles.tab,
              interval === iv.id && mode === 'candles' && defiStyles.tabActive,
            ]}
            onPress={() => {
              setMode('candles');
              setInterval(iv.id);
            }}
            disabled={loading}
          >
            <Text
              style={[
                defiStyles.tabText,
                interval === iv.id && mode === 'candles' && defiStyles.tabTextActive,
              ]}
            >
              {iv.label}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={[defiStyles.tab, mode === 'trades' && defiStyles.tabActive]}
          onPress={() => setMode('trades')}
          disabled={loading}
        >
          <Text style={[defiStyles.tabText, mode === 'trades' && defiStyles.tabTextActive]}>
            Trades
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={defiStyles.tab}
          onPress={() => setTick((n) => n + 1)}
          disabled={loading}
        >
          <Text style={defiStyles.tabText}>{loading ? '…' : '↻'}</Text>
        </TouchableOpacity>
      </View>
      <AssetPriceChart
        points={points}
        mode={mode}
        assetName={assetName}
        intervalLabel={intervalLabel}
        loading={loading}
        error={error}
        note={note}
        poolSpot={poolSpot}
      />
    </View>
  );
}
