import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { Colors, Fonts, RISK_COLORS, Spacing } from '@/constants/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const SIZE = 172;
const STROKE = 14;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface RiskGaugeProps {
  score: number;
  category: string;
  animationKey?: string | number;
}

export function RiskGauge({ score, category, animationKey }: RiskGaugeProps) {
  const color = RISK_COLORS[category] ?? Colors.brand;
  const clamped = Math.max(0, Math.min(1, score));

  const progress = useSharedValue(0);
  const rippleScale = useSharedValue(0.86);
  const rippleOpacity = useSharedValue(0.5);

  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(clamped, { duration: 1000, easing: Easing.out(Easing.cubic) });

    rippleScale.value = 0.86;
    rippleOpacity.value = 0.5;
    rippleScale.value = withTiming(1.22, { duration: 1100, easing: Easing.out(Easing.ease) });
    rippleOpacity.value = withTiming(0, { duration: 1100, easing: Easing.out(Easing.ease) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clamped, category, animationKey]);

  const animatedCircleProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * (1 - progress.value),
  }));

  const rippleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: rippleScale.value }],
    opacity: rippleOpacity.value,
  }));

  return (
    <View style={styles.wrap}>
      <Animated.View
        style={[styles.ripple, rippleStyle, { width: SIZE, height: SIZE, borderRadius: SIZE / 2, borderColor: color }]}
      />
      <View style={[styles.glow, { shadowColor: color, width: SIZE, height: SIZE, borderRadius: SIZE / 2 }]}>
        <Svg width={SIZE} height={SIZE}>
          <Circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} stroke={Colors.panel2} strokeWidth={STROKE} fill="none" />
          <AnimatedCircle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke={color}
            strokeWidth={STROKE}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            animatedProps={animatedCircleProps}
            rotation={-90}
            origin={`${SIZE / 2}, ${SIZE / 2}`}
          />
        </Svg>
        <View style={styles.center}>
          <Text style={styles.score}>{score.toFixed(3)}</Text>
          <Text style={styles.label}>risk score</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ripple: {
    position: 'absolute',
    borderWidth: 2,
  },
  glow: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  center: {
    position: 'absolute',
    alignItems: 'center',
  },
  score: {
    fontSize: 30,
    fontFamily: Fonts.extrabold,
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  label: {
    marginTop: Spacing.half,
    fontSize: 10.5,
    fontFamily: Fonts.bold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
});
