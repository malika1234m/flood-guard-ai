import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { Colors, Fonts, Glass, Gradients, Radius, Spacing } from '@/constants/theme';

interface SegmentedTabsOption {
  key: string;
  label: string;
  icon?: keyof typeof Feather.glyphMap;
}

interface SegmentedTabsProps {
  options: SegmentedTabsOption[];
  value: string;
  onChange: (key: string) => void;
}

/** Horizontally-scrollable pill switcher, used for Dashboard's chart view selector. */
export function SegmentedTabs({ options, value, onChange }: SegmentedTabsProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {options.map((opt) => {
        const active = opt.key === value;
        return (
          <Pressable key={opt.key} onPress={() => onChange(opt.key)}>
            {active ? (
              <LinearGradient colors={Gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.pill}>
                {opt.icon && <Feather name={opt.icon} size={14} color="#04101f" />}
                <Text style={[styles.label, styles.labelActive]}>{opt.label}</Text>
              </LinearGradient>
            ) : (
              <Pressable style={[styles.pill, styles.pillInactive]} onPress={() => onChange(opt.key)}>
                {opt.icon && <Feather name={opt.icon} size={14} color={Colors.textMuted} />}
                <Text style={styles.label}>{opt.label}</Text>
              </Pressable>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    borderRadius: Radius.full,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  pillInactive: {
    borderWidth: 1,
    borderColor: Glass.border,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  label: {
    color: Colors.textMuted,
    fontFamily: Fonts.bold,
    fontSize: 12.5,
  },
  labelActive: {
    color: '#04101f',
  },
});
