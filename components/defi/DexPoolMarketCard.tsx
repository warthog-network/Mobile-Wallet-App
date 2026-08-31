import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { toast } from '../../utils/toast';
import * as Clipboard from 'expo-clipboard';
import FormattedNumber from '../FormattedNumber';
import { useNumberDisplay } from '../../contexts/NumberDisplayContext';
import { computePoolSpotPrice } from '../../utils/defiApi';
import { defiColors, defiStyles } from './defiStyles';
import { theme } from '../../theme';

const withBorderAlpha = (hex: string, alpha = 0.6): string => {
  const a = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0');
  return hex.length === 7 ? `${hex}${a}` : hex;
};

const safeReserve = (v: unknown, fallback = '0'): string => {
  if (v == null) return fallback;
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (typeof v === 'object') {
    const obj = v as { str?: string; E8?: string | number; u64?: string | number };
    if (obj.str != null) return String(obj.str);
    if (obj.E8 !== undefined) return (Number(obj.E8) / 1e8).toFixed(8);
    if (obj.u64 !== undefined) return String(obj.u64);
  }
  return fallback;
};

interface Props {
  marketData: Record<string, unknown> | null;
  assetName?: string;
  assetHash?: string;
}

const DexPoolMarketCard: React.FC<Props> = ({ marketData, assetName: assetNameProp, assetHash: assetHashProp }) => {
  const { limitOrderBuyStyles, limitOrderSellStyles, liquidityPoolStyles } = useNumberDisplay();

  if (!marketData) return null;

  const asset = (marketData.asset || marketData.baseAsset || (marketData as { market?: { asset?: unknown } }).market?.asset || {}) as {
    name?: string;
    hash?: string;
    decimals?: number;
    id?: string | number;
  };
  const liquidity = (marketData.liquidityPool || marketData.liquidity || marketData.reserves || marketData.poolReserves || marketData.pool || {}) as Record<string, unknown>;

  const assetName = assetNameProp || asset.name || 'Pool';
  const assetHash = assetHashProp || asset.hash || '';
  const wartReserve = liquidity.wart || liquidity.WART || '0';
  const assetReserve = liquidity.asset || liquidity[assetName] || liquidity.assetE8 || '0';
  const spotPrice = computePoolSpotPrice(marketData as Parameters<typeof computePoolSpotPrice>[0]);
  const priceRaw = marketData.price || marketData.spotPrice || marketData.doubleAdjustedPrice || marketData.marketPrice;
  const priceDisplayValue =
    spotPrice ??
    (priceRaw != null
      ? typeof priceRaw === 'object' && (priceRaw as { doubleAdjusted?: number }).doubleAdjusted != null
        ? (priceRaw as { doubleAdjusted: number }).doubleAdjusted
        : priceRaw
      : null);

  const buyCount = Array.isArray(marketData.wartToAssetSwaps) ? marketData.wartToAssetSwaps.length : 0;
  const sellCount = Array.isArray(marketData.assetToWartSwaps) ? marketData.assetToWartSwaps.length : 0;

  const copyHash = async (hash: string) => {
    await Clipboard.setStringAsync(hash);
    toast.success('Copied', 'Asset hash copied to clipboard');
  };

  const panelBorder = withBorderAlpha(liquidityPoolStyles.border, 0.6);

  return (
    <View style={[defiStyles.poolCard, { borderColor: panelBorder }]}>
      <View style={defiStyles.poolCardHeader}>
        <View style={defiStyles.poolCardHeaderLeft}>
          <View style={[defiStyles.poolAvatar, { backgroundColor: liquidityPoolStyles.bgSolid }]}>
            <Text style={defiStyles.poolAvatarText}>{assetName[0] || 'P'}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={defiStyles.poolPairTitle}>
              {assetName}{' '}
              <Text style={{ color: liquidityPoolStyles.textFaint }}>/ WART</Text>
            </Text>
            <Text style={defiStyles.poolPairMeta}>
              POOL • {asset.decimals ?? 8} decimals • Asset ID {asset.id ?? '—'}
            </Text>
          </View>
        </View>
        {assetHash ? (
          <TouchableOpacity style={defiStyles.poolHashBtn} onPress={() => copyHash(assetHash)}>
            <Text style={[defiStyles.poolHashText, { color: liquidityPoolStyles.textMuted }]}>
              {assetHash.slice(0, 10)}…{assetHash.slice(-8)}
            </Text>
            <Text style={[defiStyles.poolHashHint, { color: liquidityPoolStyles.textFaint }]}>Copy Asset Hash</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={defiStyles.poolCardBody}>
        <View style={defiStyles.statGrid}>
          <View style={defiStyles.poolReserveBox}>
            <View style={defiStyles.poolReserveLabel}>
              <View style={[defiStyles.poolReserveDot, { backgroundColor: liquidityPoolStyles.bgSolid }]} />
              <Text style={[defiStyles.poolReserveLabelText, { color: liquidityPoolStyles.text }]}>WART RESERVE</Text>
            </View>
            <FormattedNumber value={safeReserve(wartReserve)} variant="balance" style={defiStyles.poolReserveValue} />
            <Text style={defiStyles.poolReserveUnit}>WART</Text>
          </View>

          <View style={defiStyles.poolReserveBox}>
            <View style={defiStyles.poolReserveLabel}>
              <View style={[defiStyles.poolReserveDot, { backgroundColor: liquidityPoolStyles.bgSolid }]} />
              <Text style={[defiStyles.poolReserveLabelText, { color: liquidityPoolStyles.text }]}>
                {(assetName || 'ASSET').toUpperCase()} RESERVE
              </Text>
            </View>
            <FormattedNumber value={safeReserve(assetReserve)} variant="balance" style={defiStyles.poolReserveValue} />
            <Text style={defiStyles.poolReserveUnit}>{assetName || 'Asset'}</Text>
          </View>

          <View style={defiStyles.poolReserveBox}>
            <View style={defiStyles.poolReserveLabel}>
              <View style={[defiStyles.poolReserveDot, { backgroundColor: defiColors.purple }]} />
              <Text style={[defiStyles.poolReserveLabelText, { color: defiColors.purple }]}>SPOT PRICE</Text>
            </View>
            <FormattedNumber
              value={priceDisplayValue}
              overrides={{ maxDecimals: 8 }}
              style={defiStyles.poolReserveValue}
            />
            <Text style={defiStyles.poolReserveUnit}>WART per {assetName || 'asset'}</Text>
          </View>
        </View>

        <View style={defiStyles.poolMetaRow}>
          {liquidity.shares ? (
            <Text style={defiStyles.poolMetaItem}>
              <Text style={{ color: liquidityPoolStyles.text }}>Shares: </Text>
              <FormattedNumber value={safeReserve(liquidity.shares)} variant="balance" />
            </Text>
          ) : null}
          <Text style={defiStyles.poolMetaItem}>
            <Text style={{ color: limitOrderBuyStyles.text }}>Buy orders: </Text>
            <Text style={defiStyles.poolMetaCount}>{buyCount}</Text>
          </Text>
          <Text style={defiStyles.poolMetaItem}>
            <Text style={{ color: limitOrderSellStyles.text }}>Sell orders: </Text>
            <Text style={defiStyles.poolMetaCount}>{sellCount}</Text>
          </Text>
        </View>
      </View>
    </View>
  );
};

export default DexPoolMarketCard;