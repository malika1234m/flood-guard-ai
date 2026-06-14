import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts, Gradients, Radius, Spacing } from '@/constants/theme';
import { factorLabel, type FeatureContribution } from '@/lib/api';

interface FactorsListProps {
  factors: FeatureContribution[];
}

export function FactorsList({ factors }: FactorsListProps) {
  const max = Math.max(...factors.map((f) => f.importance), 1);

  return (
    <View style={styles.wrap}>
      {factors.map((f, i) => {
        const pct = Math.max(4, Math.round((f.importance / max) * 100));
        return (
          <View key={`${f.feature}-${i}`} style={styles.row}>
            <View style={styles.rank}>
              <Text style={styles.rankText}>{i + 1}</Text>
            </View>
            <View style={styles.body}>
              <View style={styles.labelRow}>
                <Text style={styles.label} numberOfLines={2}>
                  {factorLabel(f.feature)}
                </Text>
                <Text style={styles.pct}>{pct}%</Text>
              </View>
              <View style={styles.track}>
                <LinearGradient
                  colors={Gradients.brand}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.fill, { width: `${pct}%` }]}
                />
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.two + 2,
    alignItems: 'flex-start',
  },
  rank: {
    width: 22,
    height: 22,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(56,189,248,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  rankText: {
    color: Colors.brand,
    fontFamily: Fonts.extrabold,
    fontSize: 11,
  },
  body: {
    flex: 1,
    gap: Spacing.one + 2,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  label: {
    flex: 1,
    color: Colors.text,
    fontFamily: Fonts.semibold,
    fontSize: 13,
    lineHeight: 18,
  },
  pct: {
    color: Colors.textMuted,
    fontFamily: Fonts.bold,
    fontSize: 11.5,
    fontVariant: ['tabular-nums'],
  },
  track: {
    height: 7,
    borderRadius: Radius.full,
    backgroundColor: Colors.panel2,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: Radius.full,
  },
});
