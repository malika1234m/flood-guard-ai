import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Fonts, Gradients, Radius, Spacing } from '@/constants/theme';

interface Slide {
  image: number;
  eyebrow: string;
  title: string;
  accent: string;
  description: string;
}

const SLIDES: Slide[] = [
  {
    image: require('@/assets/images/onboarding-1.jpg'),
    eyebrow: 'AI-powered flood intelligence',
    title: 'See flood risk',
    accent: 'before the water rises.',
    description:
      'FloodGuard AI checks terrain, rainfall, and decades of flood history to score risk for any location in Sri Lanka — in seconds.',
  },
  {
    image: require('@/assets/images/onboarding-2.jpg'),
    eyebrow: 'Real-time operations dashboard',
    title: 'Watch conditions',
    accent: 'unfold, district by district.',
    description:
      'Track live assessment activity, response times, and emerging hotspots on a shared dashboard — built for teams coordinating on the ground.',
  },
];

interface OnboardingFlowProps {
  onComplete: () => void;
}

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const { width: screenWidth } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const isLast = index === SLIDES.length - 1;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [index, fade]);

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
    if (next !== index && next >= 0 && next < SLIDES.length) {
      setIndex(next);
    }
  }

  function goNext() {
    if (isLast) {
      onComplete();
      return;
    }
    scrollRef.current?.scrollTo({ x: (index + 1) * screenWidth, animated: true });
  }

  return (
    <View style={styles.root}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {SLIDES.map((slide) => (
          <View key={slide.title} style={[styles.slide, { width: screenWidth }]}>
            <Image source={slide.image} style={styles.image} resizeMode="contain" />
            <LinearGradient
              colors={['transparent', 'rgba(11,19,32,0.6)', Colors.bg]}
              locations={[0, 0.5, 1]}
              style={styles.gradient}
            />
          </View>
        ))}
      </ScrollView>

      <SafeAreaView style={styles.overlay} edges={['top', 'bottom']}>
        <View style={styles.topRow}>
          {!isLast && (
            <Pressable onPress={onComplete} style={styles.skip} hitSlop={8}>
              <Text style={styles.skipText}>Skip</Text>
            </Pressable>
          )}
        </View>

        <Animated.View
          style={[
            styles.bottom,
            {
              opacity: fade,
              transform: [
                {
                  translateY: fade.interpolate({
                    inputRange: [0, 1],
                    outputRange: [14, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.eyebrowPill}>
            <View style={styles.eyebrowDot} />
            <Text style={styles.eyebrow}>{SLIDES[index].eyebrow}</Text>
          </View>
          <Text style={styles.title}>{SLIDES[index].title}</Text>
          <Text style={styles.accent}>{SLIDES[index].accent}</Text>
          <Text style={styles.description}>{SLIDES[index].description}</Text>

          <View style={styles.footer}>
            <View style={styles.dots}>
              {SLIDES.map((_, i) => (
                <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
              ))}
            </View>
            <Pressable
              onPress={goNext}
              style={({ pressed }) => [styles.nextWrap, pressed && styles.nextWrapPressed]}
            >
              <LinearGradient
                colors={Gradients.brand}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.nextButton}
              >
                <Text style={styles.nextText}>{isLast ? 'Go to Home' : 'Next'}</Text>
                <Feather name={isLast ? 'home' : 'arrow-right'} size={16} color="#04101f" />
              </LinearGradient>
            </Pressable>
          </View>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  slide: {
    height: '100%',
  },
  image: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  gradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '65%',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
    pointerEvents: 'box-none',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  skip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  skipText: {
    color: Colors.text,
    fontFamily: Fonts.semibold,
    fontSize: 13,
  },
  bottom: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
    gap: Spacing.two,
  },
  eyebrowPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.two,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
    marginBottom: Spacing.two,
  },
  eyebrowDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.brand,
  },
  eyebrow: {
    color: Colors.text,
    fontFamily: Fonts.extrabold,
    fontSize: 10.5,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  title: {
    color: Colors.text,
    fontFamily: Fonts.extrabold,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.5,
  },
  accent: {
    color: Colors.brand,
    fontFamily: Fonts.serifItalic,
    fontSize: 27,
    lineHeight: 34,
    marginBottom: Spacing.two,
  },
  description: {
    color: Colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 420,
    marginBottom: Spacing.four,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  dotActive: {
    width: 22,
    backgroundColor: Colors.brand,
  },
  nextWrap: {
    borderRadius: Radius.full,
  },
  nextWrapPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.three,
  },
  nextText: {
    color: '#04101f',
    fontFamily: Fonts.extrabold,
    fontSize: 14.5,
  },
});
