import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { getAlerts, type FloodAlert } from '@/lib/api';

const SEV_COLOR: Record<string, string> = {
  Severe: Colors.riskSevere,
  High: Colors.riskHigh,
  Moderate: Colors.riskModerate,
};

const TREND_ARROW: Record<string, string> = {
  Worsening: '↑',
  Improving: '↓',
  Stable: '→',
};

function AlertChip({ alert }: { alert: FloodAlert }) {
  const color = SEV_COLOR[alert.severity] ?? Colors.brand;
  return (
    <View
      style={[
        styles.chip,
        { borderColor: `${color}40`, backgroundColor: `${color}14` },
      ]}
    >
      <View style={[styles.chipDot, { backgroundColor: color }]} />
      <Text style={[styles.chipSeverity, { color }]}>{alert.severity}</Text>
      <Text style={styles.chipDistrict}>{alert.district}</Text>
      <Text style={styles.chipRain}>
        {TREND_ARROW[alert.trend]} {alert.rainfall_7d_mm.toFixed(0)}mm
      </Text>
    </View>
  );
}

export function AlertBanner() {
  const [alerts, setAlerts] = useState<FloodAlert[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    function load() {
      getAlerts()
        .then(setAlerts)
        .catch(() => {});
    }
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  if (alerts.length === 0) return null;

  const worst = alerts[0];
  const worstColor = SEV_COLOR[worst.severity] ?? Colors.riskHigh;

  return (
    <View style={[styles.container, { borderColor: `${worstColor}30`, backgroundColor: `${worstColor}0d` }]}>
      {/* Header row */}
      <View style={styles.headerRow}>
        <View style={[styles.liveDot, { backgroundColor: worstColor }]} />
        <Text style={[styles.liveLabel, { color: worstColor }]}>
          LIVE ALERTS · {alerts.length} DISTRICT{alerts.length > 1 ? 'S' : ''}
        </Text>
        <Pressable onPress={() => setExpanded((v) => !v)} style={styles.toggleBtn}>
          <Text style={styles.toggleText}>{expanded ? 'Hide' : 'Details'}</Text>
        </Pressable>
      </View>

      {/* Scrolling chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {alerts.map((a) => (
          <AlertChip key={a.district} alert={a} />
        ))}
      </ScrollView>

      {/* Expanded messages */}
      {expanded && (
        <View style={[styles.detail, { borderTopColor: `${worstColor}20` }]}>
          {alerts.map((a) => {
            const c = SEV_COLOR[a.severity] ?? Colors.brand;
            return (
              <View key={a.district} style={styles.messageRow}>
                <Text style={[styles.messageSev, { color: c }]}>[{a.severity}]</Text>
                <Text style={styles.messageText} numberOfLines={2}>{a.message}</Text>
                <Text style={[styles.messageScore, { color: c }]}>{a.live_score.toFixed(3)}</Text>
              </View>
            );
          })}
          <Text style={styles.poweredBy}>
            Powered by Open-Meteo live rainfall · FloodGuard AI · refreshes every 5 min
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: Spacing.three,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.one,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  liveLabel: {
    flex: 1,
    fontFamily: Fonts.extrabold,
    fontSize: 10,
    letterSpacing: 0.8,
  },
  toggleBtn: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  toggleText: {
    color: Colors.textMuted,
    fontFamily: Fonts.semibold,
    fontSize: 11,
  },
  chipRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  chipSeverity: {
    fontFamily: Fonts.extrabold,
    fontSize: 9,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  chipDistrict: {
    color: Colors.text,
    fontFamily: Fonts.semibold,
    fontSize: 12,
  },
  chipRain: {
    color: Colors.textMuted,
    fontFamily: Fonts.regular,
    fontSize: 10,
  },
  detail: {
    borderTopWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  messageSev: {
    fontFamily: Fonts.bold,
    fontSize: 11,
    width: 58,
    flexShrink: 0,
  },
  messageText: {
    flex: 1,
    color: Colors.text,
    fontFamily: Fonts.regular,
    fontSize: 11,
    lineHeight: 16,
  },
  messageScore: {
    fontFamily: Fonts.bold,
    fontSize: 11,
    flexShrink: 0,
  },
  poweredBy: {
    color: Colors.textMuted,
    fontFamily: Fonts.regular,
    fontSize: 9,
    marginTop: Spacing.one,
  },
});
