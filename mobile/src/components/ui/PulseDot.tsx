import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { Colors } from '@/constants/theme';

interface PulseDotProps {
  color?: string;
  size?: number;
}

/** A small dot with an expanding, fading ring — matches the web's `.pulse-dot` "live" indicator. */
export function PulseDot({ color = Colors.brand, size = 7 }: PulseDotProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.ease) }), -1, false);
  }, [progress]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + progress.value * 2.4 }],
    opacity: 0.55 * (1 - progress.value),
  }));

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Animated.View
        style={[
          styles.ring,
          ringStyle,
          { width: size, height: size, borderRadius: size / 2, borderColor: color },
        ]}
      />
      <View style={[styles.dot, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {},
  ring: {
    position: 'absolute',
    borderWidth: 1.5,
  },
});
