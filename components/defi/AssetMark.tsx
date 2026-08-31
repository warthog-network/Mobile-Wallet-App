import React, { useEffect, useMemo, useState } from 'react';
import { Image, Text, View } from 'react-native';
import {
  assetDisplayName,
  assetDisplayTicker,
  assetLogoCandidates,
  useAssetMetadata,
} from '../../utils/assetMetadata';
import { defiStyles } from './defiStyles';

export default function AssetMark({
  hash,
  name,
  size = 'md',
}: {
  hash: string;
  name?: string;
  size?: 'xs' | 'md';
}) {
  const meta = useAssetMetadata(hash);
  const urls = useMemo(() => {
    const list = [
      ...(meta?.logoUrl ? [meta.logoUrl] : []),
      ...(meta?.logoCandidates || assetLogoCandidates(hash)),
    ];
    return [...new Set(list)];
  }, [hash, meta]);
  const [idx, setIdx] = useState(0);
  const src = urls[idx];
  const letter = (
    assetDisplayTicker(name, meta) ||
    assetDisplayName(name, meta) ||
    '?'
  )
    .charAt(0)
    .toUpperCase();

  useEffect(() => {
    setIdx(0);
  }, [hash]);

  return (
    <View
      style={[
        defiStyles.assetAvatar,
        defiStyles.assetAvatarBlue,
        size === 'xs' && defiStyles.assetAvatarXs,
      ]}
    >
      {src ? (
        <Image
          source={{ uri: src }}
          style={defiStyles.assetAvatarImage}
          onError={() => setIdx((i) => i + 1)}
        />
      ) : (
        <Text
          style={[
            defiStyles.assetAvatarText,
            size === 'xs' && { fontSize: 11 },
          ]}
        >
          {letter || '?'}
        </Text>
      )}
    </View>
  );
}

export function AssetTitle({
  hash,
  name,
  style,
}: {
  hash: string;
  name?: string;
  style?: object;
}) {
  const meta = useAssetMetadata(hash);
  const display = assetDisplayName(name, meta);
  const ticker = assetDisplayTicker(name, meta);
  const showTicker = ticker && ticker.toLowerCase() !== display.toLowerCase();
  return (
    <Text style={style}>
      {display}
      {showTicker ? ` · ${ticker}` : ''}
    </Text>
  );
}
