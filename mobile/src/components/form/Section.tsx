import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { GlowDivider } from '@/components/ui/GlowDivider';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';

interface SectionProps {
  title: string;
  description?: string;
  icon?: keyof typeof Feather.glyphMap;
  children: React.ReactNode;
}

export function Section({ title, description, icon, children }: SectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        {icon && (
          <View style={styles.iconBox}>
            <Feather name={icon} size={16} color={Colors.brand} />
          </View>
        )}
        <View style={styles.headerText}>
          <Text style={styles.title}>{title}</Text>
          {description ? <Text style={styles.description}>{description}</Text> : null}
        </View>
      </View>
      <GlowDivider style={styles.divider} />
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: Spacing.four + 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two + 2,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(56,189,248,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    gap: Spacing.half,
  },
  title: {
    color: Colors.text,
    fontFamily: Fonts.extrabold,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  description: {
    color: Colors.textMuted,
    fontSize: 12.5,
    lineHeight: 18,
  },
  divider: {
    marginVertical: Spacing.three,
    width: '100%',
    maxWidth: undefined,
  },
  body: {
    gap: Spacing.one,
  },
});
