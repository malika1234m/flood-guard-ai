import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { AuroraBackground } from '@/components/ui/AuroraBackground';
import { RiskBadge } from '@/components/ui/Badge';
import { BrandMark } from '@/components/ui/BrandMark';
import { Card } from '@/components/ui/Card';
import { PulseDot } from '@/components/ui/PulseDot';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { SriLankaMap } from '@/components/ui/SriLankaMap';
import { StatChip } from '@/components/ui/StatChip';
import { Colors, Fonts, Glass, Gradients, RISK_COLORS, Radius, Shadows, Spacing } from '@/constants/theme';
import { getMonitoringStats, type MonitoringStats } from '@/lib/api';

const REFRESH_INTERVAL_MS = 15000;

const VIEW_OPTIONS: { key: string; label: string; icon: keyof typeof Feather.glyphMap; title: string }[] = [
  { key: 'score', label: 'Trend', icon: 'bar-chart-2', title: 'Score distribution' },
  { key: 'categories', label: 'Categories', icon: 'pie-chart', title: 'Risk category breakdown' },
  { key: 'districts', label: 'Districts', icon: 'bar-chart', title: 'Top districts' },
  { key: 'recent', label: 'Recent', icon: 'list', title: 'Recent predictions' },
  { key: 'map', label: 'Risk Map', icon: 'map', title: 'Sri Lanka risk map' },
];

const DONUT_SIZE = 150;
const DONUT_STROKE = 20;
const DONUT_RADIUS = (DONUT_SIZE - DONUT_STROKE) / 2;
const DONUT_CIRC = 2 * Math.PI * DONUT_RADIUS;

function fmt(value: number | null | undefined, digits = 3) {
  return value === null || value === undefined ? '--' : value.toFixed(digits);
}

function formatTime(timestampSeconds: number) {
  const d = new Date(timestampSeconds * 1000);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

interface ChartCardProps {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  children: React.ReactNode;
}

function ChartCard({ icon, title, children }: ChartCardProps) {
  return (
    <Card variant="glass" contentStyle={styles.chartContent}>
      <View style={styles.cardHeader}>
        <View style={styles.cardIconBox}>
          <Feather name={icon} size={15} color={Colors.brand} />
        </View>
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      {children}
    </Card>
  );
}

function EmptyChart({ icon }: { icon: keyof typeof Feather.glyphMap }) {
  return (
    <View style={styles.emptyChart}>
      <Feather name={icon} size={22} color={Colors.textMuted} />
      <Text style={styles.emptyChartText}>No data yet</Text>
    </View>
  );
}

function ScoreHistogram({ bins }: { bins: number[] }) {
  if (bins.length === 0 || bins.every((v) => v === 0)) return <EmptyChart icon="bar-chart-2" />;
  const max = Math.max(...bins, 1);

  return (
    <View style={styles.histogram}>
      {bins.map((count, i) => {
        const pct = count > 0 ? Math.max(6, (count / max) * 100) : 0;
        return (
          <View key={i} style={styles.histCol}>
            <View style={styles.histTrack}>
              <LinearGradient
                colors={Gradients.brand}
                start={{ x: 0, y: 1 }}
                end={{ x: 0, y: 0 }}
                style={[styles.histBar, { height: `${pct}%` }]}
              />
            </View>
            <Text style={styles.histLabel}>{(i / bins.length).toFixed(1)}</Text>
          </View>
        );
      })}
    </View>
  );
}

function CategoryDonut({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts);
  if (entries.length === 0) return <EmptyChart icon="pie-chart" />;
  const total = entries.reduce((sum, [, v]) => sum + v, 0) || 1;
  const gap = entries.length > 1 ? 3 : 0;

  let cumulative = 0;
  const segments = entries.map(([name, count]) => {
    const fraction = count / total;
    const segment = {
      name,
      count,
      color: RISK_COLORS[name] ?? Colors.brand2,
      dashArray: `${Math.max(0, fraction * DONUT_CIRC - gap)} ${DONUT_CIRC}`,
      dashOffset: -cumulative * DONUT_CIRC,
    };
    cumulative += fraction;
    return segment;
  });

  return (
    <View style={styles.donutRow}>
      <View style={styles.donutWrap}>
        <Svg width={DONUT_SIZE} height={DONUT_SIZE}>
          <Circle cx={DONUT_SIZE / 2} cy={DONUT_SIZE / 2} r={DONUT_RADIUS} stroke={Colors.panel2} strokeWidth={DONUT_STROKE} fill="none" />
          {segments.map((s) => (
            <Circle
              key={s.name}
              cx={DONUT_SIZE / 2}
              cy={DONUT_SIZE / 2}
              r={DONUT_RADIUS}
              stroke={s.color}
              strokeWidth={DONUT_STROKE}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={s.dashArray}
              strokeDashoffset={s.dashOffset}
              rotation={-90}
              origin={`${DONUT_SIZE / 2}, ${DONUT_SIZE / 2}`}
            />
          ))}
        </Svg>
        <View style={styles.donutCenter}>
          <Text style={styles.donutTotal}>{total}</Text>
          <Text style={styles.donutTotalLabel}>total</Text>
        </View>
      </View>
      <View style={styles.legend}>
        {segments.map((s) => (
          <View key={s.name} style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: s.color }]} />
            <Text style={styles.legendName} numberOfLines={1}>
              {s.name}
            </Text>
            <Text style={styles.legendValue}>
              {s.count} · {Math.round((s.count / total) * 100)}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function DistrictBars({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return <EmptyChart icon="map" />;
  const max = Math.max(...entries.map(([, v]) => v), 1);

  return (
    <View style={styles.barsList}>
      {entries.map(([name, count]) => (
        <View key={name} style={styles.barRow}>
          <View style={styles.barLabelRow}>
            <Text style={styles.barLabel} numberOfLines={1}>
              {name}
            </Text>
            <Text style={styles.barValue}>{count}</Text>
          </View>
          <View style={styles.barTrack}>
            <LinearGradient
              colors={Gradients.brand}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.barFill, { width: `${(count / max) * 100}%` }]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

function RecentPredictions({ stats }: { stats: MonitoringStats | null }) {
  if (!stats || stats.recent.length === 0) return <EmptyChart icon="list" />;

  return (
    <View style={styles.recentList}>
      {stats.recent.map((r, i) => {
        const color = RISK_COLORS[r.risk_category] ?? Colors.brand;
        return (
          <View key={i} style={[styles.recentRow, i < stats.recent.length - 1 && styles.recentRowBorder]}>
            <View style={styles.recentInfo}>
              <Text style={styles.recentDistrict} numberOfLines={1}>
                {r.district ?? '--'}
              </Text>
              <Text style={styles.recentMeta}>
                {formatTime(r.timestamp)} · {fmt(r.latency_ms, 0)} ms
              </Text>
            </View>
            <View style={styles.recentRight}>
              <Text style={styles.recentScore}>{fmt(r.flood_risk_score)}</Text>
              <RiskBadge category={r.risk_category} color={color} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

export default function DashboardScreen() {
  const [stats, setStats] = useState<MonitoringStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState(VIEW_OPTIONS[0].key);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setStats(await getMonitoringStats());
    } catch {
      // keep showing the last known stats on a transient failure
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  const activeView = VIEW_OPTIONS.find((v) => v.key === view) ?? VIEW_OPTIONS[0];

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.brand} />}
      >
        <View style={styles.header}>
          <AuroraBackground variant="page" />
          <BrandMark />
          <Text style={styles.headerTitle}>Live Monitoring</Text>
          <Text style={styles.headerSubtitle}>
            Real-time view of prediction volume, score distribution, latency, and feedback — backed by every call to
            the prediction API.
          </Text>
          <View style={styles.headerBadges}>
            <View style={styles.headerBadge}>
              <PulseDot size={6} />
              <Text style={styles.headerBadgeText}>Live · auto-refresh every 15s</Text>
            </View>
            <Pressable
              style={[styles.headerBadge, refreshing && styles.headerBadgeActive]}
              onPress={refresh}
              disabled={refreshing}
            >
              <Feather name="refresh-cw" size={12} color={Colors.brand} />
              <Text style={styles.headerBadgeText}>{refreshing ? 'Refreshing…' : 'Refresh now'}</Text>
            </Pressable>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statRow}>
          <StatChip icon="database" value={stats?.total_predictions ?? '--'} label="Predictions" />
          <StatChip icon="activity" value={fmt(stats?.avg_score)} label="Avg risk score" />
          <StatChip icon="zap" value={fmt(stats?.avg_latency_ms, 1)} label="Avg latency (ms)" />
          <StatChip icon="message-square" value={stats?.feedback_count ?? '--'} label="Feedback received" />
          <StatChip icon="star" value={fmt(stats?.avg_user_rating, 2)} label="Avg user rating" />
        </ScrollView>

        <SegmentedTabs options={VIEW_OPTIONS} value={view} onChange={setView} />

        <ChartCard icon={activeView.icon} title={activeView.title}>
          {view === 'score' && <ScoreHistogram bins={stats?.score_histogram ?? []} />}
          {view === 'categories' && <CategoryDonut counts={stats?.category_counts ?? {}} />}
          {view === 'districts' && <DistrictBars counts={stats?.district_counts ?? {}} />}
          {view === 'recent' && <RecentPredictions stats={stats} />}
          {view === 'map' && <SriLankaMap />}
        </ChartCard>
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
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },

  // Header
  header: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
    backgroundColor: Colors.panel,
    borderWidth: 1,
    borderColor: Glass.border,
    paddingHorizontal: Spacing.three + 2,
    paddingVertical: Spacing.four,
    gap: Spacing.two,
    ...Shadows.card,
  },
  headerTitle: {
    color: Colors.text,
    fontFamily: Fonts.extrabold,
    fontSize: 22,
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    color: Colors.textMuted,
    fontSize: 13.5,
    lineHeight: 20,
  },
  headerBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    borderWidth: 1,
    borderColor: Glass.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.one + 2,
  },
  headerBadgeActive: {
    opacity: 0.6,
  },
  headerBadgeText: {
    color: Colors.textMuted,
    fontFamily: Fonts.semibold,
    fontSize: 11.5,
  },

  // Stat strip
  statRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },

  // Chart cards
  chartContent: {
    gap: Spacing.three,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  cardIconBox: {
    width: 30,
    height: 30,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(56,189,248,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    color: Colors.text,
    fontFamily: Fonts.extrabold,
    fontSize: 17,
  },
  emptyChart: {
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  emptyChartText: {
    color: Colors.textMuted,
    fontFamily: Fonts.medium,
    fontSize: 13,
  },

  // Score histogram
  histogram: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 130,
    gap: Spacing.one + 2,
  },
  histCol: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
    gap: Spacing.one + 2,
  },
  histTrack: {
    width: '100%',
    flex: 1,
    justifyContent: 'flex-end',
  },
  histBar: {
    width: '100%',
    minHeight: 3,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  histLabel: {
    color: Colors.textMuted,
    fontFamily: Fonts.medium,
    fontSize: 8.5,
    fontVariant: ['tabular-nums'],
  },

  // Category donut
  donutRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.four,
  },
  donutWrap: {
    width: DONUT_SIZE,
    height: DONUT_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutCenter: {
    position: 'absolute',
    alignItems: 'center',
  },
  donutTotal: {
    color: Colors.text,
    fontFamily: Fonts.extrabold,
    fontSize: 24,
    fontVariant: ['tabular-nums'],
  },
  donutTotalLabel: {
    color: Colors.textMuted,
    fontFamily: Fonts.bold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginTop: 2,
  },
  legend: {
    flexBasis: 140,
    flexGrow: 1,
    gap: Spacing.two,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: Radius.full,
  },
  legendName: {
    flex: 1,
    color: Colors.text,
    fontFamily: Fonts.semibold,
    fontSize: 12.5,
  },
  legendValue: {
    color: Colors.textMuted,
    fontFamily: Fonts.bold,
    fontSize: 11.5,
    fontVariant: ['tabular-nums'],
  },

  // District bars
  barsList: {
    gap: Spacing.three,
  },
  barRow: {
    gap: Spacing.one + 2,
  },
  barLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  barLabel: {
    flex: 1,
    color: Colors.text,
    fontFamily: Fonts.semibold,
    fontSize: 13,
  },
  barValue: {
    color: Colors.textMuted,
    fontFamily: Fonts.bold,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  barTrack: {
    height: 7,
    borderRadius: Radius.full,
    backgroundColor: Colors.panel2,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: Radius.full,
  },

  // Recent predictions
  recentList: {
    gap: Spacing.three,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two + 2,
    paddingBottom: Spacing.three,
  },
  recentRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Glass.border,
  },
  recentInfo: {
    flex: 1,
    gap: Spacing.half,
  },
  recentDistrict: {
    color: Colors.text,
    fontFamily: Fonts.bold,
    fontSize: 13.5,
  },
  recentMeta: {
    color: Colors.textMuted,
    fontFamily: Fonts.medium,
    fontSize: 11.5,
  },
  recentRight: {
    alignItems: 'flex-end',
    gap: Spacing.one + 2,
  },
  recentScore: {
    color: Colors.text,
    fontFamily: Fonts.extrabold,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
});
