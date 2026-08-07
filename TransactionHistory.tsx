// TransactionHistory.tsx — FULLY UPDATED (Feb 2026)
// FIXED: Correct /transaction/lookup endpoint + block fallback
// Dates now always show for confirmed transactions
// Newest transactions first + robust timestamp handling
// ENHANCED: Contact names instead of raw addresses
// FIXED: Infinite refresh loop (onRefresh in fetch deps + callback)

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useAddressBook } from './components/AddressBook/AddressBookModal';
import { fetchAccountHistory, type NormalizedHistoryTx } from './utils/historyParser';
import {
  DEFI_HISTORY_FILTERS,
  MAINNET_HISTORY_FILTERS,
  filterEmptyMessage,
  matchesHistoryFilter,
  type HistoryFilterId,
} from './utils/historyFilters';
import { isDefiNode } from './utils/nodes';
import { defiColors } from './components/defi/defiStyles';
import { theme } from './theme';

interface Props {
  address: string;
  node: string;
  onRefresh?: () => void | Promise<void>;
  onAddContact?: (address: string) => void;
}

const TransactionHistory: React.FC<Props> = ({
  address,
  node,
  onRefresh,
  onAddContact,
}) => {
  const [history, setHistory] = useState<NormalizedHistoryTx[]>([]);
  const [loading, setLoading] = useState(false);
  const [visibleCount, setVisibleCount] = useState(7);
  const [showTransactions, setShowTransactions] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilterId>('all');
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const isDefi = isDefiNode(node);
  const filters = isDefi ? DEFI_HISTORY_FILTERS : MAINNET_HISTORY_FILTERS;

  const { addContact, getContactByAddress } = useAddressBook();

  const [blockCounts, setBlockCounts] = useState({
    '24h': 0,
    week: 0,
    month: 0,
    rewards24h: [] as string[],
    rewardsWeek: [] as string[],
    rewardsMonth: [] as string[],
  });

  const abbreviate = (str: string) =>
    str ? `${str.slice(0, 6)}...${str.slice(-4)}` : 'N/A';

  const getAddressDisplay = (
    addr: string | null | undefined,
    isFromAddress = false
  ): { display: string; isContact: boolean; fullAddress: string } => {
    if (!addr) {
      return {
        display: isFromAddress ? 'Block Reward' : 'N/A',
        isContact: false,
        fullAddress: '',
      };
    }

    const contact = getContactByAddress(addr);
    if (contact) {
      return { display: contact.name, isContact: true, fullAddress: addr };
    }

    return { display: abbreviate(addr), isContact: false, fullAddress: addr };
  };

  const handleSaveAsContact = async (addr: string) => {
    if (onAddContact) {
      onAddContact(addr);
      return;
    }

    Alert.alert(
      'Save Contact',
      `Would you like to save "${addr.slice(0, 10)}..." as a contact?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: async () => {
            try {
              const defaultName = `Contact ${Date.now().toString().slice(-4)}`;
              await addContact({
                name: defaultName,
                address: addr,
                notes: 'Added from transaction history',
                isFavorite: false,
              });
              Alert.alert('Success', `Contact "${defaultName}" saved!`);
            } catch {
              Alert.alert('Error', 'Failed to save contact. It may already exist.');
            }
          },
        },
      ]
    );
  };

  const applyHistoryResult = useCallback((items: NormalizedHistoryTx[]) => {
    setHistory(items);
    setVisibleCount(7);
    setError(null);

    const now = Date.now() / 1000;
    // Reward chips always use full unfiltered history (same as wartbunker)
    const rewards = items.filter((tx) => tx.isReward);

    setBlockCounts({
      '24h': rewards.filter((tx) => (tx.timestamp || 0) >= now - 86400).length,
      week: rewards.filter((tx) => (tx.timestamp || 0) >= now - 604800).length,
      month: rewards.filter((tx) => (tx.timestamp || 0) >= now - 2592000).length,
      rewards24h: rewards
        .filter((tx) => (tx.timestamp || 0) >= now - 86400)
        .map((tx) => tx.txid),
      rewardsWeek: rewards
        .filter((tx) => (tx.timestamp || 0) >= now - 604800)
        .map((tx) => tx.txid),
      rewardsMonth: rewards
        .filter((tx) => (tx.timestamp || 0) >= now - 2592000)
        .map((tx) => tx.txid),
    });
  }, []);

  const filteredHistory = useMemo(() => {
    if (historyFilter === 'all') return history;
    return history.filter((tx) => matchesHistoryFilter(tx, historyFilter, address));
  }, [history, historyFilter, address]);

  const fetchHistory = useCallback(async (options?: { syncWallet?: boolean }) => {
    if (!address) return;

    const id = ++requestId.current;
    setLoading(true);
    setError(null);

    try {
      const result = await fetchAccountHistory(node, address);
      if (id !== requestId.current) return;

      applyHistoryResult(result.items);

      if (options?.syncWallet && onRefresh) {
        await onRefresh();
      }
    } catch (err: any) {
      if (id !== requestId.current) return;
      const message = err.message || 'Node returned error – try backup node';
      setError(message);
      console.error('History fetch error:', err);
    } finally {
      if (id === requestId.current) {
        setLoading(false);
      }
    }
  }, [address, node, applyHistoryResult, onRefresh]);

  useEffect(() => {
    // Drop DeFi-only filters when switching to mainnet
    setHistoryFilter('all');
    if (address) fetchHistory();
  }, [address, node]); // eslint-disable-line react-hooks/exhaustive-deps -- fetch on address/node only

  useEffect(() => {
    setVisibleCount(7);
  }, [historyFilter]);

  const copy = (text: string, label: string) => {
    Clipboard.setStringAsync(text);
    Alert.alert('Copied!', `${label} copied`);
  };

  const showInitialLoader = loading && history.length === 0;

  return (
    <View style={styles.section}>
      <Text style={styles.smallTitle}>Blocks Mined</Text>
      <View style={styles.rewardRow}>
        <TouchableOpacity style={styles.rewardPill}>
          <Text style={styles.rewardText}>24h: {blockCounts['24h']}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.rewardPill}>
          <Text style={styles.rewardText}>Week: {blockCounts.week}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.rewardPill}>
          <Text style={styles.rewardText}>Month: {blockCounts.month}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.title}>Transaction History</Text>
      {isDefi && (
        <Text style={styles.networkNote}>
          DeFi testnet — filter by type (transfers, swaps, liquidity, …) or direction
        </Text>
      )}
      {!isDefi && (
        <Text style={styles.networkNote}>
          Mainnet — filter rewards, transfers, or in/out
        </Text>
      )}

      <View style={styles.buttonRow}>
        <TouchableOpacity
          onPress={() => fetchHistory({ syncWallet: true })}
          style={styles.actionBtn}
          disabled={loading}
        >
          <Text style={styles.actionBtnText}>{loading ? 'Refreshing…' : 'Refresh'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setShowTransactions(!showTransactions)}
          style={[styles.actionBtn, showTransactions && styles.actionBtnActive]}
        >
          <Text style={[styles.actionBtnText, showTransactions && styles.actionBtnTextActive]}>
            {showTransactions ? 'Hide Transactions' : 'Show Transactions'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Type / direction filters (wartbunker + extension parity) */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        style={styles.filterScroll}
      >
        {filters.map((f) => {
          const active = historyFilter === f.id;
          return (
            <TouchableOpacity
              key={f.id}
              onPress={() => setHistoryFilter(f.id)}
              style={[styles.filterChip, active && styles.filterChipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {historyFilter !== 'all' && history.length > 0 ? (
        <Text style={styles.filterMeta}>
          {filteredHistory.length} match{filteredHistory.length === 1 ? '' : 'es'}
          {history.length !== filteredHistory.length
            ? ` · of ${history.length} loaded`
            : ''}
        </Text>
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {showTransactions && (
        <>
          {loading && history.length > 0 ? (
            <View style={styles.refreshingRow}>
              <ActivityIndicator size="small" color={defiColors.goldHover} />
              <Text style={styles.refreshingText}>Updating history…</Text>
            </View>
          ) : null}

          {showInitialLoader ? (
            <ActivityIndicator size="large" color={defiColors.goldHover} style={{ margin: 30 }} />
          ) : history.length === 0 ? (
            <Text style={styles.noTx}>{error ? 'Could not load transactions' : 'No transactions yet'}</Text>
          ) : filteredHistory.length === 0 ? (
            <Text style={styles.noTx}>{filterEmptyMessage(historyFilter)}</Text>
          ) : (
            filteredHistory.slice(0, visibleCount).map((item, index) => (
              <View key={`${item.txid}-${item.height}-${index}`} style={styles.txCard}>
                <View style={styles.row}>
                  <Text style={styles.label}>TxID</Text>
                  <TouchableOpacity onPress={() => copy(item.txid, 'TxID')}>
                    <Text style={styles.value}>{abbreviate(item.txid)}</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.row}>
                  <Text style={styles.label}>From</Text>
                  <TouchableOpacity
                    onPress={() => copy(item.fromAddress ?? '', 'From Address')}
                    onLongPress={() => {
                      const full = item.fromAddress ?? '';
                      if (full && !getContactByAddress(full)) {
                        handleSaveAsContact(full);
                      }
                    }}
                  >
                    <Text
                      style={[
                        styles.value,
                        getAddressDisplay(item.fromAddress, true).isContact && styles.contactValue,
                      ]}
                    >
                      {getAddressDisplay(item.fromAddress, true).display}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.row}>
                  <Text style={styles.label}>To</Text>
                  <TouchableOpacity
                    onPress={() => copy(item.toAddress ?? '', 'To Address')}
                    onLongPress={() => {
                      const full = item.toAddress ?? '';
                      if (full && !getContactByAddress(full)) {
                        handleSaveAsContact(full);
                      }
                    }}
                  >
                    <Text
                      style={[
                        styles.value,
                        getAddressDisplay(item.toAddress).isContact && styles.contactValue,
                      ]}
                    >
                      {getAddressDisplay(item.toAddress).display}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.row}>
                  <Text style={styles.label}>Type</Text>
                  <Text style={styles.value}>
                    {(item.type || 'tx').replace(/_/g, ' ').toUpperCase()}
                  </Text>
                </View>

                {item.description ? (
                  <View style={styles.row}>
                    <Text style={styles.label}>Details</Text>
                    <Text style={[styles.value, styles.descriptionValue]}>{item.description}</Text>
                  </View>
                ) : null}

                <View style={styles.row}>
                  <Text style={styles.label}>Direction</Text>
                  <Text
                    style={[
                      styles.value,
                      {
                        color: item.isIncoming
                          ? defiColors.buy
                          : item.fromAddress === address
                            ? defiColors.sell
                            : defiColors.textSecondary,
                      },
                    ]}
                  >
                    {item.isReward
                      ? 'Reward'
                      : item.isIncoming
                        ? 'Received'
                        : item.fromAddress === address
                          ? 'Sent'
                          : 'Activity'}
                  </Text>
                </View>

                <View style={styles.row}>
                  <Text style={styles.label}>Amount</Text>
                  <Text
                    style={[
                      styles.value,
                      {
                        color: item.isIncoming
                          ? defiColors.buy
                          : item.fromAddress === address
                            ? defiColors.sell
                            : theme.colors.textPrimary,
                      },
                    ]}
                  >
                    {item.amount} {item.asset || 'WART'}
                  </Text>
                </View>

                <View style={styles.row}>
                  <Text style={styles.label}>Height</Text>
                  <Text style={styles.value}>{item.height}</Text>
                </View>

                <View style={styles.row}>
                  <Text style={styles.label}>Confirmations</Text>
                  <Text style={styles.value}>{item.confirmations}</Text>
                </View>

                <View style={styles.row}>
                  <Text style={styles.label}>Date</Text>
                  <Text style={styles.value}>
                    {item.confirmations === 0
                      ? 'Pending'
                      : item.timestamp
                        ? new Date(item.timestamp * 1000).toLocaleString()
                        : 'N/A'}
                  </Text>
                </View>
              </View>
            ))
          )}

          {filteredHistory.length > visibleCount && !showInitialLoader ? (
            <TouchableOpacity
              onPress={() => setVisibleCount(visibleCount + 7)}
              style={styles.showMoreBtn}
            >
              <Text style={styles.showMoreText}>Show More</Text>
            </TouchableOpacity>
          ) : null}
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  section: { marginTop: theme.spacing.md },
  smallTitle: {
    fontSize: theme.typography.caption,
    color: defiColors.blue,
    fontWeight: theme.typography.semiBold,
    marginBottom: theme.spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: {
    fontSize: theme.typography.body,
    color: defiColors.gold,
    fontWeight: theme.typography.semiBold,
    marginBottom: theme.spacing.xs,
  },
  networkNote: { color: defiColors.textMuted, fontSize: 11, marginBottom: theme.spacing.sm },
  descriptionValue: { flex: 1, marginLeft: 12, textAlign: 'right' },
  rewardRow: { flexDirection: 'row', gap: theme.spacing.sm, marginBottom: theme.spacing.md, flexWrap: 'wrap' },
  buttonRow: { flexDirection: 'row', gap: theme.spacing.sm, marginBottom: theme.spacing.sm, flexWrap: 'wrap' },
  filterScroll: { marginBottom: theme.spacing.sm, maxHeight: 40 },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  filterChip: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: defiColors.bgInset,
    borderWidth: 1,
    borderColor: defiColors.borderMuted,
  },
  filterChipActive: {
    backgroundColor: defiColors.goldHover,
    borderColor: defiColors.goldHover,
  },
  filterChipText: {
    color: defiColors.textSecondary,
    fontSize: theme.typography.tiny,
    fontWeight: theme.typography.semiBold,
  },
  filterChipTextActive: { color: '#ffffff' },
  filterMeta: {
    color: defiColors.textMuted,
    fontSize: 11,
    marginBottom: theme.spacing.sm,
  },
  rewardPill: {
    backgroundColor: defiColors.bgInset,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: defiColors.borderMuted,
  },
  rewardText: { color: defiColors.textSecondary, fontWeight: theme.typography.semiBold, fontSize: theme.typography.tiny },
  actionBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: 'rgba(39, 39, 42, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(82, 82, 91, 0.5)',
  },
  actionBtnActive: {
    backgroundColor: defiColors.goldHover,
    borderColor: defiColors.goldHover,
  },
  actionBtnText: { color: defiColors.textSecondary, fontWeight: theme.typography.semiBold, fontSize: theme.typography.tiny },
  actionBtnTextActive: { color: '#ffffff' },
  refreshingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  refreshingText: { color: defiColors.textMuted, fontSize: theme.typography.tiny },
  errorText: {
    color: theme.colors.error,
    fontSize: theme.typography.caption,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  txCard: {
    backgroundColor: defiColors.bgCardMuted,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: defiColors.borderMuted,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: theme.spacing.sm },
  label: { color: defiColors.textMuted, fontSize: theme.typography.caption },
  value: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.caption,
    textAlign: 'right',
    flexShrink: 1,
    fontFamily: theme.typography.fontFamily.mono,
  },
  contactValue: { color: defiColors.goldHover, fontWeight: theme.typography.semiBold },
  noTx: { color: defiColors.textMuted, textAlign: 'center', marginTop: theme.spacing.xl, fontSize: theme.typography.bodySm },
  showMoreBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: defiColors.goldHover,
    borderWidth: 1,
    borderColor: defiColors.goldHover,
    alignSelf: 'center',
    marginTop: theme.spacing.sm,
  },
  showMoreText: { color: '#ffffff', fontWeight: theme.typography.semiBold, fontSize: theme.typography.tiny },
});

export default TransactionHistory;