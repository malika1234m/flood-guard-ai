import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, Polygon, RadialGradient, Stop } from 'react-native-svg';

import { Colors, Fonts, RISK_COLORS, Radius, Spacing } from '@/constants/theme';
import { getDistrictRisks, getModelInfo, type DistrictProfile, type DistrictRisk } from '@/lib/api';

const ISLAND_POINTS =
  '23,99 24,87 35,70 39,50 36,32 58,21 80,17 93,24 99,38 99,65 142,73 153,99 173,127 187,140 200,164 221,199 238,225 253,268 252,314 246,343 232,367 194,387 176,384 117,405 111,401 77,392 59,377 52,348 37,305 38,278 35,195 34,149 27,112';

const RISK_ORDER = ['Severe', 'High', 'Moderate', 'Low'] as const;

const RISK_FILL: Record<string, string> = {
  Low: Colors.riskLow,
  Moderate: Colors.riskModerate,
  High: Colors.riskHigh,
  Severe: Colors.riskSevere,
};

function project(lat: number, lon: number): [number, number] {
  const x = 10 + ((lon - 79.6) / 2.4) * 260;
  const y = 10 + ((9.9 - lat) / 4.03) * 400;
  return [x, y];
}

function districtRadius(score: number): number {
  return 5 + score * 6; // 5 → 11 based on risk
}

export function SriLankaMap() {
  const [risks, setRisks] = useState<DistrictRisk[]>([]);
  const [profiles, setProfiles] = useState<Record<string, DistrictProfile> | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getDistrictRisks(), getModelInfo()])
      .then(([r, info]) => {
        setRisks(r);
        setProfiles(info.district_profiles);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const riskMap = Object.fromEntries(risks.map((r) => [r.district, r]));
  const selectedRisk = selected ? riskMap[selected] : null;

  const categoryCounts = risks.reduce<Record<string, number>>((acc, r) => {
    acc[r.category] = (acc[r.category] ?? 0) + 1;
    return acc;
  }, {});

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={Colors.brand} size="small" />
        <Text style={styles.loadingText}>Scoring all 25 districts…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ── Header ── */}
      <View style={styles.mapHeader}>
        <Text style={styles.mapTitle}>Live Risk Map · Sri Lanka</Text>
        <Text style={styles.mapSubtitle}>
          {risks.length} districts · tap to inspect
        </Text>
      </View>

      {/* ── SVG Map ── */}
      <Svg
        width="100%"
        viewBox="0 0 280 420"
        style={styles.svg}
      >
        <Defs>
          <RadialGradient id="ocean" cx="50%" cy="50%" r="60%">
            <Stop offset="0%" stopColor="rgba(56,189,248,0.07)" />
            <Stop offset="100%" stopColor="rgba(56,189,248,0)" />
          </RadialGradient>
        </Defs>

        {/* ocean */}
        <Circle cx={140} cy={210} r={230} fill="url(#ocean)" />

        {/* island silhouette */}
        <Polygon
          points={ISLAND_POINTS}
          fill="rgba(56,189,248,0.055)"
          stroke="rgba(56,189,248,0.2)"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />

        {/* district bubbles — sorted ascending so high-risk renders on top */}
        {profiles &&
          [...Object.entries(profiles)]
            .sort(([a], [b]) => (riskMap[a]?.score ?? 0) - (riskMap[b]?.score ?? 0))
            .map(([district, profile]) => {
              const [x, y] = project(profile.latitude, profile.longitude);
              const risk = riskMap[district];
              const fill = risk ? (RISK_FILL[risk.category] ?? Colors.brand) : 'rgba(56,189,248,0.3)';
              const r = risk ? districtRadius(risk.score) : 6;
              const isSelected = selected === district;

              return (
                <G
                  key={district}
                  onPress={() => setSelected((s) => (s === district ? null : district))}
                >
                  {/* selection ring */}
                  {isSelected && (
                    <Circle
                      cx={x}
                      cy={y}
                      r={r + 4}
                      fill="none"
                      stroke={fill}
                      strokeWidth={1.5}
                      opacity={0.5}
                    />
                  )}
                  {/* main bubble */}
                  <Circle
                    cx={x}
                    cy={y}
                    r={isSelected ? r + 2 : r}
                    fill={fill}
                    opacity={isSelected ? 1 : 0.82}
                    stroke={isSelected ? '#fff' : 'rgba(0,0,0,0.25)'}
                    strokeWidth={isSelected ? 1.5 : 0.5}
                  />
                </G>
              );
            })}
      </Svg>

      {/* ── Selected district info panel ── */}
      {selected && selectedRisk && (
        <View
          style={[
            styles.selectedPanel,
            {
              borderColor: `${RISK_FILL[selectedRisk.category] ?? Colors.brand}40`,
              backgroundColor: `${RISK_FILL[selectedRisk.category] ?? Colors.brand}0d`,
            },
          ]}
        >
          <View style={styles.selectedLeft}>
            <Text style={styles.selectedName}>{selected}</Text>
            <View style={styles.selectedScoreRow}>
              <Text style={styles.selectedScoreLabel}>Score</Text>
              <Text style={[styles.selectedScore, { color: RISK_FILL[selectedRisk.category] ?? Colors.brand }]}>
                {selectedRisk.score.toFixed(3)}
              </Text>
            </View>
          </View>
          <View
            style={[
              styles.selectedBadge,
              {
                backgroundColor: `${RISK_FILL[selectedRisk.category] ?? Colors.brand}22`,
                borderColor: `${RISK_FILL[selectedRisk.category] ?? Colors.brand}40`,
              },
            ]}
          >
            <Text style={[styles.selectedBadgeText, { color: RISK_FILL[selectedRisk.category] ?? Colors.brand }]}>
              {selectedRisk.category} Risk
            </Text>
          </View>
          <Pressable onPress={() => setSelected(null)} style={styles.dismissBtn}>
            <Text style={styles.dismissText}>✕</Text>
          </Pressable>
        </View>
      )}

      {/* ── Category count strip ── */}
      <View style={styles.legend}>
        {RISK_ORDER.filter((cat) => categoryCounts[cat]).map((cat) => (
          <View key={cat} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: RISK_FILL[cat] }]} />
            <Text style={[styles.legendLabel, { color: RISK_FILL[cat] }]}>{cat}</Text>
            <Text style={styles.legendCount}>{categoryCounts[cat]}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  loading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.four,
  },
  loadingText: {
    color: Colors.textMuted,
    fontFamily: Fonts.regular,
    fontSize: 13,
  },

  /* Header */
  mapHeader: {
    gap: 2,
  },
  mapTitle: {
    color: Colors.text,
    fontFamily: Fonts.bold,
    fontSize: 14,
  },
  mapSubtitle: {
    color: Colors.textMuted,
    fontFamily: Fonts.regular,
    fontSize: 11,
  },

  /* SVG */
  svg: {
    width: '100%',
    aspectRatio: 280 / 420,
  },

  /* Selected panel */
  selectedPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.two,
  },
  selectedLeft: {
    flex: 1,
    gap: 2,
  },
  selectedName: {
    color: Colors.text,
    fontFamily: Fonts.bold,
    fontSize: 15,
  },
  selectedScoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  selectedScoreLabel: {
    color: Colors.textMuted,
    fontFamily: Fonts.regular,
    fontSize: 10,
    textTransform: 'uppercase',
  },
  selectedScore: {
    fontFamily: Fonts.extrabold,
    fontSize: 18,
  },
  selectedBadge: {
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  selectedBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: 11,
  },
  dismissBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissText: {
    color: Colors.textMuted,
    fontSize: 13,
  },

  /* Legend */
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    justifyContent: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  legendLabel: {
    fontFamily: Fonts.semibold,
    fontSize: 10,
  },
  legendCount: {
    color: Colors.textMuted,
    fontFamily: Fonts.regular,
    fontSize: 10,
  },
});
