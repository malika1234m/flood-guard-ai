import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';

interface StarRatingProps {
  value: number;
  onChange: (value: number) => void;
}

const ACTIVE_COLOR = '#facc15';

export function StarRating({ value, onChange }: StarRatingProps) {
  return (
    <View style={styles.row}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} onPress={() => onChange(n)} hitSlop={8} style={styles.hit}>
          <Text style={[styles.star, n <= value && styles.starActive]}>{n <= value ? '★' : '☆'}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  hit: {
    padding: Spacing.one,
  },
  star: {
    fontSize: 24,
    color: Colors.line,
  },
  starActive: {
    color: ACTIVE_COLOR,
  },
});
