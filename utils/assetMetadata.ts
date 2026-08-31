import { useEffect, useState } from 'react';

/** Off-chain catalog (same VPS as WartBunker). */
export const METADATA_BASE = 'https://warthog-defitestnet.duckdns.org:4445';

export type AssetMetadata = {
  hash: string;
  name: string;
  ticker: string;
  description: string;
  website: string;
  telegram: string;
  discord: string;
  twitter: string;
  logoUrl: string;
  logoCandidates: string[];
};

const memory = new Map<string, AssetMetadata | Promise<AssetMetadata | null> | null>();
let catalogPromise: Promise<AssetMetadata[]> | null = null;

export function normalizeAssetMetaHash(hash: string | null | undefined): string {
  const clean = String(hash || '')
    .trim()
    .toLowerCase()
    .replace(/^0x/i, '');
  return /^[0-9a-f]{64}$/.test(clean) ? clean : '';
}

export function assetLogoCandidates(hash: string): string[] {
  const h = normalizeAssetMetaHash(hash);
  if (!h) return [];
  return [
    `${METADATA_BASE}/assets/${h}/logo.png`,
    `${METADATA_BASE}/assets/${h}/image.png`,
  ];
}

function infoUrl(hash: string): string {
  return `${METADATA_BASE}/assets/${hash}/info.json`;
}

async function fetchJson(url: string): Promise<unknown | null> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return null;
  const type = res.headers.get('content-type') || '';
  if (type.includes('text/html')) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function normalizeInfo(raw: unknown, hash: string): AssetMetadata | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const h = normalizeAssetMetaHash(String(row.hash || '')) || hash;
  const name = String(row.name || '').trim();
  const ticker = String(row.ticker || '').trim();
  if (!h || (!name && !ticker)) return null;
  return {
    hash: h,
    name: name || ticker,
    ticker: ticker || name,
    description: String(row.description || '').trim(),
    website: String(row.website || '').trim(),
    telegram: String(row.telegram || '').trim(),
    discord: String(row.discord || '').trim(),
    twitter: String(row.twitter || '').trim(),
    logoUrl: assetLogoCandidates(h)[0] || '',
    logoCandidates: assetLogoCandidates(h),
  };
}

export async function fetchAssetMetadata(
  hash: string,
): Promise<AssetMetadata | null> {
  const h = normalizeAssetMetaHash(hash);
  if (!h) return null;
  if (memory.has(h)) {
    const cached = memory.get(h);
    return cached && typeof (cached as Promise<unknown>).then === 'function'
      ? (cached as Promise<AssetMetadata | null>)
      : (cached as AssetMetadata | null);
  }

  const pending = (async () => {
    const raw = await fetchJson(infoUrl(h)).catch(() => null);
    return normalizeInfo(raw, h);
  })();

  memory.set(h, pending);
  const resolved = await pending;
  memory.set(h, resolved);
  return resolved;
}

export function peekAssetMetadata(hash: string): AssetMetadata | null {
  const h = normalizeAssetMetaHash(hash);
  if (!h || !memory.has(h)) return null;
  const v = memory.get(h);
  return v && typeof (v as Promise<unknown>).then === 'function'
    ? null
    : (v as AssetMetadata | null);
}

export async function loadAssetCatalog(): Promise<AssetMetadata[]> {
  if (!catalogPromise) {
    catalogPromise = (async () => {
      const listed = await fetchJson(`${METADATA_BASE}/assets.json`);
      const byHash = new Map<string, AssetMetadata>();
      if (Array.isArray(listed)) {
        for (const row of listed) {
          const info = normalizeInfo(
            row,
            normalizeAssetMetaHash((row as { hash?: string })?.hash),
          );
          if (info) byHash.set(info.hash, info);
        }
      }
      return [...byHash.values()];
    })().catch(() => {
      catalogPromise = null;
      return [];
    });
  }
  return catalogPromise;
}

export function assetDisplayName(
  onChainName: string | undefined,
  meta: AssetMetadata | null | undefined,
): string {
  return meta?.name || onChainName || 'Asset';
}

export function assetDisplayTicker(
  onChainName: string | undefined,
  meta: AssetMetadata | null | undefined,
): string {
  return meta?.ticker || onChainName || '';
}

export function useAssetMetadata(hash: string | undefined): AssetMetadata | null {
  const normalized = normalizeAssetMetaHash(hash);
  const [meta, setMeta] = useState<AssetMetadata | null>(() =>
    peekAssetMetadata(normalized),
  );

  useEffect(() => {
    let live = true;
    if (!normalized) {
      setMeta(null);
      return undefined;
    }
    const cached = peekAssetMetadata(normalized);
    if (cached) setMeta(cached);
    fetchAssetMetadata(normalized).then((next) => {
      if (live) setMeta(next);
    });
    return () => {
      live = false;
    };
  }, [normalized]);

  return meta;
}
