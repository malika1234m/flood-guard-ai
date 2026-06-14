import { StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts, Spacing } from '@/constants/theme';

interface SectionHeaderProps {
  eyebrow: string;
  title: string;
  description?: string;
}

/** Centered eyebrow + title + description, matching the web's `SectionHeader`. */
export function SectionHeader({ eyebrow, title, description }: SectionHeaderProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.title}>{title}</Text>
      {description && <Text style={styles.description}>{description}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: Spacing.one + 2,
  },
  eyebrow: {
    color: Colors.brand,
    fontFamily: Fonts.extrabold,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.6,
  },
  title: {
    color: Colors.text,
    fontFamily: Fonts.extrabold,
    fontSize: 22,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  description: {
    color: Colors.textMuted,
    fontSize: 13.5,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 420,
  },
});
