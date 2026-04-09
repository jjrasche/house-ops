import { View, Text, Pressable, Modal, FlatList, StyleSheet } from 'react-native';
import { useState, useCallback } from 'react';
import { colors, fontSize, radius, spacing } from '../../lib/theme';

interface SelectOption {
  readonly value: string;
  readonly label: string;
}

interface SelectProps {
  readonly value: string;
  readonly options: readonly SelectOption[];
  readonly onValueChange: (value: string) => void;
  readonly placeholder?: string;
  readonly disabled?: boolean;
}

export function Select({ value, options, onValueChange, placeholder, disabled }: SelectProps) {
  const [visible, setVisible] = useState(false);

  const selectedLabel = options.find(o => o.value === value)?.label ?? placeholder ?? 'Select...';

  const handleSelect = useCallback((optionValue: string) => {
    onValueChange(optionValue);
    setVisible(false);
  }, [onValueChange]);

  return (
    <>
      <Pressable
        onPress={() => setVisible(true)}
        disabled={disabled}
        style={[styles.trigger, disabled && styles.disabled]}
      >
        <Text style={[styles.triggerText, !value && styles.placeholder]}>{selectedLabel}</Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <Pressable style={styles.overlay} onPress={() => setVisible(false)}>
          <View style={styles.dropdown}>
            <FlatList
              data={options}
              keyExtractor={item => item.value}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => handleSelect(item.value)}
                  style={[styles.option, item.value === value && styles.optionSelected]}
                >
                  <Text style={styles.optionText}>{item.label}</Text>
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    height: 36,
    width: '100%',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.input,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm + 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  triggerText: {
    fontSize: fontSize.sm,
    color: colors.foreground,
  },
  placeholder: {
    color: colors.mutedForeground,
  },
  chevron: {
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
  },
  disabled: {
    opacity: 0.5,
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  dropdown: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    width: '80%',
    maxHeight: 300,
    overflow: 'hidden',
  },
  option: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  optionSelected: {
    backgroundColor: colors.accent,
  },
  optionText: {
    fontSize: fontSize.sm,
    color: colors.foreground,
  },
});
