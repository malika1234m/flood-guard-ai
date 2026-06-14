import { BlurView } from 'expo-blur';
import { StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';

import { Colors, Glass, Radius, Shadows, Spacing } from '@/constants/theme';

interface CardProps extends ViewProps {
  variant?: 'solid' | 'glass';
  contentStyle?: ViewStyle | ViewStyle[];
}

export function Card({ style, contentStyle, variant = 'solid', ...props }: CardProps) {
  if (variant === 'glass') {
    return (
      <View style={[styles.glassWrap, style]}>
        <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, styles.glassTint]} />
        <View style={[styles.glassContent, contentStyle]} {...props} />
      </View>
    );
  }

  return <View style={[styles.card, style]} {...props} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.panel,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.line,
    padding: Spacing.three,
    ...Shadows.card,
  },
  glassWrap: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Glass.border,
    overflow: 'hidden',
    ...Shadows.card,
  },
  glassTint: {
    backgroundColor: Glass.bg,
  },
  glassContent: {
    padding: Spacing.three + 2,
  },
});
