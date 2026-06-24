import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '@/components/ui/Card';
import {
  Colors,
  Fonts,
  Glass,
  RISK_COLORS,
  Radius,
  Shadows,
  Spacing,
} from '@/constants/theme';
import {
  getLiveRisks,
  getReports,
  submitReport,
  type FloodReport,
  type FloodReportRequest,
  type LiveDistrictRisk,
} from '@/lib/api';

// ── Emergency contacts ────────────────────────────────────────────────────────
const EMERGENCY_CONTACTS = [
  { name: 'DMC Emergency', number: '117', color: Colors.riskSevere },
  { name: 'Police', number: '119', color: Colors.riskHigh },
  { name: 'Ambulance', number: '110', color: Colors.riskLow },
  { name: 'Red Cross', number: '1234', color: Colors.riskSevere },
];

// ── Action guidance ───────────────────────────────────────────────────────────
const GUIDANCE: Record<string, { title: string; steps: string[]; color: string }> = {
  Low: {
    color: Colors.riskLow,
    title: 'Stay informed',
    steps: [
      'Normal activities are safe — no immediate action needed.',
      'Check weather updates during the rainy season.',
      'Make sure your family knows your nearest evacuation centre.',
      'Keep emergency supplies (water, food, documents) accessible.',
    ],
  },
  Moderate: {
    color: Colors.riskModerate,
    title: 'Be prepared',
    steps: [
      'Prepare your emergency go-bag (documents, medications, cash, charger).',
      'Identify your nearest evacuation centre and the route there.',
      'Monitor water levels in rivers and drains near your home.',
      'Call DMC info line 117 for latest updates.',
      'Move valuables off the floor.',
    ],
  },
  High: {
    color: Colors.riskHigh,
    title: 'Take action now',
    steps: [
      'Consider evacuating low-lying areas — don\'t wait for water to enter.',
      'Call 117 (DMC) immediately if you need help evacuating.',
      'Turn off electricity at the main switch and close gas valves.',
      'Stay off flooded roads — 30 cm of fast water can sweep a car.',
      'Keep children away from riverbanks and open drains.',
    ],
  },
  Severe: {
    color: Colors.riskSevere,
    title: 'EVACUATE IMMEDIATELY',
    steps: [
      'Leave NOW — do not wait for floodwater to reach you.',
      'Call 117 (DMC) or 119 (Police) if you need rescue.',
      'Move to the nearest evacuation centre or high ground.',
      'Do NOT drive through floodwater.',
      'If trapped, call 117 and signal rescuers from a window or roof.',
    ],
  },
};

const DISTRICTS = [
  'Ampara', 'Anuradhapura', 'Badulla', 'Batticaloa', 'Colombo',
  'Galle', 'Gampaha', 'Hambantota', 'Jaffna', 'Kalutara',
  'Kandy', 'Kegalle', 'Kilinochchi', 'Kurunegala', 'Mannar',
  'Matale', 'Matara', 'Monaragala', 'Mullaitivu', 'Nuwara Eliya',
  'Polonnaruwa', 'Puttalam', 'Ratnapura', 'Trincomalee', 'Vavuniya',
];

// ── Sub-components ────────────────────────────────────────────────────────────
function RiskGauge({ score, category }: { score: number; category: string }) {
  const color = RISK_COLORS[category] ?? Colors.brand;
  const pct = Math.round(score * 100);
  return (
    <View style={gaugeStyles.wrap}>
      <View style={[gaugeStyles.ring, { borderColor: `${color}22` }]}>
        <View style={[gaugeStyles.fill, { borderColor: color, opacity: 0.2 + score * 0.7 }]} />
        <View style={gaugeStyles.inner}>
          <Text style={[gaugeStyles.value, { color }]}>{pct}</Text>
          <Text style={gaugeStyles.sub}>/ 100</Text>
        </View>
      </View>
      <View style={[gaugeStyles.badge, { backgroundColor: `${color}22` }]}>
        <Text style={[gaugeStyles.badgeText, { color }]}>{category} Risk</Text>
      </View>
    </View>
  );
}

const gaugeStyles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: Spacing.two },
  ring: {
    width: 104, height: 104, borderRadius: 52,
    borderWidth: 8, alignItems: 'center', justifyContent: 'center',
  },
  fill: {
    position: 'absolute', width: 104, height: 104, borderRadius: 52,
    borderWidth: 8,
  },
  inner: { alignItems: 'center' },
  value: { fontFamily: Fonts.extrabold, fontSize: 26, lineHeight: 30 },
  sub: { color: Colors.textMuted, fontFamily: Fonts.regular, fontSize: 11 },
  badge: {
    borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 4,
  },
  badgeText: { fontFamily: Fonts.bold, fontSize: 12 },
});

function DistrictPickerModal({
  visible, selected, onSelect, onClose,
}: {
  visible: boolean;
  selected: string;
  onSelect: (d: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={pickerStyles.root}>
        <View style={pickerStyles.header}>
          <Text style={pickerStyles.title}>Select your district</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Feather name="x" size={22} color={Colors.textMuted} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={pickerStyles.list}>
          {DISTRICTS.map((d) => (
            <Pressable
              key={d}
              onPress={() => { onSelect(d); onClose(); }}
              style={[pickerStyles.item, d === selected && pickerStyles.itemActive]}
            >
              <Text style={[pickerStyles.itemText, d === selected && pickerStyles.itemTextActive]}>
                {d}
              </Text>
              {d === selected && <Feather name="check" size={16} color={Colors.brand} />}
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const pickerStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.four, paddingVertical: Spacing.three,
    borderBottomWidth: 1, borderBottomColor: Glass.border,
  },
  title: { color: Colors.text, fontFamily: Fonts.extrabold, fontSize: 17 },
  list: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  item: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: Spacing.three, paddingHorizontal: Spacing.three,
    borderRadius: Radius.md, marginBottom: Spacing.one,
  },
  itemActive: { backgroundColor: 'rgba(56,189,248,0.10)' },
  itemText: { color: Colors.textMuted, fontFamily: Fonts.medium, fontSize: 15 },
  itemTextActive: { color: Colors.brand, fontFamily: Fonts.bold },
});

// ── Main screen ───────────────────────────────────────────────────────────────
export default function DistrictScreen() {
  const [district, setDistrict] = useState('Colombo');
  const [risks, setRisks] = useState<LiveDistrictRisk[]>([]);
  const [reports, setReports] = useState<FloodReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [showReportForm, setShowReportForm] = useState(false);
  const [reportForm, setReportForm] = useState<FloodReportRequest>({
    district: 'Colombo',
    severity: 'moderate',
    description: '',
    reporter_name: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    try {
      const [liveData, reportData] = await Promise.all([
        getLiveRisks(),
        getReports(d),
      ]);
      setRisks(liveData);
      setReports(reportData);
    } catch {
      // keep last data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(district); }, [load, district]);

  const handleSelectDistrict = (d: string) => {
    setDistrict(d);
    setReportForm((f) => ({ ...f, district: d }));
  };

  const handleCall = (number: string) => {
    Linking.openURL(`tel:${number}`).catch(() =>
      Alert.alert('Cannot open phone', `Please dial ${number} manually.`)
    );
  };

  const handleSubmitReport = async () => {
    if (!reportForm.description.trim()) return;
    setSubmitting(true);
    try {
      await submitReport({ ...reportForm, reporter_name: reportForm.reporter_name || null });
      setShowReportForm(false);
      setReportForm((f) => ({ ...f, description: '', reporter_name: '' }));
      const fresh = await getReports(district);
      setReports(fresh);
      Alert.alert('Report submitted', 'Thank you for helping your community.');
    } catch {
      Alert.alert('Error', 'Could not submit report. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const current = risks.find((r) => r.district === district);
  const guidance = current ? GUIDANCE[current.live_category] ?? GUIDANCE.Low : null;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <DistrictPickerModal
        visible={showPicker}
        selected={district}
        onSelect={handleSelectDistrict}
        onClose={() => setShowPicker(false)}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* District selector */}
        <Pressable onPress={() => setShowPicker(true)} style={styles.districtPicker}>
          <View>
            <Text style={styles.districtLabel}>YOUR DISTRICT</Text>
            <Text style={styles.districtName}>{district}</Text>
          </View>
          <View style={styles.changeBtn}>
            <Text style={styles.changeBtnText}>Change</Text>
            <Feather name="chevron-down" size={14} color={Colors.brand} />
          </View>
        </Pressable>

        {/* Risk card */}
        {loading ? (
          <Card variant="glass" contentStyle={styles.loadingBox}>
            <ActivityIndicator color={Colors.brand} size="large" />
            <Text style={styles.loadingText}>Loading live risk data…</Text>
          </Card>
        ) : current ? (
          <Card variant="glass" contentStyle={styles.riskCard}>
            <View style={styles.riskRow}>
              <View style={styles.riskLeft}>
                <View style={styles.liveChip}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>LIVE</Text>
                </View>
                <View style={styles.riskStat}>
                  <Feather name="cloud-rain" size={15} color="#60a5fa" />
                  <Text style={styles.riskStatLabel}>Rainfall this week</Text>
                  <Text style={styles.riskStatValue}>{current.rainfall_7d_mm.toFixed(0)} mm</Text>
                </View>
                <View style={styles.riskStat}>
                  <Feather name="trending-up" size={15} color={Colors.textMuted} />
                  <Text style={styles.riskStatLabel}>Trend</Text>
                  <Text style={[
                    styles.riskStatValue,
                    current.trend === 'Worsening' ? { color: Colors.riskSevere } :
                    current.trend === 'Improving' ? { color: Colors.riskLow } :
                    { color: Colors.textMuted },
                  ]}>
                    {current.trend === 'Worsening' ? '↑ Worsening' :
                     current.trend === 'Improving' ? '↓ Improving' : '→ Stable'}
                  </Text>
                </View>
              </View>
              <RiskGauge score={current.live_score} category={current.live_category} />
            </View>
          </Card>
        ) : (
          <Card variant="glass" contentStyle={styles.loadingBox}>
            <Text style={styles.loadingText}>No data for {district}</Text>
          </Card>
        )}

        {/* Action guidance */}
        {guidance && current && (
          <View style={[styles.guidanceCard, {
            backgroundColor: `${guidance.color}10`,
            borderColor: `${guidance.color}30`,
          }]}>
            <View style={styles.guidanceHeader}>
              <Feather name="alert-triangle" size={18} color={guidance.color} />
              <Text style={[styles.guidanceTitle, { color: guidance.color }]}>
                {guidance.title}
              </Text>
            </View>
            {guidance.steps.map((step, i) => (
              <View key={i} style={styles.guidanceStep}>
                <View style={[styles.stepNum, { backgroundColor: `${guidance.color}20` }]}>
                  <Text style={[styles.stepNumText, { color: guidance.color }]}>{i + 1}</Text>
                </View>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Emergency contacts */}
        <Card variant="glass" contentStyle={styles.emergencyCard}>
          <View style={styles.sectionHeader}>
            <Feather name="phone" size={14} color={Colors.textMuted} />
            <Text style={styles.sectionTitle}>EMERGENCY CONTACTS</Text>
          </View>
          <View style={styles.contactGrid}>
            {EMERGENCY_CONTACTS.map((c) => (
              <TouchableOpacity
                key={c.name}
                onPress={() => handleCall(c.number)}
                activeOpacity={0.7}
                style={[styles.contactBtn, { borderColor: `${c.color}25`, backgroundColor: `${c.color}08` }]}
              >
                <View style={[styles.contactIcon, { backgroundColor: `${c.color}18` }]}>
                  <Feather name="phone-call" size={18} color={c.color} />
                </View>
                <Text style={styles.contactName}>{c.name}</Text>
                <Text style={[styles.contactNumber, { color: c.color }]}>{c.number}</Text>
                <Text style={[styles.callLabel, { color: c.color }]}>Tap to call</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* Community reports */}
        <Card variant="glass" contentStyle={styles.reportsCard}>
          <View style={styles.reportsHeader}>
            <View>
              <Text style={styles.sectionTitle}>COMMUNITY REPORTS</Text>
              <Text style={styles.reportsDistrict}>{district}</Text>
            </View>
            <TouchableOpacity
              onPress={() => setShowReportForm(!showReportForm)}
              activeOpacity={0.8}
              style={styles.reportBtn}
            >
              <Feather name="send" size={13} color={Colors.brand} />
              <Text style={styles.reportBtnText}>Report</Text>
            </TouchableOpacity>
          </View>

          {/* Report form */}
          {showReportForm && (
            <View style={styles.reportForm}>
              <Text style={styles.formLabel}>Severity</Text>
              <View style={styles.severityRow}>
                {(['minor', 'moderate', 'severe'] as const).map((s) => {
                  const sColor = s === 'severe' ? Colors.riskSevere : s === 'moderate' ? Colors.riskHigh : Colors.riskModerate;
                  const active = reportForm.severity === s;
                  return (
                    <Pressable
                      key={s}
                      onPress={() => setReportForm((f) => ({ ...f, severity: s }))}
                      style={[styles.severityBtn, active && { borderColor: sColor, backgroundColor: `${sColor}18` }]}
                    >
                      <Text style={[styles.severityText, active && { color: sColor }]}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={[styles.formLabel, { marginTop: Spacing.two }]}>What are you seeing? *</Text>
              <TextInput
                value={reportForm.description}
                onChangeText={(t) => setReportForm((f) => ({ ...f, description: t }))}
                placeholder="e.g. Roads flooded near the temple, water knee-deep…"
                placeholderTextColor={Colors.textMuted}
                multiline
                numberOfLines={3}
                maxLength={500}
                style={styles.textarea}
              />
              <Text style={[styles.formLabel, { marginTop: Spacing.two }]}>Your name (optional)</Text>
              <TextInput
                value={reportForm.reporter_name ?? ''}
                onChangeText={(t) => setReportForm((f) => ({ ...f, reporter_name: t }))}
                placeholder="Anonymous"
                placeholderTextColor={Colors.textMuted}
                maxLength={80}
                style={styles.textInput}
              />
              <TouchableOpacity
                onPress={handleSubmitReport}
                disabled={submitting || !reportForm.description.trim()}
                activeOpacity={0.8}
                style={[styles.submitBtn, (submitting || !reportForm.description.trim()) && { opacity: 0.5 }]}
              >
                {submitting
                  ? <ActivityIndicator color={Colors.bg} size="small" />
                  : <Feather name="send" size={15} color={Colors.bg} />}
                <Text style={styles.submitBtnText}>Submit report</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Reports list */}
          {reports.length === 0 ? (
            <View style={styles.emptyReports}>
              <Feather name="inbox" size={28} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No reports yet for {district}</Text>
              <Text style={styles.emptySubText}>Be the first to report if you see flooding.</Text>
            </View>
          ) : (
            <View style={styles.reportsList}>
              {reports.slice(0, 10).map((r) => {
                const sColor = r.severity === 'severe' ? Colors.riskSevere : r.severity === 'moderate' ? Colors.riskHigh : Colors.riskModerate;
                return (
                  <View key={r.id} style={[styles.reportItem, { borderColor: `${sColor}25`, backgroundColor: `${sColor}07` }]}>
                    <View style={styles.reportItemHeader}>
                      <Text style={[styles.reportSeverity, { color: sColor }]}>{r.severity.toUpperCase()}</Text>
                      <Text style={styles.reportTime}>{r.time_ago}</Text>
                    </View>
                    <Text style={styles.reportDesc}>{r.description}</Text>
                    {r.reporter_name && (
                      <Text style={styles.reportReporter}>— {r.reporter_name}</Text>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </Card>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.three, paddingBottom: Spacing.six, gap: Spacing.three },

  // District picker
  districtPicker: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.panel, borderRadius: Radius.xl, padding: Spacing.four,
    borderWidth: 1, borderColor: Glass.border, ...Shadows.card,
  },
  districtLabel: { color: Colors.textMuted, fontFamily: Fonts.bold, fontSize: 10, letterSpacing: 1.2 },
  districtName: { color: Colors.text, fontFamily: Fonts.extrabold, fontSize: 22, marginTop: 2 },
  changeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(56,189,248,0.12)', borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 6 },
  changeBtnText: { color: Colors.brand, fontFamily: Fonts.bold, fontSize: 12 },

  // Risk card
  loadingBox: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.five },
  loadingText: { color: Colors.textMuted, fontFamily: Fonts.medium, fontSize: 14 },
  riskCard: { gap: Spacing.three },
  riskRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  riskLeft: { flex: 1, gap: Spacing.two, paddingRight: Spacing.three },
  liveChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(56,189,248,0.12)', borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.brand },
  liveText: { color: Colors.brand, fontFamily: Fonts.extrabold, fontSize: 10, letterSpacing: 1 },
  riskStat: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  riskStatLabel: { color: Colors.textMuted, fontFamily: Fonts.regular, fontSize: 12 },
  riskStatValue: { color: Colors.text, fontFamily: Fonts.bold, fontSize: 13 },

  // Guidance
  guidanceCard: { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.four, gap: Spacing.two },
  guidanceHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginBottom: Spacing.one },
  guidanceTitle: { fontFamily: Fonts.extrabold, fontSize: 16 },
  guidanceStep: { flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-start' },
  stepNum: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  stepNumText: { fontFamily: Fonts.extrabold, fontSize: 10 },
  stepText: { color: Colors.text, fontFamily: Fonts.regular, fontSize: 13, lineHeight: 20, flex: 1 },

  // Emergency
  emergencyCard: { gap: Spacing.three },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  sectionTitle: { color: Colors.textMuted, fontFamily: Fonts.extrabold, fontSize: 10, letterSpacing: 1.2 },
  contactGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  contactBtn: { flexBasis: '47%', flexGrow: 1, alignItems: 'center', gap: Spacing.one, borderRadius: Radius.lg, borderWidth: 1, paddingVertical: Spacing.three },
  contactIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  contactName: { color: Colors.textMuted, fontFamily: Fonts.medium, fontSize: 10, textAlign: 'center' },
  contactNumber: { fontFamily: Fonts.extrabold, fontSize: 22, lineHeight: 26 },
  callLabel: { fontFamily: Fonts.bold, fontSize: 9, letterSpacing: 0.5, opacity: 0.7 },

  // Community reports
  reportsCard: { gap: Spacing.three },
  reportsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reportsDistrict: { color: Colors.text, fontFamily: Fonts.bold, fontSize: 14, marginTop: 2 },
  reportBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(56,189,248,0.12)', borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 7 },
  reportBtnText: { color: Colors.brand, fontFamily: Fonts.bold, fontSize: 12 },

  // Report form
  reportForm: { gap: Spacing.two, borderTopWidth: 1, borderTopColor: Glass.border, paddingTop: Spacing.three },
  formLabel: { color: Colors.textMuted, fontFamily: Fonts.bold, fontSize: 11, letterSpacing: 0.5 },
  severityRow: { flexDirection: 'row', gap: Spacing.two },
  severityBtn: { flex: 1, borderRadius: Radius.md, borderWidth: 1, borderColor: Glass.border, paddingVertical: 8, alignItems: 'center' },
  severityText: { color: Colors.textMuted, fontFamily: Fonts.bold, fontSize: 12 },
  textarea: {
    backgroundColor: Colors.panel2, borderRadius: Radius.md, borderWidth: 1, borderColor: Glass.border,
    color: Colors.text, fontFamily: Fonts.regular, fontSize: 13, padding: Spacing.three,
    minHeight: 80, textAlignVertical: 'top',
  },
  textInput: {
    backgroundColor: Colors.panel2, borderRadius: Radius.md, borderWidth: 1, borderColor: Glass.border,
    color: Colors.text, fontFamily: Fonts.regular, fontSize: 13, padding: Spacing.three, height: 44,
  },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two,
    backgroundColor: Colors.brand, borderRadius: Radius.lg, paddingVertical: Spacing.three,
  },
  submitBtnText: { color: Colors.bg, fontFamily: Fonts.extrabold, fontSize: 14 },

  // Reports list
  emptyReports: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.four },
  emptyText: { color: Colors.textMuted, fontFamily: Fonts.semibold, fontSize: 14 },
  emptySubText: { color: Colors.textMuted, fontFamily: Fonts.regular, fontSize: 12, textAlign: 'center' },
  reportsList: { gap: Spacing.two },
  reportItem: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.three, gap: Spacing.one },
  reportItemHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reportSeverity: { fontFamily: Fonts.extrabold, fontSize: 10, letterSpacing: 0.8 },
  reportTime: { color: Colors.textMuted, fontFamily: Fonts.regular, fontSize: 11 },
  reportDesc: { color: Colors.text, fontFamily: Fonts.regular, fontSize: 13, lineHeight: 19 },
  reportReporter: { color: Colors.textMuted, fontFamily: Fonts.regular, fontSize: 11 },
});
