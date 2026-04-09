import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius, fontSize } from '../../lib/theme';

interface CardProps {
  readonly children: React.ReactNode;
}

export function Card({ children }: CardProps) {
  return <View style={styles.card}>{children}</View>;
}

export function CardHeader({ children }: CardProps) {
  return <View style={styles.header}>{children}</View>;
}

export function CardTitle({ children }: { readonly children: React.ReactNode }) {
  return (
    <Text style={styles.title}>
      {children}
    </Text>
  );
}

export function CardContent({ children }: CardProps) {
  return <View style={styles.content}>{children}</View>;
}

export function CardFooter({ children }: CardProps) {
  return <View style={styles.footer}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    width: '100%',
    maxWidth: 448,
  },
  header: {
    padding: spacing.lg,
    gap: spacing.xs + 2,
  },
  title: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.cardForeground,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.sm + 4,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    paddingTop: 0,
    gap: spacing.sm,
  },
});
