import { useState, useEffect, useCallback, useMemo } from 'react';
import { storage } from '../utils/storage';
import { fetchAssetBalanceForAddress, fetchOpenOrders, fetchLiquidityPositions } from '../utils/defiApi';
import { isValidAssetHash, normalizeAssetHash } from '../utils/warthogFormat';
import type { AssetBalance, AssetPrefill, DexPoolPrefill, LiquidityPosition, OpenOrdersByAsset, WatchedAsset, WalletData } from '../types';

const watchedAssetsKey = (address: string) => `warthogWatchedAssets_${address.toLowerCase()}`;

export function useDefiWallet(
  wallet: WalletData | null,
  selectedNode: string,
  isDefi: boolean,
  onNonceBump?: (nonce: number) => Promise<void>
) {
  const [watchedAssets, setWatchedAssets] = useState<WatchedAsset[]>([]);
  const [assetBalances, setAssetBalances] = useState<AssetBalance[]>([]);
  const [openOrders, setOpenOrders] = useState<OpenOrdersByAsset[] | null>(null);
  const [liquidityPositions, setLiquidityPositions] = useState<LiquidityPosition[] | null>(null);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [loadingLiquidity, setLoadingLiquidity] = useState(false);
  const [sendAssetPrefill, setSendAssetPrefill] = useState<AssetPrefill | null>(null);
  const [dexPoolPrefill, setDexPoolPrefill] = useState<DexPoolPrefill | null>(null);

  const loadWatchedAssets = useCallback(async (address: string): Promise<WatchedAsset[]> => {
    try {
      const saved = await storage.getItemAsync(watchedAssetsKey(address));
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore parse errors
    }
    return [];
  }, []);

  const saveWatchedAssets = useCallback(async (address: string, assets: WatchedAsset[]) => {
    await storage.setItemAsync(watchedAssetsKey(address), JSON.stringify(assets));
  }, []);

  const fetchAssetBalance = useCallback(async (assetHash: string, assetName = '') => {
    if (!wallet?.address || !selectedNode) return;
    const hash = normalizeAssetHash(assetHash);
    const balance = await fetchAssetBalanceForAddress(selectedNode, wallet.address, hash, assetName);
    setAssetBalances((prev) => {
      const index = prev.findIndex((a) => a.hash.toLowerCase() === hash);
      if (index !== -1) {
        const updated = [...prev];
        updated[index] = balance;
        return updated;
      }
      return [...prev, balance];
    });
    return balance;
  }, [wallet?.address, selectedNode]);

  const addWatchedAsset = useCallback(async (assetHash: string, customName = '') => {
    if (!wallet?.address) return;
    const hash = normalizeAssetHash(assetHash);
    if (!isValidAssetHash(hash)) throw new Error('Invalid asset hash');

    setWatchedAssets((prev) => {
      const exists = prev.findIndex((a) => a.hash.toLowerCase() === hash);
      let next: WatchedAsset[];
      if (exists !== -1) {
        next = [...prev];
        if (customName) next[exists] = { ...next[exists], customName };
      } else {
        next = [...prev, { hash, customName: customName || undefined }];
      }
      saveWatchedAssets(wallet.address, next);
      return next;
    });

    await fetchAssetBalance(hash, customName);
  }, [wallet?.address, fetchAssetBalance, saveWatchedAssets]);

  const removeWatchedAsset = useCallback(async (assetHash: string) => {
    if (!wallet?.address) return;
    const hash = normalizeAssetHash(assetHash);
    setWatchedAssets((prev) => {
      const next = prev.filter((a) => a.hash.toLowerCase() !== hash);
      saveWatchedAssets(wallet.address, next);
      return next;
    });
    setAssetBalances((prev) => prev.filter((a) => a.hash.toLowerCase() !== hash));
  }, [wallet?.address, saveWatchedAssets]);

  const reorderWatchedAssets = useCallback((fromIndex: number, toIndex: number) => {
    if (!wallet?.address || fromIndex === toIndex) return;
    if (fromIndex < 0 || toIndex < 0) return;

    setWatchedAssets((prevWatched) => {
      if (fromIndex >= prevWatched.length || toIndex >= prevWatched.length) return prevWatched;

      const nextWatched = [...prevWatched];
      const [moved] = nextWatched.splice(fromIndex, 1);
      nextWatched.splice(toIndex, 0, moved);
      saveWatchedAssets(wallet.address, nextWatched);

      setAssetBalances((prevBalances) => {
        const byHash = new Map(prevBalances.map((a) => [a.hash.toLowerCase(), a]));
        return nextWatched
          .map((w) => byHash.get(w.hash.toLowerCase()))
          .filter((a): a is AssetBalance => Boolean(a));
      });

      return nextWatched;
    });
  }, [wallet?.address, saveWatchedAssets]);

  const refreshAllAssets = useCallback(async () => {
    if (!wallet?.address || !isDefi || watchedAssets.length === 0) return;
    setLoadingAssets(true);
    try {
      await Promise.all(
        watchedAssets.map((asset, idx) =>
          new Promise<void>((resolve) => {
            setTimeout(async () => {
              try {
                await fetchAssetBalance(asset.hash, asset.customName || '');
              } catch {
                // skip failed asset
              }
              resolve();
            }, idx * 120);
          })
        )
      );
    } finally {
      setLoadingAssets(false);
    }
  }, [wallet?.address, isDefi, watchedAssets, fetchAssetBalance]);

  const refreshOpenOrders = useCallback(async () => {
    if (!wallet?.address || !isDefi) return null;
    setLoadingOrders(true);
    try {
      const orders = await fetchOpenOrders(selectedNode, wallet.address);
      setOpenOrders(orders);
      return orders;
    } catch (e) {
      console.error('Failed to refresh open orders:', e);
      return null;
    } finally {
      setLoadingOrders(false);
    }
  }, [wallet?.address, isDefi, selectedNode]);

  const refreshLiquidity = useCallback(async () => {
    if (!wallet?.address || !isDefi) return;
    setLoadingLiquidity(true);
    try {
      const hashes = [
        ...assetBalances.map((a) => a.hash),
        ...(openOrders || []).map((o) => o.baseAsset?.hash).filter(Boolean) as string[],
      ];
      const positions = await fetchLiquidityPositions(selectedNode, wallet.address, hashes, assetBalances);
      setLiquidityPositions(positions);
    } catch (e) {
      console.error('Failed to refresh liquidity positions:', e);
    } finally {
      setLoadingLiquidity(false);
    }
  }, [wallet?.address, isDefi, selectedNode, assetBalances, openOrders]);

  const refreshDefiData = useCallback(async () => {
    if (!isDefi) return;
    // Settle all branches even if one rejects so callers (e.g. hero refresh spinner) can finish.
    await Promise.allSettled([refreshAllAssets(), refreshOpenOrders(), refreshLiquidity()]);
  }, [isDefi, refreshAllAssets, refreshOpenOrders, refreshLiquidity]);

  const bumpNonceAfterTx = useCallback(async (usedNonce: number) => {
    if (onNonceBump) await onNonceBump(usedNonce + 1);
  }, [onNonceBump]);

  const orderedAssets = useMemo(() => {
    if (!watchedAssets.length) return assetBalances;
    const byHash = new Map(assetBalances.map((a) => [a.hash.toLowerCase(), a]));
    const ordered = watchedAssets
      .map((w) => byHash.get(w.hash.toLowerCase()))
      .filter((a): a is AssetBalance => Boolean(a));
    const watchedSet = new Set(watchedAssets.map((w) => w.hash.toLowerCase()));
    const extras = assetBalances.filter((a) => !watchedSet.has(a.hash.toLowerCase()));
    return [...ordered, ...extras];
  }, [watchedAssets, assetBalances]);

  useEffect(() => {
    if (!wallet?.address || !isDefi) {
      setWatchedAssets([]);
      setAssetBalances([]);
      setOpenOrders(null);
      setLiquidityPositions(null);
      return;
    }

    (async () => {
      const loaded = await loadWatchedAssets(wallet.address);
      setWatchedAssets(loaded);
      if (loaded.length > 0) {
        setTimeout(() => {
          loaded.forEach((asset, idx) => {
            setTimeout(() => {
              fetchAssetBalance(asset.hash, asset.customName || '').catch(() => {});
            }, idx * 180);
          });
        }, 200);
      }
    })();
  }, [wallet?.address, isDefi, selectedNode, loadWatchedAssets, fetchAssetBalance]);

  useEffect(() => {
    if (wallet?.address && isDefi) {
      refreshOpenOrders().catch(() => {});
    }
  }, [wallet?.address, isDefi, selectedNode]);

  useEffect(() => {
    if (wallet?.address && isDefi && (assetBalances.length > 0 || (openOrders && openOrders.length > 0))) {
      refreshLiquidity().catch(() => {});
    }
  }, [wallet?.address, isDefi, selectedNode, assetBalances.length, openOrders?.length]);

  return {
    watchedAssets,
    assetBalances,
    orderedAssets,
    openOrders,
    liquidityPositions,
    loadingAssets,
    loadingOrders,
    loadingLiquidity,
    sendAssetPrefill,
    setSendAssetPrefill,
    dexPoolPrefill,
    setDexPoolPrefill,
    fetchAssetBalance,
    addWatchedAsset,
    removeWatchedAsset,
    reorderWatchedAssets,
    refreshAllAssets,
    refreshOpenOrders,
    refreshLiquidity,
    refreshDefiData,
    bumpNonceAfterTx,
  };
}