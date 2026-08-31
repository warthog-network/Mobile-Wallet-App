import { useState, useEffect } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Alert } from 'react-native';
import { toast } from '../utils/toast';
import { WalletData, WalletAction } from '../types';
import { SECURE_STORE_KEYS } from '../constants';
import { storage } from '../utils/storage';
import {
  generateWallet,
  deriveWallet,
  importWallet,
  encryptWallet,
  decryptWallet,
  initCrypto,
} from '../utils/crypto';

export const useWallet = () => {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [error, setError] = useState('');
  const [walletAction, setWalletAction] = useState<WalletAction>('login');
  const [walletData, setWalletData] = useState<WalletData>({
    mnemonic: '',
    privateKey: '',
    publicKey: '',
    address: '',
  });
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saveWalletConsent, setSaveWalletConsent] = useState(false);
  const [walletName, setWalletName] = useState('');
  const [currentWalletName, setCurrentWalletName] = useState('');
  const [savedWalletNames, setSavedWalletNames] = useState<string[]>([]);

  useEffect(() => {
    initCrypto();
    loadSavedWalletNames();
  }, []);

  const loadSavedWalletNames = async () => {
    try {
      const namesStr = await storage.getItemAsync(SECURE_STORE_KEYS.walletNames);
      if (!namesStr) return;
      const names = JSON.parse(namesStr) as string[];
      if (Array.isArray(names) && names.length > 0) {
        setSavedWalletNames(names);
        setWalletAction('login');
      }
    } catch (err) {
      console.error('Error loading saved wallet names:', err);
    }
  };

  const persistWalletName = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Wallet name is required');
    if (!savedWalletNames.includes(trimmed)) {
      const updatedNames = [...savedWalletNames, trimmed];
      setSavedWalletNames(updatedNames);
      await storage.setItemAsync(SECURE_STORE_KEYS.walletNames, JSON.stringify(updatedNames));
    }
    setCurrentWalletName(trimmed);
    return trimmed;
  };

  const handleWalletAction = async () => {
    setError('');
    try {
      let newWallet: WalletData;

      switch (walletAction) {
        case 'create':
          if (!password) return setError('Password is required');
          if (password !== confirmPassword) return setError('Passwords do not match');
          newWallet = await generateWallet(12, 'hardened');
          break;

        case 'derive':
          if (!walletData.mnemonic) return setError('Seed phrase is required');
          if (!password) return setError('Password is required');
          if (password !== confirmPassword) return setError('Passwords do not match');
          newWallet = deriveWallet(walletData.mnemonic, 12, 'hardened');
          break;

        case 'import':
          if (!walletData.privateKey) return setError('Private key is required');
          if (!password) return setError('Password is required');
          if (password !== confirmPassword) return setError('Passwords do not match');
          newWallet = importWallet(walletData.privateKey);
          break;

        case 'login': {
          if (!walletName) return setError('Select a saved wallet');
          if (!password) return setError('Password is required');
          const encryptedWallet = await storage.getItemAsync(SECURE_STORE_KEYS.wallet(walletName));
          if (!encryptedWallet) return setError('No wallet found. Please create or import a wallet.');
          newWallet = decryptWallet(encryptedWallet, password);
          setCurrentWalletName(walletName);
          break;
        }

        default:
          return setError('Invalid action');
      }

      setWallet(newWallet);
      setIsLoggedIn(true);

      if ((walletAction === 'create' || walletAction === 'derive' || walletAction === 'import') && saveWalletConsent) {
        const name = walletName.trim() || `wallet-${newWallet.address.slice(0, 8)}`;
        await saveWallet(newWallet, password, name);
      }

      setWalletData({ mnemonic: '', privateKey: '', publicKey: '', address: '' });
      setPassword('');
      setConfirmPassword('');
      setSaveWalletConsent(false);
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    }
  };

  const saveWallet = async (walletToSave: WalletData, walletPassword: string, name: string) => {
    try {
      const trimmed = await persistWalletName(name);
      const encryptedWallet = encryptWallet(walletToSave, walletPassword);
      await storage.setItemAsync(SECURE_STORE_KEYS.wallet(trimmed), encryptedWallet);
    } catch (err: any) {
      console.error('Error saving wallet:', err);
      toast.error('Error', 'Failed to save wallet securely');
    }
  };

  const downloadWallet = async () => {
    if (!wallet) return;
    try {
      const walletJson = JSON.stringify(
        {
          mnemonic: wallet.mnemonic,
          privateKey: wallet.privateKey,
          address: wallet.address,
        },
        null,
        2
      );
      const fileName = `warthog-wallet-${wallet.address.slice(0, 8)}.json`;
      const fileUri = `${FileSystem.documentDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(fileUri, walletJson);
      toast.success('Exported', `Wallet exported to ${fileName}`);
    } catch {
      toast.error('Error', 'Failed to export wallet');
    }
  };

  const handleLogout = () => {
    setWallet(null);
    setIsLoggedIn(false);
    setCurrentWalletName('');
    setPassword('');
    setError('');
  };

  const handleClearWallet = async () => {
    if (!currentWalletName) {
      toast.error('Error', 'No saved wallet selected to clear');
      return;
    }

    Alert.alert(
      'Clear Wallet',
      'Are you sure you want to remove the saved wallet? Make sure you have a backup!',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await storage.deleteItemAsync(SECURE_STORE_KEYS.wallet(currentWalletName));
              const updatedNames = savedWalletNames.filter((name) => name !== currentWalletName);
              setSavedWalletNames(updatedNames);
              await storage.setItemAsync(SECURE_STORE_KEYS.walletNames, JSON.stringify(updatedNames));
              handleLogout();
              setWalletAction(updatedNames.length > 0 ? 'login' : 'create');
            } catch {
              toast.error('Error', 'Failed to clear wallet');
            }
          },
        },
      ]
    );
  };

  const pickAndLoginFromFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: false,
      });
      if (!result.canceled && result.assets?.[0]) {
        await loginFromFile(result.assets[0].uri);
      }
    } catch {
      toast.error('Error', 'Failed to pick file');
    }
  };

  const loginFromFile = async (fileUri: string) => {
    try {
      const fileContent = await FileSystem.readAsStringAsync(fileUri);
      const walletJson = JSON.parse(fileContent);

      if (!walletJson.mnemonic && !walletJson.privateKey) {
        toast.error('Error', 'Invalid wallet file format');
        return;
      }

      const importedWallet = walletJson.mnemonic
        ? deriveWallet(walletJson.mnemonic, 12, 'hardened')
        : importWallet(walletJson.privateKey);

      setWallet(importedWallet);
      setIsLoggedIn(true);
    } catch {
      toast.error('Error', 'Failed to import wallet from file');
    }
  };

  return {
    wallet,
    isLoggedIn,
    error,
    walletAction,
    walletData,
    password,
    confirmPassword,
    saveWalletConsent,
    walletName,
    currentWalletName,
    savedWalletNames,
    setError,
    setWalletAction,
    setWalletData,
    setPassword,
    setConfirmPassword,
    setSaveWalletConsent,
    setWalletName,
    handleWalletAction,
    saveWallet,
    downloadWallet,
    loadSavedWalletNames,
    handleLogout,
    handleClearWallet,
    pickAndLoginFromFile,
    loginFromFile,
  };
};