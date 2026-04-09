import { Pressable, Text, StyleSheet, type ViewStyle, type TextStyle } from 'react-native';
import { colors, fontSize, radius, spacing } from '../../lib/theme';

type Variant = 'default' | 'destructive' | 'outline' | 'ghost';
type Size = 'default' | 'sm' | 'lg' | 'icon';

interface ButtonProps {
  readonly children: React.ReactNode;
  readonly onPress?: () => void;
  readonly disabled?: boolean;
  readonly variant?: Variant;
  readonly size?: Size;
}

const variantStyles: Record<Variant, { container: ViewStyle; text: TextStyle }> = {
  default: {
    container: { backgroundColor: colors.primary },
    text: { color: colors.primaryForeground },
  },
  destructive: {
    container: { backgroundColor: colors.destructive },
    text: { color: colors.destructiveForeground },
  },
  outline: {
    container: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.input },
    text: { color: colors.foreground },
  },
  ghost: {
    container: { backgroundColor: 'transparent' },
    text: { color: colors.foreground },
  },
};

const sizeStyles: Record<Size, { container: ViewStyle; text: TextStyle }> = {
  default: { container: { height: 40, paddingHorizontal: spacing.md }, text: { fontSize: fontSize.sm } },
  sm: { container: { height: 36, paddingHorizontal: spacing.sm + 4 }, text: { fontSize: fontSize.sm } },
  lg: { container: { height: 44, paddingHorizontal: spacing.xl }, text: { fontSize: fontSize.sm } },
  icon: { container: { height: 40, width: 40 }, text: { fontSize: fontSize.sm } },
};

export function Button({ children, onPress, disabled, variant = 'default', size = 'default' }: ButtonProps) {
  const v = variantStyles[variant];
  const s = sizeStyles[size];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.base, v.container, s.container, disabled && styles.disabled]}
    >
      {typeof children === 'string' ? (
        <Text style={[styles.text, v.text, s.text]}>{children}</Text>
      ) : (
        children
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  text: {
    fontWeight: '500',
  },
  disabled: {
    opacity: 0.5,
  },
});
