import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuroraBackground } from '@/components/ui/AuroraBackground';
import { BrandMark } from '@/components/ui/BrandMark';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Carousel } from '@/components/ui/Carousel';
import { GlowDivider } from '@/components/ui/GlowDivider';
import { GradientText } from '@/components/ui/GradientText';
import { PulseDot } from '@/components/ui/PulseDot';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { StatChip } from '@/components/ui/StatChip';
import { Colors, Fonts, Glass, Gradients, Radius, Shadows, Spacing } from '@/constants/theme';
import { getModelInfo, type ModelInfo } from '@/lib/api';

const STEPS = [
  {
    title: 'Describe a location',
    description:
      'Tell us about the geography, climate, land cover, infrastructure, and community of a location — or start from typical values and adjust what you know.',
  },
  {
    title: 'Compared with historical records',
    description:
      'Your inputs are checked against decades of district-level rainfall, terrain, and flood-history data.',
  },
  {
    title: 'Multi-model risk score',
    description:
      'Several machine-learning models analyze the data independently and combine into one calibrated risk score from 0 to 1.',
  },
  {
    title: 'AI risk report & monitoring',
    description:
      'An AI advisor explains the score and leading factors in plain language, with recommended next steps.',
  },
];

const FEATURES: { icon: keyof typeof Feather.glyphMap; title: string; description: string }[] = [
  {
    icon: 'layers',
    title: 'Multi-model risk engine',
    description: 'LightGBM, CatBoost & XGBoost cross-checked and calibrated against real flood outcomes.',
  },
  {
    icon: 'droplet',
    title: 'Tailored to each location',
    description: 'Enriched with district climate, terrain, and historical flood patterns.',
  },
  {
    icon: 'star',
    title: 'AI-generated risk reports',
    description: 'Plain-language summaries and recommended actions for every result.',
  },
  {
    icon: 'activity',
    title: 'Live monitoring',
    description: 'Usage trends, score distribution, and response times — tracked in real time.',
  },
  {
    icon: 'git-branch',
    title: 'Continuously improved',
    description: 'Every model version is tracked and benchmarked against the last.',
  },
  {
    icon: 'shield',
    title: 'Tested & validated',
    description: 'Inputs are range-checked and unusual locations are flagged automatically.',
  },
];

export default function HomeScreen() {
  const router = useRouter();
  const [info, setInfo] = useState<ModelInfo | null>(null);
  const [howStep, setHowStep] = useState(0);

  useEffect(() => {
    getModelInfo().then(setInfo).catch(() => {});
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <AuroraBackground variant="hero" />
          <BrandMark align="center" />
          <View style={styles.liveBadge}>
            <PulseDot />
            <Text style={styles.liveBadgeText}>Live ML-powered flood intelligence</Text>
          </View>
          <Text style={styles.heroTitle}>Know your flood risk</Text>
          <GradientText style={styles.heroAccent}>before the water rises.</GradientText>
          <Text style={styles.heroSubtitle}>
            FloodGuard AI scores flood risk for any location in Sri Lanka in seconds, explains the result in
            plain language, and gives you clear next steps to help you prepare.
          </Text>
          <View style={styles.heroActions}>
            <Button title="Assess a location" icon="arrow-right" onPress={() => router.push('/predict')} />
            <Button
              title="View live monitoring"
              variant="secondary"
              icon="activity"
              onPress={() => router.push('/dashboard')}
            />
          </View>
          {info && (
            <View style={styles.heroMeta}>
              <Feather name="cpu" size={13} color={Colors.textMuted} />
              <Text style={styles.heroMetaText}>
                Model v{info.version} · trained on {info.n_rows.toLocaleString()} records
              </Text>
            </View>
          )}
        </View>

        {/* Why this matters */}
        <Card variant="glass" contentStyle={styles.ditwahContent}>
          <AuroraBackground variant="rose" />
          <Text style={styles.eyebrow}>Why this matters</Text>
          <Text style={styles.ditwahTitle}>Built in the aftermath of</Text>
          <GradientText style={styles.ditwahAccent}>Cyclone Ditwah</GradientText>
          <Text style={styles.ditwahBody}>
            Cyclone Ditwah brought days of relentless rain to Sri Lanka — swelling rivers, triggering
            landslides, and submerging entire towns. Families waded through chest-deep floodwater and
            communities were cut off for days. FloodGuard AI exists to give people that warning before the
            water rises.
          </Text>
        </Card>

        {/* How it works */}
        <View style={styles.section}>
          <SectionHeader
            eyebrow="How it works"
            title="From raw inputs to an actionable risk report"
            description="Every assessment runs through the same data pipeline and models described below — built to score one location at a time, in real time."
          />
          <Carousel
            index={howStep}
            onIndexChange={setHowStep}
            style={styles.howCarousel}
            pages={STEPS.map((step, i) => (
              <View key={step.title} style={styles.stepPage}>
                <Card variant="glass" style={styles.stepCard} contentStyle={styles.stepContent}>
                  <LinearGradient colors={Gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.stepBadge}>
                    <Text style={styles.stepNumber}>{i + 1}</Text>
                  </LinearGradient>
                  <Text style={styles.stepTitle}>{step.title}</Text>
                  <Text style={styles.stepDescription}>{step.description}</Text>
                </Card>
              </View>
            ))}
          />
          <View style={styles.dotsRow}>
            {STEPS.map((_, i) => (
              <View key={i} style={[styles.dot, i === howStep && styles.dotActive]} />
            ))}
          </View>
        </View>

        {/* Why FloodGuard AI */}
        <View style={styles.section}>
          <SectionHeader
            eyebrow="Built for production"
            title="An MLOps system, not just a model"
            description="Data, training, serving, and monitoring — packaged into a single deployable service."
          />
          <Card variant="glass" style={styles.featureHighlight} contentStyle={styles.featureHighlightContent}>
            <View style={styles.featureIconBoxLarge}>
              <Feather name={FEATURES[0].icon} size={26} color={Colors.brand} />
            </View>
            <View style={styles.featureHighlightText}>
              <Text style={styles.featureTitle}>{FEATURES[0].title}</Text>
              <Text style={styles.featureDescription}>{FEATURES[0].description}</Text>
            </View>
          </Card>
          <View style={styles.featureGrid}>
            {FEATURES.slice(1).map((f) => (
              <Card key={f.title} variant="glass" style={styles.featureCard} contentStyle={styles.featureContent}>
                <View style={styles.featureIconBox}>
                  <Feather name={f.icon} size={20} color={Colors.brand} />
                </View>
                <Text style={styles.featureTitle}>{f.title}</Text>
                <Text style={styles.featureDescription}>{f.description}</Text>
              </Card>
            ))}
          </View>
        </View>

        {/* Model snapshot */}
        <View style={styles.section}>
          <SectionHeader
            eyebrow="Model snapshot"
            title="Trained on real Sri Lankan flood data"
            description="Live numbers from the model currently powering every assessment."
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statRow}>
            <StatChip icon="cpu" value={info?.version ?? '–'} label="Model version" />
            <StatChip icon="map-pin" value={info?.categorical_options.district?.length ?? '–'} label="Districts covered" />
            <StatChip icon="database" value={info ? info.n_rows.toLocaleString() : '–'} label="Records analyzed" />
            <StatChip icon="check-circle" value={info?.n_folds ?? '–'} label="Validation rounds" />
          </ScrollView>
        </View>

        <GlowDivider style={styles.divider} />

        {/* CTA */}
        <Card variant="glass" contentStyle={styles.ctaContent}>
          <Text style={styles.ctaTitle}>Ready to check a location?</Text>
          <Text style={styles.ctaSubtitle}>
            Fill in a few details about geography, climate, and infrastructure to get an instant flood-risk
            assessment and AI-written report.
          </Text>
          <Button title="Assess a location" icon="arrow-right" onPress={() => router.push('/predict')} />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  content: {
    padding: Spacing.three,
    paddingBottom: Spacing.six,
    gap: Spacing.five,
  },

  // Hero
  hero: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
    backgroundColor: Colors.panel,
    borderWidth: 1,
    borderColor: Glass.border,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.five,
    alignItems: 'center',
    gap: Spacing.three,
    ...Shadows.card,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderColor: Glass.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
  },
  liveBadgeText: {
    color: Colors.brand,
    fontFamily: Fonts.extrabold,
    fontSize: 10.5,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  heroTitle: {
    color: Colors.text,
    fontFamily: Fonts.extrabold,
    fontSize: 30,
    textAlign: 'center',
    lineHeight: 36,
    letterSpacing: -0.5,
  },
  heroAccent: {
    fontFamily: Fonts.serifItalic,
    fontSize: 28,
    textAlign: 'center',
    lineHeight: 36,
  },
  heroSubtitle: {
    color: Colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 440,
  },
  heroActions: {
    width: '100%',
    gap: Spacing.two + 2,
    marginTop: Spacing.one,
  },
  heroMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    marginTop: Spacing.one,
  },
  heroMetaText: {
    color: Colors.textMuted,
    fontSize: 11.5,
  },

  // Why this matters
  ditwahContent: {
    gap: Spacing.one + 2,
    overflow: 'hidden',
  },
  eyebrow: {
    color: Colors.brand,
    fontFamily: Fonts.extrabold,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.6,
  },
  ditwahTitle: {
    color: Colors.text,
    fontFamily: Fonts.extrabold,
    fontSize: 20,
    letterSpacing: -0.3,
    marginTop: Spacing.one,
  },
  ditwahAccent: {
    fontFamily: Fonts.serifItalic,
    fontSize: 23,
    marginBottom: Spacing.one,
  },
  ditwahBody: {
    color: Colors.textMuted,
    fontSize: 13.5,
    lineHeight: 21,
  },

  // Sections
  section: {
    gap: Spacing.four,
  },

  // How it works
  howCarousel: {
    height: 230,
  },
  stepPage: {
    flex: 1,
    paddingHorizontal: Spacing.one,
  },
  stepCard: {
    flex: 1,
  },
  stepContent: {
    gap: Spacing.two,
    justifyContent: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.one,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  dotActive: {
    width: 22,
    backgroundColor: Colors.brand,
  },
  stepBadge: {
    width: 34,
    height: 34,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumber: {
    color: '#04101f',
    fontFamily: Fonts.extrabold,
    fontSize: 14,
  },
  stepTitle: {
    color: Colors.text,
    fontFamily: Fonts.bold,
    fontSize: 15.5,
  },
  stepDescription: {
    color: Colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },

  // Features
  featureHighlight: {
    overflow: 'hidden',
  },
  featureHighlightContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  featureIconBoxLarge: {
    width: 56,
    height: 56,
    borderRadius: Radius.lg,
    backgroundColor: 'rgba(56,189,248,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureHighlightText: {
    flex: 1,
    gap: Spacing.one,
  },
  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  featureCard: {
    flexBasis: '46%',
    flexGrow: 1,
  },
  featureContent: {
    gap: Spacing.one + 2,
  },
  featureIconBox: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(56,189,248,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  featureTitle: {
    color: Colors.text,
    fontFamily: Fonts.bold,
    fontSize: 14,
  },
  featureDescription: {
    color: Colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },

  // Stat strip
  statRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },

  divider: {
    marginVertical: Spacing.one,
  },

  // CTA
  ctaContent: {
    alignItems: 'center',
    gap: Spacing.three,
  },
  ctaTitle: {
    color: Colors.text,
    fontFamily: Fonts.extrabold,
    fontSize: 21,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  ctaSubtitle: {
    color: Colors.textMuted,
    fontSize: 13.5,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 420,
  },
});
