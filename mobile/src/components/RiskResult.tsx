import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts, Glass, RISK_COLORS, Radius, Spacing } from '@/constants/theme';
import { BASE_MODEL_NAMES, sendFeedback, type PredictResponse } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { GlowDivider } from '@/components/ui/GlowDivider';
import { FactorsList } from '@/components/FactorsList';
import { RiskBadge } from '@/components/ui/Badge';
import { RiskGauge } from '@/components/RiskGauge';
import { StarRating } from '@/components/StarRating';

interface RiskResultProps {
  result: PredictResponse;
}

export function RiskResult({ result }: RiskResultProps) {
  const [rating, setRating] = useState(0);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [showTechnical, setShowTechnical] = useState(false);
  const color = RISK_COLORS[result.risk_category] ?? Colors.brand;

  async function handleRate(value: number) {
    setRating(value);
    try {
      await sendFeedback({ prediction_id: result.prediction_id, user_rating: value });
      setFeedbackSent(true);
    } catch {
      // silently ignore — feedback is best-effort
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.gaugeBlock}>
        <RiskGauge
          score={result.flood_risk_score}
          category={result.risk_category}
          animationKey={result.prediction_id}
        />
        <RiskBadge category={result.risk_category} color={color} />
      </View>

      {result.ood_flags.length > 0 && (
        <View style={styles.warning}>
          <Feather name="alert-triangle" size={16} color="#fdba74" style={styles.warningIcon} />
          <Text style={styles.warningText}>
            <Text style={styles.warningBold}>Note: </Text>
            Some inputs are outside the typical range seen in our data — {result.ood_flags.join('; ')}
          </Text>
        </View>
      )}

      {result.ai_report && (
        <Card variant="glass" contentStyle={styles.reportContent}>
          <View style={styles.reportHeader}>
            <View style={styles.reportIconBox}>
              <Feather name="cpu" size={14} color={Colors.brand} />
            </View>
            <Text style={styles.reportLabel}>AI-generated risk report</Text>
          </View>
          <Text style={styles.reportSummary}>{result.ai_report.summary}</Text>
          {result.ai_report.recommendations.map((r, i) => (
            <View key={i} style={styles.bulletRow}>
              <Feather name="arrow-right" size={14} color={Colors.brand} style={styles.bulletIcon} />
              <Text style={styles.bulletText}>{r}</Text>
            </View>
          ))}
        </Card>
      )}

      <View>
        <Text style={styles.sectionTitle}>What influenced this result</Text>
        <Text style={styles.sectionSubtitle}>
          These factors had the biggest impact on the score for this location.
        </Text>
        <FactorsList factors={result.top_factors} />
      </View>

      <Pressable onPress={() => setShowTechnical((v) => !v)} style={styles.detailsToggle}>
        <Feather name={showTechnical ? 'chevron-down' : 'chevron-right'} size={16} color={Colors.brand} />
        <Text style={styles.detailsToggleText}>Technical details</Text>
      </Pressable>
      {showTechnical && (
        <View style={styles.detailsBody}>
          <View style={styles.detailsRow}>
            <Feather name="tag" size={13} color={Colors.textMuted} />
            <Text style={styles.detailsText}>Model version: {result.model_version}</Text>
          </View>
          <View style={styles.detailsRow}>
            <Feather name="zap" size={13} color={Colors.textMuted} />
            <Text style={styles.detailsText}>Response time: {result.latency_ms.toFixed(0)} ms</Text>
          </View>
          <View style={styles.baseModelRow}>
            {Object.entries(result.base_model_scores).map(([k, v]) => (
              <View key={k} style={styles.modelChip}>
                <Text style={styles.modelChipLabel}>{BASE_MODEL_NAMES[k] ?? k.toUpperCase()}</Text>
                <Text style={styles.modelChipValue}>{v.toFixed(3)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <GlowDivider style={styles.feedbackDivider} />
      <View style={styles.feedbackRow}>
        <Text style={styles.feedbackLabel}>Was this helpful? Rate it:</Text>
        <StarRating value={rating} onChange={handleRate} />
        {feedbackSent && (
          <View style={styles.feedbackThanksRow}>
            <Feather name="check-circle" size={14} color={Colors.riskLow} />
            <Text style={styles.feedbackThanks}>Thanks for your feedback!</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.four,
  },
  gaugeBlock: {
    alignItems: 'center',
    gap: Spacing.two + 2,
  },
  warning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two + 2,
    borderWidth: 1,
    borderColor: 'rgba(249,115,22,0.35)',
    backgroundColor: 'rgba(249,115,22,0.12)',
    borderRadius: Radius.md,
    padding: Spacing.three,
  },
  warningIcon: {
    marginTop: 2,
  },
  warningText: {
    flex: 1,
    color: '#fdba74',
    fontFamily: Fonts.regular,
    fontSize: 13,
    lineHeight: 19,
  },
  warningBold: {
    fontFamily: Fonts.extrabold,
  },
  reportContent: {
    gap: Spacing.two + 2,
  },
  reportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  reportIconBox: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(56,189,248,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportLabel: {
    color: Colors.brand,
    fontFamily: Fonts.extrabold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  reportSummary: {
    color: Colors.text,
    fontFamily: Fonts.medium,
    fontSize: 14,
    lineHeight: 21,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  bulletIcon: {
    marginTop: 3,
  },
  bulletText: {
    flex: 1,
    color: Colors.text,
    fontFamily: Fonts.regular,
    fontSize: 13.5,
    lineHeight: 20,
  },
  sectionTitle: {
    color: Colors.text,
    fontFamily: Fonts.extrabold,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: Spacing.one,
  },
  sectionSubtitle: {
    color: Colors.textMuted,
    fontFamily: Fonts.regular,
    fontSize: 12.5,
    lineHeight: 17,
    marginBottom: Spacing.three,
  },
  detailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: Glass.border,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: Radius.md,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
  },
  detailsToggleText: {
    color: Colors.brand,
    fontFamily: Fonts.bold,
    fontSize: 13,
  },
  detailsBody: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.one,
    paddingTop: Spacing.one,
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  detailsText: {
    color: Colors.textMuted,
    fontFamily: Fonts.medium,
    fontSize: 12.5,
  },
  baseModelRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  modelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    borderWidth: 1,
    borderColor: Glass.border,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.one + 2,
  },
  modelChipLabel: {
    color: Colors.textMuted,
    fontFamily: Fonts.semibold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modelChipValue: {
    color: Colors.text,
    fontFamily: Fonts.extrabold,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  feedbackDivider: {
    width: '100%',
    maxWidth: undefined,
  },
  feedbackRow: {
    gap: Spacing.two + 2,
  },
  feedbackLabel: {
    color: Colors.text,
    fontFamily: Fonts.semibold,
    fontSize: 13.5,
  },
  feedbackThanksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
  },
  feedbackThanks: {
    color: Colors.riskLow,
    fontFamily: Fonts.semibold,
    fontSize: 12.5,
  },
});
