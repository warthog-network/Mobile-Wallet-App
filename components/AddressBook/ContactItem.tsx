import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Share,
} from 'react-native';
import { Contact } from '../../types';
import { colors, spacing, borderRadius, typography, shadows } from '../../theme';
import { shortenAddress } from '../../utils/addressValidation';
import { toast } from '../../utils/toast';

type ContactItemMode = 'display' | 'select' | 'manage';

interface ContactItemProps {
  contact: Contact;
  mode?: ContactItemMode;
  onSelect?: (contact: Contact) => void;
  onEdit?: (contact: Contact) => void;
  onDelete?: (contact: Contact) => void;
  onToggleFavorite?: (contact: Contact) => void;
  showActions?: boolean;
  showAvatar?: boolean;
}

export const ContactItem: React.FC<ContactItemProps> = ({
  contact,
  mode = 'display',
  onSelect,
  onEdit,
  onDelete,
  onToggleFavorite,
  showActions = false,
  showAvatar = true,
}) => {
  // Generate avatar color based on contact name
  const avatarColor = useMemo(() => {
    const colors = [
      '#FFC107', // Gold
      '#4CAF50', // Green
      '#2196F3', // Blue
      '#FF9800', // Orange
      '#9C27B0', // Purple
      '#FF4444', // Red
      '#00BCD4', // Cyan
      '#FFEB3B', // Yellow
    ];

    let hash = 0;
    for (let i = 0; i < contact.name.length; i++) {
      hash = contact.name.charCodeAt(i) + ((hash << 5) - hash);
    }

    return colors[Math.abs(hash) % colors.length];
  }, [contact.name]);

  // Generate initials from contact name
  const initials = useMemo(() => {
    const parts = contact.name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return contact.name.trim().substring(0, 2).toUpperCase();
  }, [contact.name]);

  const handleLongPress = () => {
    if (mode === 'display') {
      // Show quick actions on long press
      Alert.alert(
        contact.name,
        `Address: ${contact.address}`,
        [
          { text: 'Copy Address', onPress: handleCopyAddress },
          { text: 'Share Contact', onPress: handleShareContact },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    }
  };

  const handleCopyAddress = async () => {
    // Using Expo Clipboard
    const Clipboard = await import('expo-clipboard');
    await Clipboard.setStringAsync(contact.address);
    toast.success('Copied', 'Address copied to clipboard');
  };

  const handleShareContact = async () => {
    try {
      await Share.share({
        message: `Warthog Wallet Contact\nName: ${contact.name}\nAddress: ${contact.address}`,
      });
    } catch (error) {
      console.error('Error sharing contact:', error);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Contact',
      `Are you sure you want to delete "${contact.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDelete?.(contact) },
      ]
    );
  };

  const renderAvatar = () => {
    if (!showAvatar) return null;

    return (
      <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
        <Text style={styles.avatarText}>{initials}</Text>
        {contact.isFavorite && (
          <View style={styles.favoriteBadge}>
            <Text style={styles.favoriteIcon}>★</Text>
          </View>
        )}
      </View>
    );
  };

  const renderActions = () => {
    if (!showActions && mode !== 'manage') return null;

    return (
      <View style={styles.actions}>
        {onToggleFavorite && (
          <TouchableOpacity
            style={[styles.actionButton, styles.favoriteAction]}
            onPress={() => onToggleFavorite(contact)}
          >
            <Text style={styles.actionText}>
              {contact.isFavorite ? '★' : '☆'}
            </Text>
          </TouchableOpacity>
        )}

        {onEdit && (
          <TouchableOpacity
            style={[styles.actionButton, styles.editAction]}
            onPress={() => onEdit(contact)}
          >
            <Text style={styles.actionText}>Edit</Text>
          </TouchableOpacity>
        )}

        {onDelete && (
          <TouchableOpacity
            style={[styles.actionButton, styles.deleteAction]}
            onPress={handleDelete}
          >
            <Text style={styles.actionText}>Del</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <TouchableOpacity
      style={[
        styles.container,
        mode === 'select' && styles.selectable,
        mode === 'manage' && styles.manageMode,
      ]}
      onPress={() => onSelect?.(contact)}
      onLongPress={handleLongPress}
      activeOpacity={0.7}
    >
      <View style={styles.content}>
        {renderAvatar()}

        <View style={styles.textContainer}>
          <Text style={styles.name} numberOfLines={1}>
            {contact.name}
            {contact.usageCount > 0 && (
              <Text style={styles.usageCount}> ({contact.usageCount})</Text>
            )}
          </Text>

          <Text style={styles.address} numberOfLines={1}>
            {shortenAddress(contact.address)}
          </Text>

          {contact.notes && (
            <Text style={styles.notes} numberOfLines={1}>
              {contact.notes}
            </Text>
          )}

          {contact.lastUsed && (
            <Text style={styles.lastUsed}>
              Last used: {new Date(contact.lastUsed).toLocaleDateString()}
            </Text>
          )}
        </View>

        {renderActions()}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    marginVertical: spacing.xs,
    marginHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.small,
  },

  selectable: {
    borderColor: colors.primary,
  },

  manageMode: {
    paddingRight: spacing.lg, // Extra space for actions
  },

  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },

  avatar: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.round,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
    position: 'relative',
  },

  avatarText: {
    color: colors.surface,
    fontSize: typography.h4,
    fontWeight: typography.bold,
  },

  favoriteBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.round,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },

  favoriteIcon: {
    fontSize: typography.caption,
    color: colors.surface,
  },

  textContainer: {
    flex: 1,
  },

  name: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: typography.semiBold,
    marginBottom: spacing.xs,
  },

  usageCount: {
    color: colors.textMuted,
    fontSize: typography.caption,
  },

  address: {
    color: colors.textSecondary,
    fontSize: typography.bodySm,
    fontFamily: typography.fontFamily.mono,
    marginBottom: spacing.xs,
  },

  notes: {
    color: colors.textMuted,
    fontSize: typography.caption,
    fontStyle: 'italic',
  },

  lastUsed: {
    color: colors.textMuted,
    fontSize: typography.tiny,
    marginTop: spacing.xs,
  },

  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },

  actionButton: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },

  favoriteAction: {
    backgroundColor: colors.primary,
  },

  editAction: {
    backgroundColor: colors.info,
  },

  deleteAction: {
    backgroundColor: colors.error,
  },

  actionText: {
    color: colors.surface,
    fontSize: typography.body,
    fontWeight: typography.bold,
  },
});
