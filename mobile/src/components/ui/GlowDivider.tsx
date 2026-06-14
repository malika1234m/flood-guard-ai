import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View, type ViewStyle } from 'react-native';

/** A faint horizontal brand-gradient hairline, matching the web's `.glow-divider`. */
export function GlowDivider({ style }: { style?: ViewStyle }) {
  return (
    <View style={[styles.wrap, style]}>
      <LinearGradient
        colors={['transparent', 'rgba(56,189,248,0.5)', 'rgba(99,102,241,0.5)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.line}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'center',
    width: '80%',
    maxWidth: 360,
  },
  line: {
    height: 1,
    width: '100%',
  },
});
