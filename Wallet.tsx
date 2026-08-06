// Wallet.tsx — ULTIMATE FINAL PRODUCTION VERSION (black screen fixed)
// • Dual toggle buttons: Send WART (left) + Activity (right)
// • Both start collapsed on first load
// • Full login + modal sections restored (no placeholders)

// ────────────────────────────────────────────────────────────────
// Imports
// ────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  Alert,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import axios from 'axios';
import TransactionHistory from './TransactionHistory';
import AddressBookModal from './components/AddressBook/AddressBookModal';
import QrScannerModal from './components/QrScannerModal';
import AddressQrModal from './components/AddressQrModal';
import { Contact } from './types';
import { storage } from './utils/storage';

// Extracted imports
import { WalletData } from './types';
import { WARTHOG_NODES, type NodeUrl, SECURE_STORE_KEYS, DERIVATION_PATHS, ADDRESS_LENGTH, PRIVATE_KEY_LENGTH, DEFAULT_FEE } from './constants';
import { getNodeLabel, isDefiNode } from './utils/nodes';
import { useDefiWallet } from './hooks/useDefiWallet';
import DefiOverviewSection from './components/defi/DefiOverviewSection';
import DefiBalanceHero from './components/defi/DefiBalanceHero';
import DefiPageHeader from './components/defi/DefiPageHeader';
import DefiNavTabs from './components/defi/DefiNavTabs';
import SendAssetModal from './components/defi/SendAssetModal';
import AssetsModal from './components/defi/AssetsModal';
import DexModal from './components/defi/DexModal';
import ToolsModal from './components/tools/ToolsModal';
import { defiStyles, defiColors } from './components/defi/defiStyles';
import { Account, Address, Wart, NonceId, RoundedFee } from 'warthog-ts';
import { generateWallet as generateWalletUtil, deriveWallet as deriveWalletUtil, importWallet as importWalletUtil, decryptWallet, encryptWallet, isValidAddress } from './utils/crypto';
import { createTxContext, fetchChainHead, fetchAccountBalance, fetchUsdPrice, fetchFeeE8, submitWarthogTransaction } from './utils/api';
import {
  amountExceedsAvailable,
  insufficientFreeBalanceMessage,
} from './utils/warthogFormat';
import SpendableBalanceDisplay from './components/SpendableBalanceDisplay';
import { theme } from './theme';

const styles = StyleSheet.create({
  container: { flex: 1 },
  sectionTitle: {
    fontSize: theme.typography.bodySm,
    color: defiColors.gold,
    fontWeight: theme.typography.semiBold,
    textAlign: 'center',
    marginBottom: theme.spacing.md,
    letterSpacing: 0.3,
  },
  loginSection: { marginTop: theme.spacing.lg },
  label: { color: defiColors.textSecondary, fontSize: theme.typography.caption, marginBottom: theme.spacing.sm },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginBottom: theme.spacing.lg },
  nodeColumn: { gap: theme.spacing.sm, marginBottom: theme.spacing.lg },
  nodeButton: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: defiColors.bgCardMuted,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: defiColors.borderMuted,
    alignSelf: 'stretch',
  },
  nodeButtonText: {
    color: theme.colors.textPrimary,
    fontWeight: theme.typography.semiBold,
    textAlign: 'center',
    fontSize: theme.typography.caption,
  },
  bottomRow: { flexDirection: 'row', justifyContent: 'center', gap: theme.spacing.sm, marginTop: theme.spacing.sm, marginBottom: theme.spacing.xxxl },
  bottomButton: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: 'rgba(39, 39, 42, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(82, 82, 91, 0.5)',
    alignSelf: 'stretch',
  },
  bottomButtonText: {
    color: defiColors.textSecondary,
    fontWeight: theme.typography.semiBold,
    textAlign: 'center',
    fontSize: theme.typography.caption,
  },
  walletOptionsModal: {
    maxHeight: '90%',
    padding: 0,
    overflow: 'hidden',
  },
  walletOptionsScroll: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.lg,
  },
  walletOptionsSection: {
    marginBottom: theme.spacing.lg,
  },
  walletOptionsSectionTitle: {
    color: defiColors.textSecondary,
    fontSize: theme.typography.caption,
    fontWeight: theme.typography.semiBold,
    marginBottom: theme.spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  walletOptionsActions: {
    gap: theme.spacing.xs,
  },
  actionButton: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(39, 39, 42, 0.8)',
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: 'rgba(82, 82, 91, 0.5)',
    minWidth: 70,
  },
  actionButtonText: { color: defiColors.textSecondary, fontWeight: theme.typography.semiBold, textAlign: 'center', fontSize: theme.typography.tiny },
  activeButton: {
    backgroundColor: defiColors.goldHover,
    borderColor: defiColors.goldHover,
  },
  activeButtonText: { color: '#ffffff' },

  nonceDisplay: { color: defiColors.textMuted, fontSize: theme.typography.caption, marginBottom: theme.spacing.sm, textAlign: 'center' },
  logSection: {
    marginTop: theme.spacing.md,
    backgroundColor: defiColors.bgCard,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: defiColors.border,
    padding: theme.spacing.md,
  },
  logList: { maxHeight: 200 },
  logItem: {
    backgroundColor: defiColors.bgInset,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: defiColors.borderMuted,
    marginBottom: theme.spacing.sm,
  },
  logText: { color: theme.colors.textPrimary, fontSize: theme.typography.caption, fontFamily: theme.typography.fontFamily.mono },
  input: {
    backgroundColor: defiColors.bgCard,
    color: theme.colors.textPrimary,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: defiColors.border,
    marginBottom: theme.spacing.md,
    fontSize: theme.typography.bodySm,
  },
  inputNoMargin: {
    backgroundColor: defiColors.bgCard,
    color: theme.colors.textPrimary,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: defiColors.border,
    fontSize: theme.typography.bodySm,
    marginBottom: 0,
  },
  bigButton: {
    paddingVertical: 3,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(39, 39, 42, 0.8)',
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: 'rgba(82, 82, 91, 0.5)',
    alignItems: 'center',
    marginVertical: theme.spacing.xs,
  },
  bigButtonText: { color: defiColors.textSecondary, fontWeight: theme.typography.semiBold, fontSize: theme.typography.tiny },
  bigButtonPrimary: {
    backgroundColor: defiColors.goldHover,
    borderColor: defiColors.goldHover,
  },
  bigButtonPrimaryText: { color: '#ffffff', fontWeight: theme.typography.semiBold, fontSize: theme.typography.tiny },
  seed: {
    backgroundColor: defiColors.bgInset,
    padding: theme.spacing.md,
    color: defiColors.textSecondary,
    fontSize: theme.typography.bodySm,
    marginBottom: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: defiColors.borderMuted,
  },
  key: {
    backgroundColor: defiColors.bgInset,
    padding: theme.spacing.md,
    color: theme.colors.textPrimary,
    fontSize: theme.typography.caption,
    marginBottom: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: defiColors.borderMuted,
    fontFamily: theme.typography.fontFamily.mono,
  },
  error: { color: theme.colors.error, textAlign: 'center', marginTop: theme.spacing.md, fontSize: theme.typography.bodySm },

  addressContainer: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  addressInput: { flex: 1 },
  addressButtons: { flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'stretch' },
  addressButton: {
    width: 50,
    borderRadius: theme.borderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(39, 39, 42, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(82, 82, 91, 0.5)',
  },
  contactButtonText: { color: defiColors.textSecondary, fontSize: 20 },
  saveButtonText: { color: defiColors.textSecondary, fontSize: 16 },
  selectedContact: {
    backgroundColor: 'rgba(231, 147, 0, 0.12)',
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: 'rgba(231, 147, 0, 0.4)',
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  selectedContactText: {
    color: defiColors.goldHover,
    fontSize: theme.typography.caption,
    fontWeight: theme.typography.semiBold,
    textAlign: 'center',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.xl,
  },
  loadingText: {
    marginTop: theme.spacing.md,
    color: defiColors.textMuted,
    fontSize: theme.typography.bodySm,
  },
});

const StyledTextInput = (props: React.ComponentProps<typeof TextInput>) => (
  <TextInput
    {...props}
    placeholderTextColor={defiColors.textMuted}
    style={[styles.input, props.style]}
  />
);

const getPasswordStrength = (password: string) => {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z\d]/.test(password)) score++;
  if (score <= 2) return { level: 1, label: 'Weak' };
  if (score <= 3) return { level: 2, label: 'Fair' };
  if (score <= 4) return { level: 3, label: 'Good' };
  return { level: 4, label: 'Strong' };
};

const Wallet: React.FC = () => {
  const insets = useSafeAreaInsets();

  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [currentWalletName, setCurrentWalletName] = useState<string>('');
  const [savedWalletNames, setSavedWalletNames] = useState<string[]>([]);
  const [balance, setBalance] = useState<string>('0.00000000');
  const [balanceAvailable, setBalanceAvailable] = useState<string>('0.00000000');
  const [balanceLocked, setBalanceLocked] = useState<string>('0.00000000');
  const [usdBalance, setUsdBalance] = useState<string>('$0.00');
  const [nextNonce, setNextNonce] = useState<number>(0);
  const [currentBlockHeight, setCurrentBlockHeight] = useState<number>(0);
  const [selectedNode, setSelectedNode] = useState<NodeUrl>(WARTHOG_NODES[0]);
  const [walletAction, setWalletAction] = useState<'create' | 'derive' | 'import' | 'login'>('create');
  const [mnemonic, setMnemonic] = useState('');
  const [privateKeyInput, setPrivateKeyInput] = useState('');
  const [wordCount, setWordCount] = useState('12');
  const [pathType, setPathType] = useState<'hardened' | 'normal'>('hardened');
  const [toAddr, setToAddr] = useState('');
  const [amount, setAmount] = useState('');
  const [fee, setFee] = useState('0.01');
  const [manualNonce, setManualNonce] = useState('');
  const [sending, setSending] = useState(false);

  const [showSendModal, setShowSendModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showContactsModal, setShowContactsModal] = useState(false);
  const [showWalletOptionsModal, setShowWalletOptionsModal] = useState(false);
  const [showSendAssetModal, setShowSendAssetModal] = useState(false);
  const [showAssetsModal, setShowAssetsModal] = useState(false);
  const [showDexModal, setShowDexModal] = useState(false);
  const [showToolsModal, setShowToolsModal] = useState(false);
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [showWalletQrScanner, setShowWalletQrScanner] = useState(false);
  const [showAddressQr, setShowAddressQr] = useState(false);
  const [scannedWalletPayload, setScannedWalletPayload] = useState<string | null>(null);

  const isDefi = useMemo(() => isDefiNode(selectedNode), [selectedNode]);

  const defiActiveTab = useMemo(() => {
    if (showSendModal) return 'send-wart';
    if (showSendAssetModal) return 'send-asset';
    if (showHistoryModal) return 'history';
    if (showAssetsModal) return 'assets';
    if (showDexModal) return 'dex';
    if (showContactsModal) return 'contacts';
    if (showWalletOptionsModal) return 'options';
    if (showToolsModal) return 'tools';
    return null;
  }, [
    showSendModal,
    showSendAssetModal,
    showHistoryModal,
    showAssetsModal,
    showDexModal,
    showContactsModal,
    showWalletOptionsModal,
    showToolsModal,
  ]);

  const modalOverlayStyle = defiStyles.modalOverlay;
  const modalContentStyle = { ...defiStyles.modalContent, marginBottom: insets.bottom };
  const modalTitleStyle = defiStyles.modalTitle;
  const modalCloseStyle = defiStyles.modalClose;
  const modalBlockCounterStyle = defiStyles.modalBlockCounter;
  const modalBlockTextStyle = defiStyles.modalBlockText;

  const navTabs = useMemo(
    () => [
      { id: 'send-wart', label: 'Send WART', onPress: () => setShowSendModal(true) },
      ...(isDefi
        ? [{ id: 'send-asset', label: 'Send Asset', onPress: () => setShowSendAssetModal(true) }]
        : []),
      { id: 'history', label: 'History', onPress: () => setShowHistoryModal(true) },
      ...(isDefi
        ? [
            { id: 'assets', label: 'Assets', onPress: () => setShowAssetsModal(true) },
            { id: 'dex', label: 'DEX', onPress: () => setShowDexModal(true) },
          ]
        : []),
      { id: 'contacts', label: 'Contacts', onPress: () => setShowContactsModal(true) },
      { id: 'tools', label: 'Tools', onPress: () => setShowToolsModal(true) },
      { id: 'options', label: 'Options', onPress: () => setShowWalletOptionsModal(true) },
    ],
    [isDefi]
  );

  const [showModal, setShowModal] = useState(false);
  const [walletData, setWalletData] = useState<WalletData | null>(null);
  const [walletName, setWalletName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [saveWalletConsent, setSaveWalletConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [uploadedFileContent, setUploadedFileContent] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [sentTxLog, setSentTxLog] = useState<string[]>([]);
  const [showRecentTxLog, setShowRecentTxLog] = useState(false);
  const [creatingWallet, setCreatingWallet] = useState(false);
  const [selectedWalletToLogin, setSelectedWalletToLogin] = useState<string>('');
  const [showWalletSelection, setShowWalletSelection] = useState(false);

  // Address Book state
  const [showAddressBook, setShowAddressBook] = useState(false);
  const [addressBookMode, setAddressBookMode] = useState<'select' | 'manage'>('select');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [prefilledAddress, setPrefilledAddress] = useState<string>('');

  // Save current wallet state
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveWalletName, setSaveWalletName] = useState('');
  const [savePassword, setSavePassword] = useState('');
  const [saveConfirmPassword, setSaveConfirmPassword] = useState('');
  const [logoutAfterSave, setLogoutAfterSave] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [downloadPassword, setDownloadPassword] = useState('');

  useEffect(() => {
    const loadSavedWallets = async () => {
      const namesStr = await storage.getItemAsync(SECURE_STORE_KEYS.walletNames);
      if (namesStr) {
        const names = JSON.parse(namesStr);
        setSavedWalletNames(names);
        if (names.length > 0) {
          setWalletAction('login');
        }
      }
    };
    loadSavedWallets();
  }, []);



  const handleLogout = async () => {
    // Check if the current wallet is saved; if not, prompt to save
    if (!currentWalletName || !savedWalletNames.includes(currentWalletName)) {
      setLogoutAfterSave(true);
      setShowSaveModal(true);
      return;
    }
    // Already saved, logout
    performLogout();
  };

  const performLogout = () => {
    setWallet(null);
    setCurrentWalletName('');
    setIsLoggedIn(false);
    setSentTxLog([]);
    Alert.alert('Logged Out', 'Your wallet is saved securely on this device.');
  };

  const handleClearWallet = () => {
    if (!currentWalletName) {
      Alert.alert('No Wallet Selected', 'No wallet is currently selected to delete.');
      return;
    }
    Alert.alert(
      'Delete Saved Wallet?',
      `This will permanently remove the wallet "${currentWalletName}" from your device.\n\nYou will need to import or create a new wallet next time.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'DELETE FOREVER',
          style: 'destructive',
          onPress: async () => {
            try {
              await storage.deleteItemAsync(SECURE_STORE_KEYS.wallet(currentWalletName));
              const updatedNames = savedWalletNames.filter(name => name !== currentWalletName);
              setSavedWalletNames(updatedNames);
              await storage.setItemAsync(SECURE_STORE_KEYS.walletNames, JSON.stringify(updatedNames));
              setWallet(null);
              setCurrentWalletName('');
              setIsLoggedIn(false);
              setSentTxLog([]);
              setNextNonce(0);
              Alert.alert('Wallet Cleared', `Wallet "${currentWalletName}" has been deleted.`);
            } catch (e) {
              Alert.alert('Error', 'Failed to delete wallet data');
            }
          },
        },
      ]
    );
  };



  const getPersistentNonce = async (address: string): Promise<number> => {
    if (!address) return 0;
    try {
      const stored = await storage.getItemAsync(SECURE_STORE_KEYS.nonce(address));
      return stored ? Number(stored) : 0;
    } catch {
      return 0;
    }
  };

  const savePersistentNonce = async (address: string, nonce: number): Promise<void> => {
    if (!address) return;
    try {
      await storage.setItemAsync(SECURE_STORE_KEYS.nonce(address), nonce.toString());
    } catch (e) {
      console.error('Failed to persist nonce:', e);
    }
  };

  const bumpNonce = useCallback(async (newNonce: number) => {
    if (!wallet?.address) return;
    setNextNonce(newNonce);
    await savePersistentNonce(wallet.address, newNonce);
  }, [wallet?.address]);

  const defi = useDefiWallet(wallet, selectedNode, isDefi, bumpNonce);

  const fetchBalanceAndNonce = useCallback(async (address: string) => {
    try {
      const [headData, balData] = await Promise.all([
        fetchChainHead(selectedNode),
        fetchAccountBalance(selectedNode, address),
      ]);

      setCurrentBlockHeight(headData.pinHeight);

      setBalance(balData.balanceStr);
      setBalanceAvailable(balData.availableStr);
      setBalanceLocked(balData.lockedStr);

      const usdPrice = await fetchUsdPrice();
      // USD priced on total holdings (available + locked)
      const usd = (balData.balance * usdPrice).toFixed(2);
      setUsdBalance(`$${usd}`);

      const fetchedNonce = balData.nonceId;
      const persistentNonce = await getPersistentNonce(address);
      setNextNonce((prev) => {
        const newNextNonce = Math.max(persistentNonce, fetchedNonce, prev);
        savePersistentNonce(address, newNextNonce);
        return newNextNonce;
      });
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }, [selectedNode]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (wallet?.address) {
        await fetchBalanceAndNonce(wallet.address);
        if (isDefi) await defi.refreshDefiData();
      }
    } catch (e) {
      // Balance/defi helpers already surface errors; never leave the spinner stuck.
      console.error('Refresh failed:', e);
    } finally {
      setRefreshing(false);
    }
  }, [wallet, isDefi, fetchBalanceAndNonce, defi.refreshDefiData]);

  // Re-fetch WART balance whenever the selected node changes (mainnet ↔ testnet).
  // Node-switch UI only updates selectedNode; defi data is handled inside useDefiWallet.
  useEffect(() => {
    if (!wallet?.address) return;
    fetchBalanceAndNonce(wallet.address);
  }, [selectedNode, wallet?.address, fetchBalanceAndNonce]);

  /** After a spend/lock tx: bump nonce and re-fetch free/locked for WART + assets. */
  const afterSpendSuccess = useCallback(async (newNonce: number) => {
    await bumpNonce(newNonce);
    if (wallet?.address) {
      await fetchBalanceAndNonce(wallet.address);
      if (isDefi) await defi.refreshDefiData();
    }
  }, [bumpNonce, wallet?.address, fetchBalanceAndNonce, isDefi, defi.refreshDefiData]);

  const handleWalletAction = async () => {
    setError(null);
    setCreatingWallet(true);
    console.log('Wallet creation started - spinner should show');

    // Small delay to ensure spinner renders before heavy crypto operations
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      let data: WalletData;
      if (walletAction === 'create') {
        data = await generateWalletUtil(Number(wordCount), pathType);
      } else if (walletAction === 'derive') {
        data = deriveWalletUtil(mnemonic, Number(wordCount), pathType);
        setMnemonic('');
      } else if (walletAction === 'import' && privateKeyInput.length === PRIVATE_KEY_LENGTH) {
        data = importWalletUtil(privateKeyInput);
        setPrivateKeyInput('');
      } else {
        throw new Error('Fill all fields');
      }
      setWalletData(data);
      setSaveWalletConsent(false);
      setShowModal(true);
    } catch (e: any) {
      Alert.alert('Wallet Creation Failed', e.message);
    } finally {
      setCreatingWallet(false);
    }
  };

  const saveWallet = async () => {
    setModalError(null);
    if (!password) return setModalError('Enter a password');
    if (!walletName) return setModalError('Enter a wallet name');
    if (savedWalletNames.includes(walletName)) return setModalError('Wallet name already exists. Choose a different name.');
    if (getPasswordStrength(password).level < 3) return setModalError('Password is too weak. Must be at least Good strength.');
    if (password !== confirmPassword) return setModalError('Passwords do not match');
    if (!saveWalletConsent) return setModalError('Check the consent box to save');
    if (!walletData) return setModalError('No wallet data available');
    try {
      const enc = encryptWallet(walletData, password);
      await storage.setItemAsync(SECURE_STORE_KEYS.wallet(walletName), enc);
      const updatedNames = [...savedWalletNames, walletName];
      setSavedWalletNames(updatedNames);
      await storage.setItemAsync(SECURE_STORE_KEYS.walletNames, JSON.stringify(updatedNames));
      setWallet(walletData);
      setCurrentWalletName(walletName);
      setIsLoggedIn(true);
      setShowModal(false);
      fetchBalanceAndNonce(walletData.address);
      setPassword('');
      setConfirmPassword('');
      setWalletName('');
      Alert.alert('✅ Wallet Saved Securely!');
    } catch (e: any) {
      setModalError('Failed to save wallet: ' + e.message);
    }
  };

  const saveCurrentWallet = async () => {
    setModalError(null);
    if (!saveWalletName) return setModalError('Enter a wallet name');
    if (savedWalletNames.includes(saveWalletName) && saveWalletName !== currentWalletName) return setModalError('Wallet name already exists. Choose a different name.');
    if (!savePassword) return setModalError('Enter a password');
    if (getPasswordStrength(savePassword).level < 3) return setModalError('Password is too weak. Must be at least Good strength.');
    if (savePassword !== saveConfirmPassword) return setModalError('Passwords do not match');
    if (!wallet) return setModalError('No wallet available');
    try {
      const enc = encryptWallet(wallet, savePassword);
      await storage.setItemAsync(SECURE_STORE_KEYS.wallet(saveWalletName), enc);
      if (!savedWalletNames.includes(saveWalletName)) {
        const updatedNames = [...savedWalletNames, saveWalletName];
        setSavedWalletNames(updatedNames);
        await storage.setItemAsync(SECURE_STORE_KEYS.walletNames, JSON.stringify(updatedNames));
      }
      setCurrentWalletName(saveWalletName);
      setShowSaveModal(false);
      setSaveWalletName('');
      setSavePassword('');
      setSaveConfirmPassword('');
      Alert.alert('✅ Wallet Saved Securely!');
      if (logoutAfterSave) {
        setLogoutAfterSave(false);
        performLogout();
      }
    } catch (e: any) {
      setModalError('Failed to save wallet: ' + e.message);
    }
  };

  const downloadCurrentWallet = async () => {
    setModalError(null);
    if (!currentWalletName) return setModalError('No wallet name available');
    if (!downloadPassword) return setModalError('Enter a password');
    if (getPasswordStrength(downloadPassword).level < 3) return setModalError('Password is too weak. Must be at least Good strength.');
    if (!wallet) return setModalError('No wallet available');
    try {
      const enc = encryptWallet(wallet, downloadPassword);
      
      if (Platform.OS === 'web') {
        const blob = new Blob([enc], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `warthog_wallet_${currentWalletName}.txt`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const file = new File(Paths.cache, `warthog_wallet_${currentWalletName}.txt`);
        await file.write(enc);
        await Sharing.shareAsync(file.uri);
      }
      
      setShowDownloadModal(false);
      setDownloadPassword('');
      Alert.alert('✅ Downloaded!');
    } catch (e: any) {
      setModalError('Failed to download: ' + e.message);
    }
  };

  const downloadWallet = async () => {
    setModalError(null);
    if (!walletName) return setModalError('Enter a wallet name');
    if (!password) return setModalError('Enter a password');
    if (getPasswordStrength(password).level < 3) return setModalError('Password is too weak. Must be at least Good strength.');
    if (password !== confirmPassword) return setModalError('Passwords do not match');
    if (!walletData) return setModalError('No wallet data available');
    try {
      const enc = encryptWallet(walletData, password);
      
      if (Platform.OS === 'web') {
        const blob = new Blob([enc], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `warthog_wallet_${walletName}.txt`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const file = new File(Paths.cache, `warthog_wallet_${walletName}.txt`);
        await file.write(enc);
        await Sharing.shareAsync(file.uri);
      }
      
      setShowModal(false);
      setWalletName('');
      setPassword('');
      setConfirmPassword('');
      Alert.alert('✅ Downloaded!');
    } catch (e: any) {
      setModalError('Failed to download: ' + e.message);
    }
  };

  const loadWallet = async (walletName: string) => {
    const enc = await storage.getItemAsync(SECURE_STORE_KEYS.wallet(walletName));
    if (!enc || !password) return setError('No wallet or wrong password');
    try {
      const data = decryptWallet(enc, password);
      setWallet(data);
      setCurrentWalletName(walletName);
      setIsLoggedIn(true);
      fetchBalanceAndNonce(data.address);
      setPassword('');
      setSelectedWalletToLogin('');
      setShowWalletSelection(false);
    } catch (e: any) {
      setError('Wrong password: ' + e.message);
    }
  };

  const pickAndLoginFromFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'text/plain', copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;
      
      const content = await (Platform.OS === 'web'
        ? fetch(result.assets[0].uri).then(r => r.text())
        : new File(result.assets[0].uri).text()
      );
      
      setUploadedFileContent(content);
      setUploadedFileName(result.assets[0].name || 'Selected file');
      Alert.alert('File Loaded', 'Enter password below to decrypt');
    } catch (e: any) {
      setError('Failed to read file: ' + e.message);
    }
  };

  const loginFromFile = async () => {
    if (!uploadedFileContent || !password) return setError('No file or password');
    try {
      const data = decryptWallet(uploadedFileContent, password);
      setWallet(data);
      setIsLoggedIn(true);
      fetchBalanceAndNonce(data.address);
      setUploadedFileContent(null);
      setPassword('');
      Alert.alert('✅ Logged in from file!');
    } catch (e: any) {
      setError('Wrong password or invalid file: ' + e.message);
    }
  };

  const loginFromWalletQr = async () => {
    if (!scannedWalletPayload || !password) return setError('Scan a wallet QR and enter the export password');
    try {
      const data = decryptWallet(scannedWalletPayload, password);
      setWallet(data);
      setIsLoggedIn(true);
      fetchBalanceAndNonce(data.address);
      setScannedWalletPayload(null);
      setPassword('');
      Alert.alert('Imported', 'Wallet loaded from QR — consider saving it to this device.');
    } catch (e: any) {
      setError('Wrong password or invalid wallet QR: ' + e.message);
    }
  };

  const spendableWart = balanceAvailable || balance;

  const handleMaxWart = () => {
    if (spendableWart && spendableWart !== '0.00000000') {
      setAmount(spendableWart);
    }
  };

  const handleSend = async () => {
    if (!wallet || !toAddr || !amount) return setError('Fill all fields');
    if (!isValidAddress(toAddr)) {
      return setError('Invalid toAddr: must be exactly 48 hex characters');
    }
    setSending(true);
    setError(null);
    try {
      // Live free-balance check — locked WART cannot be sent
      const liveBal = await fetchAccountBalance(selectedNode, wallet.address);
      setBalance(liveBal.balanceStr);
      setBalanceAvailable(liveBal.availableStr);
      setBalanceLocked(liveBal.lockedStr);
      if (amountExceedsAvailable(amount.trim(), liveBal.availableStr)) {
        const msg = insufficientFreeBalanceMessage({
          available: liveBal.availableStr,
          locked: liveBal.lockedStr,
          unit: 'WART',
        });
        setAmount(liveBal.availableStr);
        setError(msg);
        Alert.alert('Insufficient free balance', msg);
        return;
      }

      const headData = await fetchChainHead(selectedNode);
      setCurrentBlockHeight(headData.pinHeight);
      const nonceId = manualNonce ? parseInt(manualNonce) : nextNonce;

      const trimmed = toAddr.trim().replace(/^0x/i, '');
      const recipient = Address.fromHex(trimmed) ?? Address.fromRaw(trimmed);
      if (!recipient) throw new Error('Invalid recipient address');

      const wartAmount = Wart.parse(amount.trim());
      if (!wartAmount) throw new Error('Invalid amount');

      const feeWart = fee || DEFAULT_FEE;
      const feeE8 = await fetchFeeE8(selectedNode, feeWart);
      // feeE8 already node-rounded; do not ceil-re-round (0.01 → 1000448 bug)
      const roundedFee = RoundedFee.fromE8(BigInt(feeE8), false);
      if (!roundedFee) throw new Error('Invalid fee');

      const nonce = NonceId.fromNumber(nonceId);
      if (!nonce) throw new Error('Invalid nonce');

      const account = Account.fromPrivateKeyHex(wallet.privateKey);
      // Use normalized pin (mainnet flat + DeFi nested) — do not rely on nested-only chainHead
      const ctx = await createTxContext(selectedNode, roundedFee, nonce);
      const tx = ctx.transferWart(account, recipient, wartAmount);
      const res = await submitWarthogTransaction(selectedNode, tx);
      const sentTxHash = res.txHash;
      Alert.alert('Sent!', `Tx Hash: ${sentTxHash}`);
      setSentTxLog((prev) => [sentTxHash, ...prev]);
      setShowRecentTxLog(true);
      setTimeout(() => setShowRecentTxLog(false), 35000); // Hide after 35 seconds
      const updatedNextNonce = Math.max(nextNonce || 0, nonceId + 1);
      setNextNonce(updatedNextNonce);
      await savePersistentNonce(wallet.address, updatedNextNonce);
      setManualNonce('');
      onRefresh();
    } catch (e: any) {
      console.error(e);
      let msg = e.response?.data?.error || e.message || 'Send failed';
      if (/insufficient\s+(token\s+)?balance/i.test(msg)) {
        msg = insufficientFreeBalanceMessage({
          available: balanceAvailable,
          locked: balanceLocked,
          unit: 'WART',
        });
      }
      setError(msg);
      Alert.alert('Send Failed', msg);
    } finally {
      setSending(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    Clipboard.setStringAsync(text);
    Alert.alert('Copied!', `${label} copied`);
  };

  // Address Book handlers
  const handleContactSelect = (contact: Contact) => {
    setToAddr(contact.address);
    setSelectedContact(contact);
    setShowAddressBook(false);
  };

  const handleSaveAsContact = () => {
    if (toAddr && isValidAddress(toAddr)) {
      setShowAddressBook(true);
    }
  };

  return (
    <View style={styles.container}>
      {!isLoggedIn ? (
        <View style={styles.loginSection}>
          <Text style={styles.label}>Choose Action</Text>
          <View style={styles.buttonRow}>
            {(['create', 'derive', 'import', 'login'] as const).map(act => (
              <TouchableOpacity
                key={act}
                style={[styles.actionButton, walletAction === act && styles.activeButton]}
                onPress={() => setWalletAction(act)}
              >
                <Text style={[styles.actionButtonText, walletAction === act && styles.activeButtonText]}>
                  {act.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {walletAction === 'login' && (
            <>
              {savedWalletNames.length > 0 && !showWalletSelection && !uploadedFileContent && (
                <>
                  <Text style={styles.label}>Saved Wallets:</Text>
                  {savedWalletNames.map(name => (
                    <TouchableOpacity
                      key={name}
                      style={styles.bigButton}
                      onPress={() => {
                        setSelectedWalletToLogin(name);
                        setShowWalletSelection(true);
                      }}
                    >
                      <Text style={styles.bigButtonText}>{name}</Text>
                    </TouchableOpacity>
                  ))}
                </>
              )}
              {showWalletSelection && selectedWalletToLogin && (
                <>
                  <Text style={styles.label}>Logging into: {selectedWalletToLogin}</Text>
                  <StyledTextInput
                    placeholder="Enter password to decrypt"
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={setPassword}
                  />
                  <TouchableOpacity style={styles.bigButton} onPress={() => loadWallet(selectedWalletToLogin)}>
                    <Text style={styles.bigButtonText}>Decrypt & Login</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.bigButton} onPress={() => { setShowWalletSelection(false); setSelectedWalletToLogin(''); setPassword(''); }}>
                    <Text style={styles.bigButtonText}>Back to Wallet List</Text>
                  </TouchableOpacity>
                </>
              )}
              <TouchableOpacity style={[styles.bigButton, styles.bigButtonPrimary]} onPress={pickAndLoginFromFile}>
                <Text style={styles.bigButtonPrimaryText}>Login from File</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.bigButton}
                onPress={() => {
                  setScannedWalletPayload(null);
                  setShowWalletQrScanner(true);
                }}
              >
                <Text style={styles.bigButtonText}>Scan Wallet QR (from wartbunker)</Text>
              </TouchableOpacity>
              {uploadedFileName && (
                <Text style={styles.label}>Selected file: {uploadedFileName}</Text>
              )}
              {uploadedFileContent && (
                <>
                  <StyledTextInput
                    placeholder="Enter password to decrypt file"
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={setPassword}
                  />
                  <TouchableOpacity style={styles.bigButton} onPress={loginFromFile}>
                    <Text style={styles.bigButtonText}>Decrypt & Login from File</Text>
                  </TouchableOpacity>
                </>
              )}
              {scannedWalletPayload && (
                <>
                  <Text style={styles.label}>Wallet QR loaded — enter the export password from wartbunker</Text>
                  <StyledTextInput
                    placeholder="Export password"
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={setPassword}
                  />
                  <TouchableOpacity style={styles.bigButton} onPress={loginFromWalletQr}>
                    <Text style={styles.bigButtonText}>Decrypt & Import Wallet</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.bigButton}
                    onPress={() => {
                      setScannedWalletPayload(null);
                      setPassword('');
                    }}
                  >
                    <Text style={styles.bigButtonText}>Clear Scanned QR</Text>
                  </TouchableOpacity>
                </>
              )}
            </>
          )}
          {(walletAction === 'create' || walletAction === 'derive' || walletAction === 'import') && (
            <>
              {creatingWallet ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={defiColors.goldHover} />
                  <Text style={styles.loadingText}>Creating wallet...</Text>
                </View>
              ) : (
                <TouchableOpacity style={styles.bigButton} onPress={handleWalletAction}>
                  <Text style={styles.bigButtonText}>
                    {walletAction === 'create' ? 'Create New Wallet' : walletAction === 'derive' ? 'Derive from Seed Phrase' : 'Import Private Key'}
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}
          {walletAction === 'derive' && (
            <StyledTextInput
              placeholder="Enter 12 or 24 word seed phrase"
              value={mnemonic}
              onChangeText={setMnemonic}
              multiline
              numberOfLines={4}
            />
          )}
          {walletAction === 'import' && (
            <StyledTextInput
              placeholder="Enter 64-char private key"
              value={privateKeyInput}
              onChangeText={setPrivateKeyInput}
            />
          )}
        </View>
      ) : wallet ? (
        <>
          <DefiPageHeader
            subtitle={
              isDefi
                ? 'Your balances, assets, and open orders'
                : 'Your balance and transactions'
            }
          />
          <DefiBalanceHero
            wallet={wallet}
            currentWalletName={currentWalletName}
            balance={balance}
            balanceAvailable={balanceAvailable}
            balanceLocked={balanceLocked}
            usdBalance={usdBalance}
            nodeLabel={getNodeLabel(selectedNode)}
            networkLabel={isDefi ? 'DeFi Testnet' : 'Mainnet'}
            refreshing={refreshing}
            onRefresh={onRefresh}
            onSendWart={() => setShowSendModal(true)}
            onShowAddressQr={() => setShowAddressQr(true)}
            onCopyAddress={(address) => copyToClipboard(address, 'Address')}
          />
          <DefiNavTabs activeId={defiActiveTab} tabs={navTabs} />

          {isDefi && (
            <DefiOverviewSection
              wallet={wallet}
              selectedNode={selectedNode}
              nextNonce={nextNonce}
              orderedAssets={defi.orderedAssets}
              reorderableAssetCount={defi.watchedAssets.length}
              openOrders={defi.openOrders}
              liquidityPositions={defi.liquidityPositions}
              loadingAssets={defi.loadingAssets}
              loadingOrders={defi.loadingOrders}
              loadingLiquidity={defi.loadingLiquidity}
              onAddAsset={(hash) => defi.addWatchedAsset(hash)}
              onRemoveAsset={(hash) => defi.removeWatchedAsset(hash)}
              onReorderAssets={defi.reorderWatchedAssets}
              onSendAsset={(asset) => {
                defi.setSendAssetPrefill({
                  hash: asset.hash,
                  name: asset.name,
                  decimals: asset.decimals,
                  balance: asset.available ?? asset.balance,
                  available: asset.available ?? asset.balance,
                  locked: asset.locked ?? '0',
                  total: asset.balance,
                });
                setShowSendAssetModal(true);
              }}
              onOpenDex={(prefill) => {
                if (prefill) defi.setDexPoolPrefill(prefill);
                setShowDexModal(true);
              }}
              onRefreshOrders={defi.refreshOpenOrders}
              onRefreshLiquidity={defi.refreshLiquidity}
              onNonceBump={afterSpendSuccess}
            />
          )}

          {showRecentTxLog && sentTxLog.length > 0 && (
            <View style={styles.logSection}>
              <Text style={styles.sectionTitle}>Recent Transaction</Text>
              <TouchableOpacity onPress={() => copyToClipboard(sentTxLog[0], 'Tx Hash')} style={styles.logItem}>
                <Text style={styles.logText}>{sentTxLog[0]}</Text>
              </TouchableOpacity>
            </View>
          )}


        </>
      ) : (
        <ActivityIndicator size="large" color={defiColors.goldHover} />
      )}

      {/* ==================== MODALS ==================== */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <View style={modalOverlayStyle}>
          <ScrollView style={modalContentStyle} contentContainerStyle={{ paddingBottom: 50 }}>
            <View style={defiStyles.modalAccent} />
            <Text style={modalTitleStyle}>Wallet Ready!</Text>
            {walletData?.mnemonic && (
              <>
                <Text style={styles.label}>Mnemonic Phrase</Text>
                <Text style={styles.seed}>{walletData.mnemonic}</Text>
              </>
            )}
            <Text style={styles.label}>Private Key</Text>
            <TouchableOpacity onPress={() => copyToClipboard(walletData!.privateKey, 'Private Key')}>
              <Text style={styles.key}>{walletData?.privateKey}</Text>
            </TouchableOpacity>
            <Text style={styles.label}>Wallet Name</Text>
            <StyledTextInput placeholder="Enter a name for this wallet" value={walletName} onChangeText={setWalletName} />
            <Text style={styles.label}>Password must be at least 8 characters with uppercase, lowercase, number, and special character.</Text>
            <StyledTextInput placeholder="Password" secureTextEntry={!showPassword} value={password} onChangeText={setPassword} />
            <Text style={styles.label}>Strength: <Text style={{ color: getPasswordStrength(password).level === 1 ? 'red' : getPasswordStrength(password).level === 2 ? 'orange' : getPasswordStrength(password).level === 3 ? 'blue' : 'green' }}>{getPasswordStrength(password).label}</Text></Text>
            <StyledTextInput placeholder="Confirm Password" secureTextEntry={!showConfirmPassword} value={confirmPassword} onChangeText={setConfirmPassword} />
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 10 }}
              onPress={() => setSaveWalletConsent(!saveWalletConsent)}
            >
              <View style={{ width: 20, height: 20, borderWidth: 1, borderColor: defiColors.goldHover, marginRight: 10, backgroundColor: saveWalletConsent ? defiColors.goldHover : 'transparent' }} />
              <Text style={{ color: theme.colors.textSecondary, fontSize: 14 }}>I consent to save this wallet securely on this device</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.bigButton} onPress={saveWallet}>
              <Text style={styles.bigButtonText}>{Platform.OS === 'web' ? 'Save (not secure in this web demo)' : 'Save Securely (Device)'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.bigButton} onPress={downloadWallet}>
              <Text style={styles.bigButtonText}>Download Encrypted File</Text>
            </TouchableOpacity>
            {modalError && <Text style={styles.error}>{modalError}</Text>}
            <TouchableOpacity onPress={() => { setShowModal(false); setModalError(null); setWalletName(''); setPassword(''); setConfirmPassword(''); }}>
              <Text style={modalCloseStyle}>Close</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={showSaveModal} transparent animationType="slide" onRequestClose={() => setShowSaveModal(false)}>
        <View style={modalOverlayStyle}>
          <View style={[modalContentStyle, { paddingBottom: 10 }]}>
            <View style={defiStyles.modalAccent} />
            <Text style={modalTitleStyle}>Save Current Wallet</Text>
            <Text style={styles.label}>Wallet Name</Text>
            <StyledTextInput placeholder="Enter a name for this wallet" value={saveWalletName} onChangeText={setSaveWalletName} />
            <Text style={styles.label}>Password must be at least 8 characters with uppercase, lowercase, number, and special character.</Text>
            <StyledTextInput placeholder="Password" secureTextEntry value={savePassword} onChangeText={setSavePassword} />
            <Text style={styles.label}>Strength: <Text style={{ color: getPasswordStrength(savePassword).level === 1 ? 'red' : getPasswordStrength(savePassword).level === 2 ? 'orange' : getPasswordStrength(savePassword).level === 3 ? 'blue' : 'green' }}>{getPasswordStrength(savePassword).label}</Text></Text>
            <StyledTextInput placeholder="Confirm Password" secureTextEntry value={saveConfirmPassword} onChangeText={setSaveConfirmPassword} />
            <TouchableOpacity style={styles.bigButton} onPress={saveCurrentWallet}>
              <Text style={styles.bigButtonText}>{Platform.OS === 'web' ? 'Save (not secure in this web demo)' : 'Save Securely (Device)'}</Text>
            </TouchableOpacity>
            {modalError && <Text style={styles.error}>{modalError}</Text>}
            <TouchableOpacity onPress={() => { setShowSaveModal(false); setModalError(null); setSaveWalletName(''); setSavePassword(''); setSaveConfirmPassword(''); setLogoutAfterSave(false); }}>
              <Text style={modalCloseStyle}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showDownloadModal} transparent animationType="slide" onRequestClose={() => setShowDownloadModal(false)}>
        <View style={modalOverlayStyle}>
          <View style={[modalContentStyle, { paddingBottom: 10 }]}>
            <View style={defiStyles.modalAccent} />
            <Text style={modalTitleStyle}>Download Wallet File</Text>
            <Text style={styles.label}>Password must be at least 8 characters with uppercase, lowercase, number, and special character.</Text>
            <StyledTextInput placeholder="Password" secureTextEntry value={downloadPassword} onChangeText={setDownloadPassword} />
            <Text style={styles.label}>Strength: <Text style={{ color: getPasswordStrength(downloadPassword).level === 1 ? 'red' : getPasswordStrength(downloadPassword).level === 2 ? 'orange' : getPasswordStrength(downloadPassword).level === 3 ? 'blue' : 'green' }}>{getPasswordStrength(downloadPassword).label}</Text></Text>
            <TouchableOpacity style={styles.bigButton} onPress={downloadCurrentWallet}>
              <Text style={styles.bigButtonText}>Download Encrypted File</Text>
            </TouchableOpacity>
            {modalError && <Text style={styles.error}>{modalError}</Text>}
            <TouchableOpacity onPress={() => { setShowDownloadModal(false); setModalError(null); setDownloadPassword(''); }}>
              <Text style={modalCloseStyle}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showSendModal} transparent animationType="slide" onRequestClose={() => setShowSendModal(false)}>
        <View style={modalOverlayStyle}>
          <ScrollView style={modalContentStyle} contentContainerStyle={{ paddingBottom: 50 }}>
            {wallet ? (
              <>
                <View style={defiStyles.modalAccent} />
                <Text style={modalTitleStyle}>Send WART</Text>
                <SpendableBalanceDisplay
                  available={spendableWart}
                  locked={balanceLocked}
                  total={balance}
                  unit="WART"
                  label="Available balance"
                  layout="stack"
                />
                <Text style={styles.label}>To Address (48 chars)</Text>
                <View style={styles.addressContainer}>
                  <View style={styles.addressInput}>
                    <StyledTextInput
                      placeholder="Enter recipient address"
                      value={toAddr}
                      style={styles.inputNoMargin}
                      onChangeText={(value) => {
                        setToAddr(value);
                        if (selectedContact && value !== selectedContact.address) {
                          setSelectedContact(null); // Clear selected contact if address changed manually
                        }
                      }}
                    />
                  </View>
                  <View style={styles.addressButtons}>
                    <TouchableOpacity
                      style={styles.addressButton}
                      onPress={() => setShowQrScanner(true)}
                    >
                      <Text style={styles.contactButtonText}>📷</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.addressButton}
                      onPress={() => setShowAddressBook(true)}
                    >
                      <Text style={styles.contactButtonText}>📇</Text>
                    </TouchableOpacity>
                    {toAddr && isValidAddress(toAddr) && !selectedContact && (
                      <TouchableOpacity
                        style={styles.addressButton}
                        onPress={handleSaveAsContact}
                      >
                        <Text style={styles.saveButtonText}>💾</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
                {selectedContact && (
                  <View style={styles.selectedContact}>
                    <Text style={styles.selectedContactText}>
                      Selected: {selectedContact.name}
                    </Text>
                  </View>
                )}
                <Text style={styles.label}>Amount (WART)</Text>
                <StyledTextInput placeholder="Enter amount to send" value={amount} onChangeText={setAmount} keyboardType="numeric" />
                <TouchableOpacity
                  style={[styles.bigButton, { marginBottom: theme.spacing.sm, opacity: !spendableWart || spendableWart === '0.00000000' ? 0.5 : 1 }]}
                  onPress={handleMaxWart}
                  disabled={!spendableWart || spendableWart === '0.00000000'}
                >
                  <Text style={styles.bigButtonText}>Use available</Text>
                </TouchableOpacity>
                <Text style={styles.label}>Fee (WART)</Text>
                <StyledTextInput placeholder="Transaction fee (default 0.01)" value={fee} onChangeText={setFee} keyboardType="numeric" />
                <Text style={styles.nonceDisplay}>Auto Nonce: {nextNonce}</Text>
                <Text style={styles.label}>Manual Nonce (leave blank for auto)</Text>
                <StyledTextInput placeholder="Optional manual nonce" value={manualNonce} onChangeText={setManualNonce} keyboardType="numeric" />
                <TouchableOpacity
                  style={[styles.bigButton, styles.bigButtonPrimary]}
                  onPress={handleSend}
                  disabled={sending}
                >
                  <Text style={styles.bigButtonPrimaryText}>{sending ? 'Sending…' : 'Send Transaction'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowSendModal(false)}>
                  <Text style={modalCloseStyle}>Close</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={showHistoryModal} transparent animationType="slide" onRequestClose={() => setShowHistoryModal(false)}>
        <View style={modalOverlayStyle}>
          <ScrollView style={modalContentStyle} contentContainerStyle={{ paddingBottom: 50 }}>
            {wallet ? (
              <>
                <View style={defiStyles.modalAccent} />
                <Text style={modalTitleStyle}>Transaction History</Text>
                <View style={modalBlockCounterStyle}>
                  <Text style={modalBlockTextStyle}>Current Block Height: {currentBlockHeight}</Text>
                </View>
                {sentTxLog.length > 0 && (
                  <View style={styles.logSection}>
                    <Text style={styles.sectionTitle}>Sent Transaction Log</Text>
                    <ScrollView style={styles.logList} contentContainerStyle={{ paddingBottom: 20 }}>
                      {sentTxLog.map((hash, index) => (
                        <TouchableOpacity key={index} onPress={() => copyToClipboard(hash, 'Tx Hash')} style={styles.logItem}>
                          <Text style={styles.logText}>{hash}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
                <TransactionHistory
                  address={wallet.address}
                  node={selectedNode}
                  onRefresh={onRefresh}
                  onAddContact={(address) => {
                    setPrefilledAddress(address);
                    setAddressBookMode('select');
                    setShowAddressBook(true);
                  }}
                />
                <TouchableOpacity onPress={() => setShowHistoryModal(false)}>
                  <Text style={modalCloseStyle}>Close</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={showContactsModal} transparent animationType="slide" onRequestClose={() => setShowContactsModal(false)}>
        <View style={modalOverlayStyle}>
          <View style={[modalContentStyle, { paddingBottom: 10 }]}>
            <View style={defiStyles.modalAccent} />
            <Text style={modalTitleStyle}>Contacts</Text>
            <TouchableOpacity
              style={styles.bigButton}
              onPress={() => {
                setAddressBookMode('manage');
                setShowAddressBook(true);
              }}
            >
              <Text style={styles.bigButtonText}>📇 Manage Contacts</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.bigButton}
              onPress={() => {
                setAddressBookMode('select');
                setShowAddressBook(true);
              }}
            >
              <Text style={styles.bigButtonText}>👆 Select Contact for Sending</Text>
            </TouchableOpacity>
            <Text style={[styles.label, { textAlign: 'center', marginTop: theme.spacing.md }]}>
              💡 Tip: You can also add contacts directly from transactions using the 💾 button when entering addresses!
            </Text>
            <TouchableOpacity onPress={() => setShowContactsModal(false)}>
              <Text style={modalCloseStyle}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showWalletOptionsModal} transparent animationType="slide" onRequestClose={() => setShowWalletOptionsModal(false)}>
        <View style={modalOverlayStyle}>
          <View style={[modalContentStyle, styles.walletOptionsModal, { marginBottom: insets.bottom }]}>
            <View style={defiStyles.modalAccent} />
            <View style={{ paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg, paddingBottom: theme.spacing.sm }}>
              <Text style={modalTitleStyle}>Wallet Options</Text>
            </View>
            <ScrollView
              style={{ flexGrow: 0 }}
              contentContainerStyle={styles.walletOptionsScroll}
              showsVerticalScrollIndicator
              nestedScrollEnabled
            >
              <View style={styles.walletOptionsSection}>
                <Text style={styles.walletOptionsSectionTitle}>Network</Text>
                <View style={styles.nodeColumn}>
                  {WARTHOG_NODES.map((n) => (
                    <TouchableOpacity
                      key={n}
                      style={[styles.nodeButton, selectedNode === n && styles.activeButton]}
                      onPress={() => setSelectedNode(n)}
                    >
                      <Text
                        style={[
                          styles.nodeButtonText,
                          selectedNode === n && styles.activeButtonText,
                        ]}
                        numberOfLines={2}
                      >
                        {getNodeLabel(n)}
                      </Text>
                      <Text
                        style={[
                          styles.nodeButtonText,
                          { fontSize: theme.typography.tiny, opacity: 0.7 },
                          selectedNode === n && styles.activeButtonText,
                        ]}
                        numberOfLines={1}
                      >
                        {n}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.walletOptionsSection}>
                <Text style={styles.walletOptionsSectionTitle}>Wallet</Text>
                <View style={styles.walletOptionsActions}>
                  <TouchableOpacity
                    style={styles.bottomButton}
                    onPress={() => {
                      setShowWalletOptionsModal(false);
                      handleLogout();
                      setWalletAction('login');
                    }}
                  >
                    <Text style={styles.bottomButtonText}>Switch Wallet</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.bottomButton}
                    onPress={() => {
                      setShowWalletOptionsModal(false);
                      handleLogout();
                    }}
                  >
                    <Text style={styles.bottomButtonText}>Logout (keep saved)</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.bottomButton}
                    onPress={() => {
                      setShowWalletOptionsModal(false);
                      setShowSaveModal(true);
                    }}
                  >
                    <Text style={styles.bottomButtonText}>Save to Device</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.bottomButton}
                    onPress={() => {
                      setShowWalletOptionsModal(false);
                      handleClearWallet();
                    }}
                  >
                    <Text style={styles.bottomButtonText}>Clear & Delete Saved</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.bottomButton}
                    onPress={() => {
                      setShowWalletOptionsModal(false);
                      setShowDownloadModal(true);
                    }}
                  >
                    <Text style={styles.bottomButtonText}>Download Wallet File</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity onPress={() => setShowWalletOptionsModal(false)}>
                <Text style={modalCloseStyle}>Close</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {wallet && isDefi && (
        <>
          <SendAssetModal
            visible={showSendAssetModal}
            onClose={() => setShowSendAssetModal(false)}
            wallet={wallet}
            selectedNode={selectedNode}
            nextNonce={nextNonce}
            prefill={defi.sendAssetPrefill}
            onPrefillConsumed={() => defi.setSendAssetPrefill(null)}
            onSuccess={afterSpendSuccess}
          />
          <AssetsModal
            visible={showAssetsModal}
            onClose={() => setShowAssetsModal(false)}
            wallet={wallet}
            selectedNode={selectedNode}
            nextNonce={nextNonce}
            onSuccess={afterSpendSuccess}
            onTrackAsset={(hash, name) => defi.addWatchedAsset(hash, name || '')}
          />
          <DexModal
            visible={showDexModal}
            onClose={() => setShowDexModal(false)}
            wallet={wallet}
            selectedNode={selectedNode}
            nextNonce={nextNonce}
            poolPrefill={defi.dexPoolPrefill}
            onPrefillConsumed={() => defi.setDexPoolPrefill(null)}
            onSuccess={afterSpendSuccess}
          />
        </>
      )}

      <AddressBookModal
        visible={showAddressBook}
        mode={addressBookMode}
        onClose={() => setShowAddressBook(false)}
        onSelectContact={handleContactSelect}
        preselectedAddress={toAddr}
        title={addressBookMode === 'manage' ? 'Manage Contacts' : 'Select Recipient'}
      />

      <QrScannerModal
        visible={showQrScanner}
        onClose={() => setShowQrScanner(false)}
        onScan={(address) => {
          setToAddr(address);
          setSelectedContact(null);
        }}
      />

      <QrScannerModal
        visible={showWalletQrScanner}
        mode="wallet"
        onClose={() => setShowWalletQrScanner(false)}
        onScanWallet={(encrypted) => {
          setScannedWalletPayload(encrypted);
          setUploadedFileContent(null);
          setUploadedFileName(null);
          setPassword('');
          setError(null);
        }}
      />

      {wallet ? (
        <AddressQrModal
          visible={showAddressQr}
          address={wallet.address}
          onClose={() => setShowAddressQr(false)}
          onCopy={(address) => copyToClipboard(address, 'Address')}
        />
      ) : null}

      <ToolsModal visible={showToolsModal} onClose={() => setShowToolsModal(false)} />

      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
};

export default Wallet;
