import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { GradientText } from '@/components/ui/GradientText';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';

interface StatChipProps {
  icon: keyof typeof Feather.glyphMap;
  value: string | number;
  label: string;
}

/** Compact stat card for horizontal scroll strips (Home model snapshot, Dashboard summary). */
export function StatChip({ icon, value, label }: StatChipProps) {
  return (
    <Card variant="glass" style={styles.card} contentStyle={styles.content}>
      <View style={styles.iconBox}>
        <Feather name={icon} size={14} color={Colors.brand} />
      </View>
      <GradientText style={styles.value}>{String(value)}</GradientText>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    minWidth: 130,
  },
  content: {
    gap: Spacing.one,
  },
  iconBox: {
    width: 30,
    height: 30,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(56,189,248,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.half,
  },
  value: {
    fontFamily: Fonts.extrabold,
    fontSize: 22,
    fontVariant: ['tabular-nums'],
  },
  label: {
    color: Colors.textMuted,
    fontFamily: Fonts.semibold,
    fontSize: 10.5,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
});
