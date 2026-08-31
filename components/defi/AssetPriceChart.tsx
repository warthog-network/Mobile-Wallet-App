import React, { useId, useMemo } from 'react';
import { Text, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Line,
  Path,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import {
  computeChartStats,
  toChartSeries,
  type CandlePoint,
  type ChartMode,
  type TradePoint,
} from '../../utils/assetChart';
import { defiColors, defiStyles } from './defiStyles';
import { theme } from '../../theme';

const W = 340;
const H = 140;
const PAD = { top: 10, right: 8, bottom: 22, left: 44 };

type Props = {
  points: CandlePoint[] | TradePoint[];
  mode?: ChartMode;
  assetName?: string;
  intervalLabel?: string;
  loading?: boolean;
  error?: string | null;
  poolSpot?: number | null;
  note?: string | null;
};

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1) return n.toPrecision(5);
  if (n >= 0.0001) return n.toFixed(6).replace(/\.?0+$/, '');
  return n.toExponential(3);
}

function buildPath(
  series: { x: number; y: number }[],
  xScale: (x: number) => number,
  yScale: (y: number) => number,
): string {
  if (!series.length) return '';
  if (series.length === 1) {
    const x = xScale(series[0].x);
    const y = yScale(series[0].y);
    return `M${x.toFixed(1)},${y.toFixed(1)} L${Math.min(x + 16, W - PAD.right).toFixed(1)},${y.toFixed(1)}`;
  }
  return series
    .map((pt, i) => {
      const cmd = i === 0 ? 'M' : 'L';
      return `${cmd}${xScale(pt.x).toFixed(1)},${yScale(pt.y).toFixed(1)}`;
    })
    .join(' ');
}

export default function AssetPriceChart({
  points,
  mode = 'candles',
  assetName = 'Asset',
  intervalLabel = '',
  loading = false,
  error = null,
  poolSpot = null,
  note = null,
}: Props) {
  const gradId = useId().replace(/:/g, '');
  const series = useMemo(() => toChartSeries(points, mode), [points, mode]);
  const stats = useMemo(() => computeChartStats(points, mode), [points, mode]);

  const plot = useMemo(() => {
    if (!series.length) return null;
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const xMin = series[0].x;
    const xMax = series[series.length - 1].x;
    const yMin = Math.min(...series.map((p) => p.y));
    const yMax = Math.max(...series.map((p) => p.y));
    const yPad = (yMax - yMin) * 0.08 || yMax * 0.05 || 0.0001;
    const yLo = Math.max(0, yMin - yPad);
    const yHi = yMax + yPad;
    const xScale = (x: number) =>
      xMax === xMin ? PAD.left + innerW / 2 : PAD.left + ((x - xMin) / (xMax - xMin)) * innerW;
    const yScale = (y: number) =>
      PAD.top + innerH - ((y - yLo) / (yHi - yLo || 1)) * innerH;
    const line = buildPath(series, xScale, yScale);
    const lastX = xScale(series[series.length - 1].x).toFixed(1);
    const firstX = xScale(series[0].x).toFixed(1);
    const baseY = yScale(yLo).toFixed(1);
    const area = `${line} L${lastX},${baseY} L${firstX},${baseY} Z`;
    const yTicks = [0, 0.5, 1].map((t) => {
      const val = yLo + (yHi - yLo) * (1 - t);
      return { val, y: yScale(val) };
    });
    return { line, area, yTicks, xScale, yScale };
  }, [series]);

  if (loading) {
    return <Text style={defiStyles.hintText}>Loading chart…</Text>;
  }
  if (error && !series.length) {
    return (
      <View>
        <Text style={[defiStyles.hintText, { textAlign: 'left' }]}>{error}</Text>
        {poolSpot != null ? (
          <Text style={defiStyles.cardSub}>Pool spot: {fmt(poolSpot)} WART</Text>
        ) : null}
      </View>
    );
  }
  if (!series.length || !plot || !stats) {
    return <Text style={defiStyles.hintText}>No chart data yet</Text>;
  }

  const up = stats.change >= 0;

  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <View>
          <Text style={defiStyles.cardSub}>
            {mode === 'candles' ? 'OHLC close' : 'Trade price'}
            {intervalLabel ? ` · ${intervalLabel}` : ''}
          </Text>
          <Text style={[defiStyles.cardTitle, { fontFamily: theme.typography.fontFamily.mono }]}>
            {fmt(stats.last)}{' '}
            <Text style={defiStyles.cardSub}>WART/{assetName}</Text>
          </Text>
        </View>
        <Text style={{ color: up ? defiColors.buy : defiColors.sell, fontSize: 12, fontWeight: '700' }}>
          {up ? '+' : ''}
          {stats.change.toFixed(2)}%
        </Text>
      </View>
      {poolSpot != null || note ? (
        <Text style={[defiStyles.cardSub, { marginBottom: 4 }]}>
          {poolSpot != null ? `Pool spot ${fmt(poolSpot)}` : ''}
          {note ? `  ${note}` : ''}
        </Text>
      ) : null}
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        <Defs>
          <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#FDB913" stopOpacity={0.35} />
            <Stop offset="100%" stopColor="#FDB913" stopOpacity={0.02} />
          </LinearGradient>
        </Defs>
        {plot.yTicks.map((t, i) => (
          <React.Fragment key={i}>
            <Line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={t.y}
              y2={t.y}
              stroke="rgba(63,63,70,0.8)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <SvgText
              x={PAD.left - 4}
              y={t.y + 3}
              fill="#71717a"
              fontSize="8"
              textAnchor="end"
            >
              {fmt(t.val)}
            </SvgText>
          </React.Fragment>
        ))}
        <Path d={plot.area} fill={`url(#${gradId})`} />
        <Path
          d={plot.line}
          fill="none"
          stroke="#FDB913"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {series.length <= 24
          ? series.map((pt, idx) => (
              <Circle
                key={idx}
                cx={plot.xScale(pt.x)}
                cy={plot.yScale(pt.y)}
                r={2.2}
                fill="#E79300"
                stroke="#18181b"
                strokeWidth={1}
              />
            ))
          : null}
      </Svg>
    </View>
  );
}
