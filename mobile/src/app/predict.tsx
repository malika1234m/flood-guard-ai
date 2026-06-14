import { Feather } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuroraBackground } from '@/components/ui/AuroraBackground';
import { BrandMark } from '@/components/ui/BrandMark';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PulseDot } from '@/components/ui/PulseDot';
import { NumberField, SelectField, TextField } from '@/components/form/FormField';
import { Section } from '@/components/form/Section';
import { RiskResult } from '@/components/RiskResult';
import { Colors, Fonts, Glass, Radius, Shadows, Spacing } from '@/constants/theme';
import { getModelInfo, predict, type ModelInfo, type PredictRequest, type PredictResponse } from '@/lib/api';

interface FormState {
  district: string;
  urban_rural: string;
  latitude: string;
  longitude: string;
  landcover: string;
  soil_type: string;
  elevation_m: string;
  distance_to_river_m: string;
  rainfall_7d_mm: string;
  monthly_rainfall_mm: string;
  drainage_index: string;
  historical_flood_count: string;
  ndvi: string;
  ndwi: string;
  water_presence_flag: string;
  population_density_per_km2: string;
  built_up_percent: string;
  infrastructure_score: string;
  water_supply: string;
  electricity: string;
  road_quality: string;
  nearest_hospital_km: string;
  nearest_evac_km: string;
  flood_occurrence_current_event: string;
  inundation_area_sqm: string;
  is_good_to_live: string;
  reason_not_good_to_live: string;
  seasonal_index: string;
  terrain_roughness_index: string;
  socioeconomic_status_index: string;
  extreme_weather_index: string;
}

const DEFAULT_FORM: FormState = {
  district: '',
  urban_rural: '',
  latitude: '6.9271',
  longitude: '79.8612',
  landcover: '',
  soil_type: '',
  elevation_m: '8',
  distance_to_river_m: '300',
  rainfall_7d_mm: '120',
  monthly_rainfall_mm: '280',
  drainage_index: '0.5',
  historical_flood_count: '2',
  ndvi: '0.35',
  ndwi: '0.1',
  water_presence_flag: '',
  population_density_per_km2: '2500',
  built_up_percent: '55',
  infrastructure_score: '60',
  water_supply: '',
  electricity: '',
  road_quality: '',
  nearest_hospital_km: '4',
  nearest_evac_km: '3',
  flood_occurrence_current_event: 'No',
  inundation_area_sqm: '0',
  is_good_to_live: 'Yes',
  reason_not_good_to_live: '',
  seasonal_index: '',
  terrain_roughness_index: '',
  socioeconomic_status_index: '',
  extreme_weather_index: '',
};

const CATEGORICAL_FIELDS = [
  'district',
  'urban_rural',
  'landcover',
  'soil_type',
  'water_supply',
  'electricity',
  'road_quality',
  'water_presence_flag',
] as const satisfies readonly (keyof FormState)[];

const ADVANCED_INDEX_FIELDS = [
  {
    id: 'seasonal_index',
    label: 'Seasonal flood-risk index',
    helper: 'Reflects how flood-prone the current season typically is in this district.',
    icon: 'calendar',
  },
  {
    id: 'terrain_roughness_index',
    label: 'Terrain roughness index',
    helper: 'Describes how uneven or hilly the surrounding land is.',
    icon: 'activity',
  },
  {
    id: 'socioeconomic_status_index',
    label: 'Socioeconomic index',
    helper: "A general measure of the area's economic development and living standards.",
    icon: 'bar-chart-2',
  },
  {
    id: 'extreme_weather_index',
    label: 'Extreme weather index',
    helper: 'Reflects how often this district experiences extreme weather events.',
    icon: 'wind',
  },
] as const satisfies readonly { id: keyof FormState; label: string; helper: string; icon: keyof typeof Feather.glyphMap }[];

function optionalNumber(value: string): number | null {
  return value.trim() === '' ? null : parseFloat(value);
}

function buildPayload(form: FormState): PredictRequest {
  return {
    latitude: parseFloat(form.latitude),
    longitude: parseFloat(form.longitude),
    elevation_m: parseFloat(form.elevation_m),
    distance_to_river_m: parseFloat(form.distance_to_river_m),
    population_density_per_km2: parseFloat(form.population_density_per_km2),
    built_up_percent: parseFloat(form.built_up_percent),
    rainfall_7d_mm: parseFloat(form.rainfall_7d_mm),
    monthly_rainfall_mm: parseFloat(form.monthly_rainfall_mm),
    drainage_index: parseFloat(form.drainage_index),
    ndvi: parseFloat(form.ndvi),
    ndwi: parseFloat(form.ndwi),
    historical_flood_count: parseFloat(form.historical_flood_count),
    infrastructure_score: parseFloat(form.infrastructure_score),
    nearest_hospital_km: parseFloat(form.nearest_hospital_km),
    nearest_evac_km: parseFloat(form.nearest_evac_km),
    district: form.district,
    landcover: form.landcover,
    soil_type: form.soil_type,
    water_supply: form.water_supply,
    electricity: form.electricity,
    road_quality: form.road_quality,
    urban_rural: form.urban_rural,
    water_presence_flag: form.water_presence_flag,
    flood_occurrence_current_event: form.flood_occurrence_current_event,
    inundation_area_sqm: optionalNumber(form.inundation_area_sqm),
    is_good_to_live: form.is_good_to_live,
    reason_not_good_to_live: form.reason_not_good_to_live.trim() === '' ? null : form.reason_not_good_to_live.trim(),
    seasonal_index: optionalNumber(form.seasonal_index),
    terrain_roughness_index: optionalNumber(form.terrain_roughness_index),
    socioeconomic_status_index: optionalNumber(form.socioeconomic_status_index),
    extreme_weather_index: optionalNumber(form.extreme_weather_index),
    include_ai_report: true,
  };
}

export default function PredictScreen() {
  const [info, setInfo] = useState<ModelInfo | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [result, setResult] = useState<PredictResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    getModelInfo()
      .then((data) => {
        setInfo(data);
        setForm((prev) => {
          const next = { ...prev };
          for (const field of CATEGORICAL_FIELDS) {
            if (!next[field]) {
              next[field] = data.categorical_options[field]?.[0] ?? '';
            }
          }
          return next;
        });
      })
      .catch(() => Alert.alert('Connection error', 'Failed to load model configuration.'));
  }, []);

  const set = (key: keyof FormState) => (value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const options = info?.categorical_options;
  const districtDefaults = info ? info.district_defaults[form.district] ?? info.advanced_field_global_defaults : undefined;

  function placeholderFor(field: keyof FormState) {
    const v = districtDefaults?.[field as string];
    return v !== undefined ? `District avg: ${v.toFixed(4)}` : undefined;
  }

  async function handleSubmit() {
    setLoading(true);
    try {
      const data = await predict(buildPayload(form));
      setResult(data);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    } catch (err) {
      Alert.alert('Prediction failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <AuroraBackground variant="page" />
          <BrandMark />
          <Text style={styles.headerTitle}>Check Your Flood Risk</Text>
          <Text style={styles.headerSubtitle}>
            Answer a few questions about a location anywhere in Sri Lanka to get an instant risk score, a
            plain-language explanation, and recommended next steps.
          </Text>
          <View style={styles.headerBadges}>
            <View style={styles.headerBadge}>
              <PulseDot size={6} />
              <Text style={styles.headerBadgeText}>AI scanning ready</Text>
            </View>
            {info && (
              <View style={styles.headerBadge}>
                <Feather name="cpu" size={12} color={Colors.brand} />
                <Text style={styles.headerBadgeText}>Model v{info.version}</Text>
              </View>
            )}
          </View>
        </View>

        <Card variant="glass" contentStyle={styles.resultContent}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIconBox}>
              <Feather name="activity" size={15} color={Colors.brand} />
            </View>
            <Text style={styles.cardTitle}>Result</Text>
          </View>
          {result ? (
            <RiskResult result={result} />
          ) : (
            <View style={styles.placeholder}>
              <View style={styles.placeholderIconBox}>
                <Feather name="droplet" size={28} color={Colors.brand} />
              </View>
              <Text style={styles.placeholderText}>
                Fill in the form below and tap <Text style={styles.bold}>Check Flood Risk</Text> to see the risk
                score, category, and a plain-language report with recommended next steps.
              </Text>
            </View>
          )}
        </Card>

        <Card variant="glass" contentStyle={styles.formContent}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIconBox}>
              <Feather name="edit-3" size={15} color={Colors.brand} />
            </View>
            <Text style={styles.cardTitle}>About the Location</Text>
          </View>
          <Text style={styles.cardSubtitle}>
            The form starts with typical values for a calm day — change anything you know about the location and
            leave the rest as-is.
          </Text>

          <Section title="Location" description="Pinpoint the location, or use your best estimate for the area." icon="map-pin">
            <SelectField label="District" value={form.district} onChange={set('district')} options={options?.district ?? []} icon="map-pin" />
            <SelectField label="Urban or rural" value={form.urban_rural} onChange={set('urban_rural')} options={options?.urban_rural ?? []} icon="home" />
            <NumberField
              label="Latitude"
              value={form.latitude}
              onChangeText={set('latitude')}
              helperText="Right-click the location on Google Maps and copy the first number shown."
              icon="compass"
            />
            <NumberField
              label="Longitude"
              value={form.longitude}
              onChangeText={set('longitude')}
              helperText="The second number from the same map coordinates."
              icon="compass"
            />
            <SelectField
              label="Land cover"
              value={form.landcover}
              onChange={set('landcover')}
              options={options?.landcover ?? []}
              helperText="What mostly covers the ground here."
              icon="image"
            />
            <SelectField
              label="Soil type"
              value={form.soil_type}
              onChange={set('soil_type')}
              options={options?.soil_type ?? []}
              helperText="The dominant soil type in the area, if known."
              icon="layers"
            />
          </Section>

          <Section title="Climate & Terrain" description="Rainfall, ground conditions, and vegetation around the location." icon="cloud-rain">
            <NumberField
              label="Elevation (m)"
              value={form.elevation_m}
              onChangeText={set('elevation_m')}
              helperText="Height above sea level. Lower-lying areas are generally at higher risk."
              icon="trending-up"
            />
            <NumberField label="Distance to nearest river (m)" value={form.distance_to_river_m} onChangeText={set('distance_to_river_m')} icon="map" />
            <NumberField
              label="Rainfall, last 7 days (mm)"
              value={form.rainfall_7d_mm}
              onChangeText={set('rainfall_7d_mm')}
              helperText="Total rainfall recorded in this area over the past week."
              icon="cloud-rain"
            />
            <NumberField label="Typical monthly rainfall (mm)" value={form.monthly_rainfall_mm} onChangeText={set('monthly_rainfall_mm')} icon="cloud" />
            <NumberField
              label="Drainage quality (0-2)"
              value={form.drainage_index}
              onChangeText={set('drainage_index')}
              helperText="How well rainwater drains away. 0 = very poor, water pools easily. 2 = excellent."
              icon="sliders"
            />
            <NumberField
              label="Past flooding events"
              value={form.historical_flood_count}
              onChangeText={set('historical_flood_count')}
              helperText="How many times this area has flooded in recorded history."
              icon="alert-triangle"
            />
            <NumberField
              label="Vegetation cover (NDVI, -1 to 1)"
              value={form.ndvi}
              onChangeText={set('ndvi')}
              helperText="How green the area is. -1 = bare ground or water, 1 = dense vegetation. Most land: 0.2 to 0.6."
              icon="feather"
            />
            <NumberField
              label="Surface water index (NDWI, -1 to 1)"
              value={form.ndwi}
              onChangeText={set('ndwi')}
              helperText="How much open water is visible. -1 = dry land, 1 = mostly water. Most land: -0.2 to 0.2."
              icon="droplet"
            />
            <SelectField
              label="Water body directly nearby?"
              value={form.water_presence_flag}
              onChange={set('water_presence_flag')}
              options={options?.water_presence_flag ?? []}
              helperText="Is there a river, lake, or reservoir right next to this location?"
              icon="anchor"
            />
          </Section>

          <Section title="Community & Infrastructure" description="The people, buildings, and services around this location." icon="users">
            <NumberField
              label="Population density (people/km²)"
              value={form.population_density_per_km2}
              onChangeText={set('population_density_per_km2')}
              helperText="Roughly how many people live in each square kilometer of this area."
              icon="users"
            />
            <NumberField
              label="Built-up land (%)"
              value={form.built_up_percent}
              onChangeText={set('built_up_percent')}
              helperText="Share of the area covered by buildings and roads, rather than open land."
              icon="grid"
            />
            <NumberField
              label="Infrastructure quality (0-100)"
              value={form.infrastructure_score}
              onChangeText={set('infrastructure_score')}
              helperText="Overall quality of roads, utilities, and buildings. 0 = very poor, 100 = excellent."
              icon="tool"
            />
            <SelectField label="Water supply" value={form.water_supply} onChange={set('water_supply')} options={options?.water_supply ?? []} icon="droplet" />
            <SelectField label="Electricity access" value={form.electricity} onChange={set('electricity')} options={options?.electricity ?? []} icon="zap" />
            <SelectField label="Road quality" value={form.road_quality} onChange={set('road_quality')} options={options?.road_quality ?? []} icon="navigation-2" />
            <NumberField label="Distance to nearest hospital (km)" value={form.nearest_hospital_km} onChangeText={set('nearest_hospital_km')} icon="plus-circle" />
            <NumberField label="Distance to nearest evacuation center (km)" value={form.nearest_evac_km} onChangeText={set('nearest_evac_km')} icon="shield" />
          </Section>

          <Pressable onPress={() => setShowAdvanced((v) => !v)} style={styles.advancedToggle}>
            <Feather name={showAdvanced ? 'chevron-down' : 'chevron-right'} size={18} color={Colors.brand} />
            <Text style={styles.advancedToggleText}>More options: current conditions & fine-tuning (optional)</Text>
          </Pressable>

          {showAdvanced && (
            <>
              <Section title="Right now" description="If flooding is already happening at this location, add the details here." icon="alert-circle">
                <SelectField
                  label="Is flooding happening right now?"
                  value={form.flood_occurrence_current_event}
                  onChange={set('flood_occurrence_current_event')}
                  options={['No', 'Yes']}
                  icon="alert-octagon"
                />
                {form.flood_occurrence_current_event === 'Yes' && (
                  <NumberField
                    label="Approximate flooded area (sq. m)"
                    value={form.inundation_area_sqm}
                    onChangeText={set('inundation_area_sqm')}
                    helperText="Roughly how much land is currently underwater."
                    icon="maximize"
                  />
                )}
                <SelectField
                  label="Is this location currently livable?"
                  value={form.is_good_to_live}
                  onChange={set('is_good_to_live')}
                  options={['Yes', 'No']}
                  helperText="Leave as 'Yes' unless there's a serious, ongoing issue such as prolonged flooding."
                  icon="home"
                />
                {form.is_good_to_live === 'No' && (
                  <TextField
                    label="Reason (optional)"
                    value={form.reason_not_good_to_live}
                    onChangeText={set('reason_not_good_to_live')}
                    placeholder="e.g. frequent flooding, poor road access"
                    icon="message-square"
                  />
                )}
              </Section>

              <Section
                title="Local fine-tuning"
                description="These advanced figures are filled in automatically using typical values for the selected district. Only change them if you have more accurate local data."
                icon="sliders"
              >
                {ADVANCED_INDEX_FIELDS.map(({ id, label, helper, icon }) => (
                  <NumberField
                    key={id}
                    label={label}
                    value={form[id]}
                    onChangeText={set(id)}
                    placeholder={placeholderFor(id)}
                    helperText={helper}
                    icon={icon}
                  />
                ))}
              </Section>
            </>
          )}

          <Button title={loading ? 'Checking…' : 'Check Flood Risk'} onPress={handleSubmit} loading={loading} />
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
  scroll: {
    flex: 1,
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
  headerBadgeText: {
    color: Colors.textMuted,
    fontFamily: Fonts.semibold,
    fontSize: 11.5,
  },

  // Card headers
  resultContent: {
    gap: Spacing.three,
  },
  formContent: {
    gap: Spacing.one,
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
  cardSubtitle: {
    color: Colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: Spacing.one,
    marginBottom: Spacing.three,
  },
  placeholder: {
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.five,
  },
  placeholderIconBox: {
    width: 64,
    height: 64,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(56,189,248,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: Colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
  },
  bold: {
    color: Colors.text,
    fontFamily: Fonts.bold,
  },
  advancedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    borderWidth: 1,
    borderColor: Glass.border,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: Radius.md,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
    marginBottom: Spacing.one,
  },
  advancedToggleText: {
    flex: 1,
    color: Colors.brand,
    fontFamily: Fonts.bold,
    fontSize: 13.5,
  },
});
