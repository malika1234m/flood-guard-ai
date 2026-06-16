import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts, Glass, Gradients, RISK_COLORS, RISK_ICONS, Radius, Shadows, Spacing } from '@/constants/theme';
import { getModelInfo, predict, type DistrictProfile, type PredictResponse } from '@/lib/api';
import { getCurrentPosition, nearestDistrict } from '@/lib/geo';
import { PulseDot } from './PulseDot';

type Phase = 'idle' | 'locating' | 'scoring' | 'done' | 'error';

interface RiskResult {
  district: string;
  distanceKm: number;
  profile: DistrictProfile;
  prediction: PredictResponse;
}

const STEP_LABELS: Record<Phase, string> = {
  idle: 'Initialising…',
  locating: 'Step 1 of 2 · Detecting your location…',
  scoring: 'Step 2 of 2 · Running AI risk model…',
  done: '',
  error: '',
};

export function LiveRiskCard() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<RiskResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  // Animated score bar
  const scoreAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    run();
  }, []);

  useEffect(() => {
    if (phase === 'done' && result) {
      Animated.timing(scoreAnim, {
        toValue: result.prediction.flood_risk_score,
        duration: 1100,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    }
  }, [phase, result]);

  async function run() {
    setPhase('locating');
    setError(null);
    try {
      const pos = await getCurrentPosition();
      if (!pos) {
        setError('Location permission denied — tap to retry');
        setPhase('error');
        return;
      }
      setPhase('scoring');
      const info = await getModelInfo();
      const match = nearestDistrict(pos.latitude, pos.longitude, info.district_profiles);
      if (!match) {
        setError('Could not match a Sri Lanka district to your location');
        setPhase('error');
        return;
      }
      const pred = await predict({
        ...match.profile,
        district: match.district,
        latitude: pos.latitude,
        longitude: pos.longitude,
        include_ai_report: false,
      });
      setResult({ district: match.district, distanceKm: match.distanceKm, profile: match.profile, prediction: pred });
      setPhase('done');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Assessment failed');
      setPhase('error');
    }
  }

  function retry() {
    scoreAnim.setValue(0);
    setResult(null);
    started.current = false;
    run();
  }

  const riskColor = result ? (RISK_COLORS[result.prediction.risk_category] ?? Colors.brand) : Colors.brand;
  const riskIcon = result ? (RISK_ICONS[result.prediction.risk_category] ?? 'droplet') : 'droplet';

  /* ── Loading state ── */
  if (phase === 'idle' || phase === 'locating' || phase === 'scoring') {
    return (
      <View style={styles.card}>
        <LinearGradient
          colors={['rgba(56,189,248,0.06)', 'rgba(99,102,241,0.03)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.loadingRow}>
          <View style={styles.loadingSpinner}>
            <PulseDot color={Colors.brand} size={8} />
          </View>
          <View style={styles.loadingText}>
            <Text style={styles.loadingLabel}>AI Risk Preview</Text>
            <Text style={styles.loadingStep}>{STEP_LABELS[phase]}</Text>
          </View>
        </View>
        {/* shimmer bars */}
        <View style={styles.shimmer} />
        <View style={[styles.shimmer, { width: '60%' }]} />
      </View>
    );
  }

  /* ── Error state ── */
  if (phase === 'error') {
    return (
      <View style={[styles.card, styles.errorCard]}>
        <View style={styles.errorRow}>
          <View style={styles.errorIconBox}>
            <Feather name="alert-triangle" size={16} color={Colors.riskHigh} />
          </View>
          <Text style={styles.errorText} numberOfLines={2}>{error ?? 'Location unavailable'}</Text>
        </View>
        <Pressable style={styles.retryBtn} onPress={retry}>
          <Feather name="refresh-cw" size={13} color={Colors.brand} />
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (!result) return null;

  const gaugeWidth = scoreAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  /* ── Done state ── */
  return (
    <View style={[styles.card, { borderColor: `${riskColor}30` }]}>
      {/* background gradient */}
      <LinearGradient
        colors={[`${riskColor}0d`, 'rgba(11,19,32,0.5)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* risk-color accent bar on left */}
      <View style={[styles.accentBar, { backgroundColor: riskColor }]} />

      {/* ── Header row ── */}
      <View style={styles.header}>
        <View style={styles.liveChip}>
          <PulseDot color={riskColor} size={6} />
          <Text style={[styles.liveChipText, { color: riskColor }]}>Live · AI Risk Preview</Text>
        </View>
        <Text style={styles.distanceTag}>{result.distanceKm.toFixed(0)} km away</Text>
      </View>

      {/* ── District + category ── */}
      <View style={styles.districtRow}>
        <View style={styles.riskIconBox}>
          <LinearGradient colors={[`${riskColor}30`, `${riskColor}10`]} style={styles.riskIconGrad}>
            <Feather name={riskIcon} size={18} color={riskColor} />
          </LinearGradient>
        </View>
        <View style={styles.districtInfo}>
          <Text style={styles.eyebrow}>Nearest district</Text>
          <Text style={styles.districtName}>{result.district}</Text>
        </View>
        <View style={[styles.categoryBadge, { backgroundColor: `${riskColor}22`, borderColor: `${riskColor}40` }]}>
          <Text style={[styles.categoryText, { color: riskColor }]}>
            {result.prediction.risk_category} Risk
          </Text>
        </View>
      </View>

      {/* ── Score bar ── */}
      <View style={styles.scoreSection}>
        <View style={styles.scoreHeader}>
          <Text style={styles.scoreLabel}>Flood Risk Score</Text>
          <Text style={[styles.scoreValue, { color: riskColor }]}>
            {result.prediction.flood_risk_score.toFixed(3)}
          </Text>
        </View>
        <View style={styles.gaugeTrack}>
          <Animated.View
            style={[styles.gaugeFill, { width: gaugeWidth, backgroundColor: riskColor }]}
          />
          {/* scale ticks */}
          {[0.25, 0.5, 0.75].map((tick) => (
            <View key={tick} style={[styles.gaugeTick, { left: `${tick * 100}%` }]} />
          ))}
        </View>
        <View style={styles.scaleLabels}>
          <Text style={styles.scaleLabel}>Low</Text>
          <Text style={styles.scaleLabel}>Moderate</Text>
          <Text style={styles.scaleLabel}>High</Text>
          <Text style={styles.scaleLabel}>Severe</Text>
        </View>
      </View>

      {/* ── Stats 2×2 grid ── */}
      <View style={styles.statsGrid}>
        <StatCell icon="cloud-rain" value={`${result.profile.rainfall_7d_mm} mm`} label="7-day rainfall" />
        <StatCell icon="trending-up" value={`${result.profile.elevation_m} m`} label="Elevation" />
        <StatCell icon="shield" value={result.profile.infrastructure_score.toFixed(2)} label="Infrastructure" />
        <StatCell icon="activity" value={String(Math.round(result.profile.historical_flood_count))} label="Flood history" />
      </View>

      {/* ── CTA row ── */}
      <View style={styles.ctaRow}>
        <Pressable
          style={styles.ctaBtn}
          onPress={() => router.push({ pathname: '/predict', params: { district: result.district } })}
        >
          <Text style={styles.ctaBtnText}>Full assessment for {result.district}</Text>
          <Feather name="arrow-right" size={13} color={Colors.brand} />
        </Pressable>
        <Pressable style={styles.rescanBtn} onPress={retry}>
          <Feather name="refresh-cw" size={13} color={Colors.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}

function StatCell({ icon, value, label }: { icon: keyof typeof Feather.glyphMap; value: string; label: string }) {
  return (
    <View style={styles.statCell}>
      <Feather name={icon} size={12} color={Colors.brand} style={styles.statIcon} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.15)',
    backgroundColor: Glass.bg,
    overflow: 'hidden',
    padding: Spacing.three,
    gap: Spacing.two,
    ...Shadows.card,
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderTopLeftRadius: Radius.xl,
    borderBottomLeftRadius: Radius.xl,
  },
  errorCard: {
    borderColor: `${Colors.riskHigh}30`,
    gap: Spacing.two,
  },

  /* Loading */
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingLeft: Spacing.one,
  },
  loadingSpinner: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    flex: 1,
    gap: 3,
  },
  loadingLabel: {
    color: Colors.text,
    fontFamily: Fonts.semibold,
    fontSize: 13,
  },
  loadingStep: {
    color: Colors.textMuted,
    fontFamily: Fonts.regular,
    fontSize: 11,
  },
  shimmer: {
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.06)',
    width: '85%',
  },

  /* Error */
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  errorIconBox: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    backgroundColor: `${Colors.riskHigh}18`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    flex: 1,
    color: Colors.textMuted,
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 17,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(56,189,248,0.10)',
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.25)',
  },
  retryText: {
    color: Colors.brand,
    fontFamily: Fonts.semibold,
    fontSize: 12,
  },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: Spacing.one,
  },
  liveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  liveChipText: {
    fontFamily: Fonts.semibold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  distanceTag: {
    color: Colors.textMuted,
    fontFamily: Fonts.medium,
    fontSize: 10,
  },

  /* District row */
  districtRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingLeft: Spacing.one,
  },
  riskIconBox: {
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  riskIconGrad: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
  },
  districtInfo: {
    flex: 1,
  },
  eyebrow: {
    color: Colors.textMuted,
    fontFamily: Fonts.medium,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  districtName: {
    color: Colors.text,
    fontFamily: Fonts.bold,
    fontSize: 20,
    lineHeight: 24,
  },
  categoryBadge: {
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  categoryText: {
    fontFamily: Fonts.bold,
    fontSize: 11,
  },

  /* Score bar */
  scoreSection: {
    gap: 6,
    paddingLeft: Spacing.one,
  },
  scoreHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  scoreLabel: {
    color: Colors.textMuted,
    fontFamily: Fonts.medium,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  scoreValue: {
    fontFamily: Fonts.extrabold,
    fontSize: 22,
  },
  gaugeTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.07)',
    overflow: 'hidden',
    position: 'relative',
  },
  gaugeFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    borderRadius: 4,
  },
  gaugeTick: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  scaleLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  scaleLabel: {
    color: Colors.textMuted,
    fontFamily: Fonts.regular,
    fontSize: 8,
    letterSpacing: 0.3,
  },

  /* Stats */
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
    paddingLeft: Spacing.one,
  },
  statCell: {
    width: '48%',
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderRadius: Radius.sm,
    padding: Spacing.two,
    gap: 2,
  },
  statIcon: {
    marginBottom: 1,
  },
  statValue: {
    color: Colors.text,
    fontFamily: Fonts.bold,
    fontSize: 13,
  },
  statLabel: {
    color: Colors.textMuted,
    fontFamily: Fonts.regular,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },

  /* CTA */
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingLeft: Spacing.one,
    paddingTop: Spacing.one,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  ctaBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  ctaBtnText: {
    color: Colors.brand,
    fontFamily: Fonts.semibold,
    fontSize: 12,
  },
  rescanBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
