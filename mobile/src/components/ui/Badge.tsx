import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts, RISK_ICONS, Radius, Spacing } from '@/constants/theme';

const RISK_BG: Record<string, string> = {
  Low: 'rgba(34,197,94,0.18)',
  Moderate: 'rgba(234,179,8,0.18)',
  High: 'rgba(249,115,22,0.18)',
  Severe: 'rgba(239,68,68,0.18)',
};

interface RiskBadgeProps {
  category: string;
  color: string;
}

export function RiskBadge({ category, color }: RiskBadgeProps) {
  const icon = RISK_ICONS[category] ?? 'info';

  return (
    <View style={[styles.badge, { backgroundColor: RISK_BG[category] ?? Colors.panel2 }]}>
      <Feather name={icon} size={14} color={color} />
      <Text style={[styles.text, { color }]}>{category} risk</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 13,
    fontFamily: Fonts.extrabold,
    letterSpacing: 0.5,
  },
});
