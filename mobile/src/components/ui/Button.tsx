import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Colors, Fonts, Gradients, Radius, Shadows, Spacing } from '@/constants/theme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
  icon?: keyof typeof Feather.glyphMap;
  fullWidth?: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Button({ title, onPress, loading, disabled, variant = 'primary', icon, fullWidth = true }: ButtonProps) {
  const isDisabled = disabled || loading;
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePressIn = () => {
    scale.value = withTiming(0.97, { duration: 90 });
  };
  const handlePressOut = () => {
    scale.value = withTiming(1, { duration: 150 });
  };

  const textColor = variant === 'primary' ? '#04101f' : variant === 'ghost' ? Colors.brand : Colors.text;

  const inner = loading ? (
    <ActivityIndicator color={textColor} />
  ) : (
    <View style={styles.row}>
      {icon && <Feather name={icon} size={18} color={textColor} />}
      <Text style={[styles.text, { color: textColor }]}>{title}</Text>
    </View>
  );

  if (variant === 'primary') {
    return (
      <AnimatedPressable
        onPress={onPress}
        disabled={isDisabled}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[
          animatedStyle,
          styles.shadowWrap,
          !fullWidth && styles.inline,
          isDisabled && styles.disabled,
        ]}
      >
        <LinearGradient colors={Gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.base}>
          {inner}
        </LinearGradient>
      </AnimatedPressable>
    );
  }

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={isDisabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        animatedStyle,
        styles.base,
        variant === 'secondary' ? styles.secondary : styles.ghost,
        !fullWidth && styles.inline,
        isDisabled && styles.disabled,
      ]}
    >
      {inner}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  shadowWrap: {
    borderRadius: Radius.md,
    ...Shadows.glow(Colors.brand),
  },
  base: {
    borderRadius: Radius.md,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  inline: {
    alignSelf: 'flex-start',
  },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.line,
  },
  ghost: {
    backgroundColor: 'rgba(56,189,248,0.10)',
  },
  disabled: {
    opacity: 0.45,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  text: {
    fontSize: 16,
    fontFamily: Fonts.bold,
  },
});
