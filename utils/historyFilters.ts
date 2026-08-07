/**
 * History type/direction filters — same mapping as wartbunker + extension.
 * Used client-side on node history; ready for indexer group= filters later.
 */

export type HistoryFilterId =
  | 'all'
  | 'rewards'
  | 'transfers'
  | 'limit_swaps'
  | 'matches'
  | 'cancels'
  | 'asset_creations'
  | 'liquidity'
  | 'in'
  | 'out';

export type HistoryFilterOption = { id: HistoryFilterId; label: string };

export const MAINNET_HISTORY_FILTERS: HistoryFilterOption[] = [
  { id: 'all', label: 'All' },
  { id: 'rewards', label: 'Rewards' },
  { id: 'transfers', label: 'Transfers' },
  { id: 'in', label: 'In' },
  { id: 'out', label: 'Out' },
];

export const DEFI_HISTORY_FILTERS: HistoryFilterOption[] = [
  { id: 'all', label: 'All' },
  { id: 'rewards', label: 'Rewards' },
  { id: 'transfers', label: 'Transfers' },
  { id: 'limit_swaps', label: 'Limit Swaps' },
  { id: 'matches', label: 'Matches' },
  { id: 'cancels', label: 'Cancels' },
  { id: 'asset_creations', label: 'Asset Creation' },
  { id: 'liquidity', label: 'Liquidity' },
  { id: 'in', label: 'In' },
  { id: 'out', label: 'Out' },
];

/** Normalize type strings from historyParser (and any residual category spill). */
export function txTypeKey(tx: {
  type?: string;
  category?: string;
  isReward?: boolean;
}): string {
  const raw = String(tx?.type || tx?.category || '')
    .toLowerCase()
    .replace(/-/g, '_');
  if (!raw) return '';
  if (tx?.isReward || raw === 'reward' || raw.includes('reward')) return 'reward';
  if (
    raw === 'wart_transfer' ||
    raw === 'warttransfer' ||
    raw === 'transfers' ||
    raw === 'transfer'
  ) {
    return 'wart_transfer';
  }
  if (raw === 'token_transfer' || raw === 'tokentransfer') return 'token_transfer';
  if (raw === 'limit_swap' || raw === 'limitswap') return 'limit_swap';
  if (raw === 'match') return 'match';
  if (raw === 'cancelation' || raw === 'cancellation' || raw.includes('cancel')) {
    return 'cancelation';
  }
  if (raw === 'asset_creation' || raw === 'assetcreation') return 'asset_creation';
  if (raw === 'liquidity_deposit' || raw === 'liquiditydeposit') {
    return 'liquidity_deposit';
  }
  if (
    raw === 'liquidity_withdrawal' ||
    raw === 'liquiditywithdrawal' ||
    raw.includes('liquiditywithdraw')
  ) {
    return 'liquidity_withdrawal';
  }
  return raw;
}

export type FilterableHistoryTx = {
  type?: string;
  category?: string;
  isReward?: boolean;
  isIncoming?: boolean;
  direction?: string;
  fromAddress?: string | null;
  toAddress?: string | null;
};

/**
 * Client-side match — same rules as wartbunker TransactionHistory.
 * @param account viewing address (for out/from heuristics)
 */
export function matchesHistoryFilter(
  tx: FilterableHistoryTx,
  filter: string,
  account?: string | null,
): boolean {
  if (!filter || filter === 'all') return true;

  const type = txTypeKey(tx);
  const isReward = type === 'reward' || Boolean(tx?.isReward);
  const dir = String(tx?.direction || '').toLowerCase();
  const viewer = String(account || '')
    .replace(/^0x/i, '')
    .toLowerCase();
  const from = String(tx?.fromAddress || '')
    .replace(/^0x/i, '')
    .toLowerCase();

  if (filter === 'rewards') return isReward;
  if (filter === 'transfers') {
    return type === 'wart_transfer' || type === 'token_transfer' || type === 'transfer';
  }
  if (filter === 'limit_swaps') return type === 'limit_swap';
  if (filter === 'matches') return type === 'match';
  if (filter === 'cancels') return type === 'cancelation' || type.includes('cancel');
  if (filter === 'asset_creations') return type === 'asset_creation';
  if (filter === 'liquidity') {
    return type === 'liquidity_deposit' || type === 'liquidity_withdrawal';
  }

  if (filter === 'in') {
    if (dir === 'in') return true;
    if (dir === 'out' || dir === 'self') return false;
    return isReward || tx?.isIncoming === true || type === 'liquidity_withdrawal';
  }

  if (filter === 'out') {
    if (dir === 'out') return true;
    if (dir === 'in' || dir === 'self') return false;
    if (isReward) return false;
    if (tx?.isIncoming === true) return false;
    if (type === 'match') return false;
    if (viewer && from && (from === viewer || from.startsWith(viewer.slice(0, 40)))) {
      return true;
    }
    // Non-incoming activity without a clear from still treated as out when not reward
    return Boolean(from);
  }

  return true;
}

export function filterEmptyMessage(filter: string): string {
  switch (filter) {
    case 'rewards':
      return 'No rewards found for this address.';
    case 'transfers':
      return 'No WART or token transfers found for this address.';
    case 'limit_swaps':
      return 'No limit swaps found for this address.';
    case 'matches':
      return 'No DEX matches found for this address.';
    case 'cancels':
      return 'No cancelations found for this address.';
    case 'asset_creations':
      return 'No asset creations found for this address.';
    case 'liquidity':
      return 'No liquidity deposits or withdrawals found for this address.';
    case 'in':
      return 'No incoming transactions found for this address.';
    case 'out':
      return 'No outgoing transactions found for this address.';
    default:
      return 'No transactions yet';
  }
}

/** Indexer group/direction query if mobile later wires server filters. */
export function historyFilterToIndexerQuery(
  historyFilter: string,
): { group?: string; direction?: string } {
  const id = String(historyFilter || 'all')
    .toLowerCase()
    .replace(/-/g, '_');
  switch (id) {
    case 'all':
      return {};
    case 'rewards':
    case 'reward':
      return { group: 'reward' };
    case 'transfers':
    case 'transfer':
      return { group: 'transfer' };
    case 'limit_swaps':
    case 'limit_swap':
    case 'limitswap':
      return { group: 'limit_swap' };
    case 'matches':
    case 'match':
      return { group: 'match' };
    case 'cancels':
    case 'cancel':
    case 'cancelation':
    case 'cancellation':
      return { group: 'cancelation' };
    case 'asset_creations':
    case 'asset_creation':
    case 'assetcreation':
      return { group: 'asset_creation' };
    case 'liquidity':
      return { group: 'liquidity' };
    case 'in':
      return { direction: 'in' };
    case 'out':
      return { direction: 'out' };
    case 'self':
      return { direction: 'self' };
    default:
      return {};
  }
}
