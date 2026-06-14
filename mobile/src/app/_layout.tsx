import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { Fraunces_600SemiBold_Italic } from '@expo-google-fonts/fraunces';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from 'expo-blur';
import { useFonts } from 'expo-font';
import { DarkTheme, Tabs, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow';
import { Colors, Fonts, Glass, Radius, Spacing } from '@/constants/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

const ONBOARDING_KEY = 'floodguard_onboarding_complete_v1';

const FloodGuardTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: Colors.brand,
    background: Colors.bg,
    card: Colors.panel,
    text: Colors.text,
    border: Colors.line,
    notification: Colors.brand2,
  },
};

function TabIcon({ name, focused }: { name: keyof typeof Feather.glyphMap; focused: boolean }) {
  return (
    <View style={[styles.tabIcon, focused && styles.tabIconActive]}>
      <Feather name={name} size={20} color={focused ? Colors.brand : Colors.textMuted} />
    </View>
  );
}

function BrandHeaderTitle({ title }: { title: string }) {
  return (
    <View style={styles.headerTitleRow}>
      <Image source={require('@/assets/images/floodguard-icon.png')} style={styles.headerMark} />
      <Text style={styles.headerTitleText}>{title}</Text>
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
    Fraunces_600SemiBold_Italic,
  });
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY)
      .then((value) => setShowOnboarding(value !== 'true'))
      .catch(() => setShowOnboarding(false));
  }, []);

  const ready = (fontsLoaded || !!fontError) && showOnboarding !== null;

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [ready]);

  if (!ready) {
    return null;
  }

  if (showOnboarding) {
    return (
      <ThemeProvider value={FloodGuardTheme}>
        <StatusBar style="light" />
        <OnboardingFlow
          onComplete={() => {
            setShowOnboarding(false);
            AsyncStorage.setItem(ONBOARDING_KEY, 'true').catch(() => {});
          }}
        />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider value={FloodGuardTheme}>
      <StatusBar style="light" />
      <View style={styles.appRoot}>
        <Tabs
          screenOptions={{
            headerStyle: styles.header,
            headerTitleStyle: { color: Colors.text, fontFamily: Fonts.extrabold, fontSize: 17 },
            headerShadowVisible: false,
            tabBarStyle: styles.tabBar,
            tabBarBackground: () => <BlurView intensity={36} tint="dark" style={StyleSheet.absoluteFill} />,
            tabBarActiveTintColor: Colors.brand,
            tabBarInactiveTintColor: Colors.textMuted,
            tabBarLabelStyle: styles.tabBarLabel,
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              headerTitle: () => <BrandHeaderTitle title="FloodGuard AI" />,
              tabBarLabel: 'Home',
              tabBarIcon: ({ focused }) => <TabIcon name="home" focused={focused} />,
            }}
          />
          <Tabs.Screen
            name="predict"
            options={{
              headerTitle: () => <BrandHeaderTitle title="Check Flood Risk" />,
              tabBarLabel: 'Predict',
              tabBarIcon: ({ focused }) => <TabIcon name="droplet" focused={focused} />,
            }}
          />
          <Tabs.Screen
            name="dashboard"
            options={{
              headerTitle: () => <BrandHeaderTitle title="Live Monitoring" />,
              tabBarLabel: 'Dashboard',
              tabBarIcon: ({ focused }) => <TabIcon name="activity" focused={focused} />,
            }}
          />
        </Tabs>

        {__DEV__ && (
          <Pressable
            onPress={() => {
              AsyncStorage.removeItem(ONBOARDING_KEY).catch(() => {});
              setShowOnboarding(true);
            }}
            style={({ pressed }) => [styles.devReplay, pressed && styles.devReplayPressed]}
            hitSlop={8}
            accessibilityLabel="Replay onboarding"
          >
            <Feather name="eye" size={18} color={Colors.bg} />
          </Pressable>
        )}
      </View>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  appRoot: {
    flex: 1,
  },
  devReplay: {
    position: 'absolute',
    right: Spacing.three,
    bottom: 96,
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    backgroundColor: Colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  devReplayPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
  header: {
    backgroundColor: Colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: Glass.border,
  },
  tabBar: {
    backgroundColor: 'transparent',
    borderTopWidth: 1,
    borderTopColor: Glass.border,
  },
  tabBarLabel: {
    fontFamily: Fonts.semibold,
    fontSize: 11,
  },
  tabIcon: {
    width: 40,
    height: 30,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconActive: {
    backgroundColor: 'rgba(56,189,248,0.14)',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  headerMark: {
    width: 28,
    height: 28,
  },
  headerTitleText: {
    color: Colors.text,
    fontFamily: Fonts.extrabold,
    fontSize: 17,
  },
});
