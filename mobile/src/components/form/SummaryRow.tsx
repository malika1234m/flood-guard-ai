import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts, Glass, Radius, Spacing } from '@/constants/theme';

interface SummaryRowProps {
  label: string;
  value: string;
  onEdit?: () => void;
}

/** Label + value row with an optional "jump back to this step" edit affordance, used on Predict's Review step. */
export function SummaryRow({ label, value, onEdit }: SummaryRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value} numberOfLines={1}>
          {value}
        </Text>
      </View>
      {onEdit && (
        <Pressable onPress={onEdit} style={styles.edit} hitSlop={8} accessibilityLabel={`Edit ${label}`}>
          <Feather name="edit-2" size={14} color={Colors.brand} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: Glass.border,
    paddingVertical: Spacing.two + 2,
  },
  text: {
    flex: 1,
    gap: Spacing.half,
  },
  label: {
    color: Colors.textMuted,
    fontFamily: Fonts.semibold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  value: {
    color: Colors.text,
    fontFamily: Fonts.bold,
    fontSize: 14.5,
  },
  edit: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(56,189,248,0.10)',
  },
});
