import { Image, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { Colors, Fonts, Spacing } from '@/constants/theme';

interface BrandMarkProps {
  align?: 'left' | 'center';
  style?: ViewStyle;
}

/** Small logo + wordmark lockup shown at the top of each screen's header. */
export function BrandMark({ align = 'left', style }: BrandMarkProps) {
  return (
    <View style={[styles.row, align === 'center' && styles.center, style]}>
      <Image source={require('@/assets/images/floodguard-icon.png')} style={styles.logo} />
      <Text style={styles.text}>FloodGuard AI</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  center: {
    justifyContent: 'center',
  },
  logo: {
    width: 26,
    height: 26,
  },
  text: {
    color: Colors.text,
    fontFamily: Fonts.extrabold,
    fontSize: 12.5,
    textTransform: 'uppercase',
    letterSpacing: 1.6,
  },
});
