import { View, Text, StyleSheet, type ViewStyle, type TextStyle } from 'react-native';
import { colors, fontSize, radius } from '../../lib/theme';

type Variant = 'default' | 'secondary' | 'destructive' | 'outline';

interface BadgeProps {
  readonly children: React.ReactNode;
  readonly variant?: Variant;
}

const variantStyles: Record<Variant, { container: ViewStyle; text: TextStyle }> = {
  default: {
    container: { backgroundColor: colors.primary },
    text: { color: colors.primaryForeground },
  },
  secondary: {
    container: { backgroundColor: colors.secondary },
    text: { color: colors.secondaryForeground },
  },
  destructive: {
    container: { backgroundColor: colors.destructive },
    text: { color: colors.destructiveForeground },
  },
  outline: {
    container: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
    text: { color: colors.foreground },
  },
};

export function Badge({ children, variant = 'default' }: BadgeProps) {
  const v = variantStyles[variant];
  return (
    <View style={[styles.badge, v.container]}>
      <Text style={[styles.text, v.text]}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  text: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
});
