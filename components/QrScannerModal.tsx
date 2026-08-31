import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { parseAddressFromQr } from '../utils/addressQr';
import { parseWalletQrPayload } from '../utils/walletQr';
import { defiColors } from './defi/defiStyles';
import { theme } from '../theme';
import { toast } from '../utils/toast';

export type QrScanMode = 'address' | 'wallet';

interface Props {
  visible: boolean;
  onClose: () => void;
  mode?: QrScanMode;
  onScan?: (address: string) => void;
  onScanWallet?: (encryptedPayload: string) => void;
  title?: string;
  hint?: string;
}

const QrScannerModal: React.FC<Props> = ({
  visible,
  onClose,
  mode = 'address',
  onScan,
  onScanWallet,
  title,
  hint,
}) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    if (visible) setScanned(false);
  }, [visible]);

  useEffect(() => {
    if (!visible || permission?.granted) return;
    requestPermission();
  }, [visible, permission?.granted, requestPermission]);

  const resolvedTitle = title ?? (mode === 'wallet' ? 'Scan Wallet QR' : 'Scan Address QR');
  const resolvedHint = hint ?? (
    mode === 'wallet'
      ? 'Scan the encrypted wallet QR from wartbunker (Tools → Mobile Transfer)'
      : 'Point your camera at a Warthog address QR code'
  );

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);

    if (mode === 'wallet') {
      const encrypted = parseWalletQrPayload(data);
      if (!encrypted) {
        toast.error('Invalid QR', 'Not a wallet export QR. Generate one in WartBunker under Tools → Mobile Transfer.');
        setScanned(false);
        return;
      }
      onScanWallet?.(encrypted);
      onClose();
      return;
    }

    const address = parseAddressFromQr(data);
    if (!address) {
      toast.error('Invalid QR', 'Scanned code is not a valid Warthog address');
      setScanned(false);
      return;
    }

    onScan?.(address);
    onClose();
  };

  const renderBody = () => {
    if (!permission) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator color={defiColors.gold} size="large" />
        </View>
      );
    }

    if (!permission.granted) {
      return (
        <View style={styles.centered}>
          <Text style={styles.message}>Camera access is required to scan QR codes.</Text>
          <TouchableOpacity style={styles.actionBtn} onPress={requestPermission}>
            <Text style={styles.actionBtnText}>Allow Camera</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
      />
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{resolvedTitle}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.close}>Close</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.scannerWrap}>
          {renderBody()}
          <View style={styles.frame} pointerEvents="none" />
        </View>

        <Text style={styles.hint}>{resolvedHint}</Text>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: defiColors.bg,
    paddingTop: theme.spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.h3,
    fontWeight: theme.typography.bold,
  },
  close: {
    color: defiColors.goldHover,
    fontSize: theme.typography.bodySm,
    fontWeight: theme.typography.semiBold,
  },
  scannerWrap: {
    flex: 1,
    marginHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: defiColors.border,
    backgroundColor: defiColors.bgCard,
  },
  camera: {
    flex: 1,
  },
  frame: {
    ...StyleSheet.absoluteFillObject,
    margin: theme.spacing.xl,
    borderWidth: 2,
    borderColor: defiColors.gold,
    borderRadius: theme.borderRadius.md,
    opacity: 0.85,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  message: {
    color: defiColors.textSecondary,
    fontSize: theme.typography.bodySm,
    textAlign: 'center',
    lineHeight: 20,
  },
  actionBtn: {
    backgroundColor: defiColors.goldHover,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
  },
  actionBtnText: {
    color: '#fff',
    fontWeight: theme.typography.semiBold,
    fontSize: theme.typography.bodySm,
  },
  hint: {
    color: defiColors.textMuted,
    fontSize: theme.typography.caption,
    textAlign: 'center',
    padding: theme.spacing.lg,
  },
});

export default QrScannerModal;