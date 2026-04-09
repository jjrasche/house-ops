import { TextInput, StyleSheet, type TextInputProps } from 'react-native';
import { colors, fontSize, radius, spacing } from '../../lib/theme';

interface InputProps extends TextInputProps {
  readonly disabled?: boolean;
}

export function Input({ disabled, style, ...props }: InputProps) {
  return (
    <TextInput
      editable={!disabled}
      style={[styles.input, disabled && styles.disabled, style]}
      placeholderTextColor={colors.mutedForeground}
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    height: 36,
    width: '100%',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.input,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm + 4,
    fontSize: fontSize.sm,
    color: colors.foreground,
  },
  disabled: {
    opacity: 0.5,
  },
});
