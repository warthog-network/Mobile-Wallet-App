import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { defiColors } from './defi/defiStyles';
import { theme } from '../theme';

export type SelectDropdownOption<T extends string = string> = {
  id: T;
  label: string;
};

interface Props<T extends string> {
  value: T;
  options: SelectDropdownOption<T>[];
  onChange: (id: T) => void;
  placeholder?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

function SelectDropdown<T extends string>({
  value,
  options,
  onChange,
  placeholder = 'Select',
  accessibilityLabel,
  style,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(
    () => options.find((opt) => opt.id === value),
    [options, value],
  );

  return (
    <View style={style}>
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel || placeholder}
        accessibilityState={{ expanded: open }}
      >
        <Text style={styles.triggerText} numberOfLines={1}>
          {selected?.label || placeholder}
        </Text>
        <Text style={styles.chevron}>▾</Text>
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable style={styles.menu} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.menuTitle}>{placeholder}</Text>
            <ScrollView style={styles.menuScroll} nestedScrollEnabled>
              {options.map((opt) => {
                const active = opt.id === value;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[styles.option, active && styles.optionActive]}
                    onPress={() => {
                      onChange(opt.id);
                      setOpen(false);
                    }}
                    accessibilityRole="menuitem"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.optionText, active && styles.optionTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: 'rgba(39, 39, 42, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(82, 82, 91, 0.5)',
    minHeight: 32,
  },
  triggerText: {
    color: defiColors.textSecondary,
    fontSize: theme.typography.caption,
    fontWeight: theme.typography.semiBold,
    flexShrink: 1,
  },
  chevron: {
    color: defiColors.textMuted,
    fontSize: 12,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  menu: {
    backgroundColor: defiColors.bgCard,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: defiColors.border,
    padding: theme.spacing.md,
    maxHeight: '70%',
  },
  menuTitle: {
    color: defiColors.textMuted,
    fontSize: 11,
    fontWeight: theme.typography.semiBold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: theme.spacing.sm,
  },
  menuScroll: {
    maxHeight: 360,
  },
  option: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: 'transparent',
    marginBottom: 4,
  },
  optionActive: {
    backgroundColor: 'rgba(231, 147, 0, 0.14)',
    borderColor: 'rgba(231, 147, 0, 0.55)',
  },
  optionText: {
    color: defiColors.textSecondary,
    fontSize: theme.typography.bodySm,
    fontWeight: theme.typography.semiBold,
  },
  optionTextActive: {
    color: defiColors.gold,
  },
});

export default SelectDropdown;
