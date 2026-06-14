import { StyleSheet, View, type ViewStyle } from 'react-native';

/** RGB triples for the brand palette, used to build soft radial-glow blobs. */
const RGB = {
  brand: '56,189,248',
  brand2: '99,102,241',
  teal: '34,211,238',
  rose: '239,68,68',
} as const;

interface BlobProps {
  rgb: string;
  size: number;
  style: ViewStyle;
}

/**
 * A soft radial glow built from concentric semi-transparent circles
 * (no native blur dependency, but reads as a blurred aurora blob).
 */
function Blob({ rgb, size, style }: BlobProps) {
  return (
    <View style={[{ position: 'absolute', width: size, height: size }, style]}>
      <View
        style={[
          styles.ring,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: `rgba(${rgb},0.10)` },
        ]}
      />
      <View
        style={[
          styles.ring,
          {
            width: size * 0.66,
            height: size * 0.66,
            borderRadius: (size * 0.66) / 2,
            top: size * 0.17,
            left: size * 0.17,
            backgroundColor: `rgba(${rgb},0.16)`,
          },
        ]}
      />
      <View
        style={[
          styles.ring,
          {
            width: size * 0.34,
            height: size * 0.34,
            borderRadius: (size * 0.34) / 2,
            top: size * 0.33,
            left: size * 0.33,
            backgroundColor: `rgba(${rgb},0.22)`,
          },
        ]}
      />
    </View>
  );
}

interface AuroraBackgroundProps {
  variant?: 'hero' | 'page' | 'rose';
}

/** Decorative blurred-gradient blobs behind hero/header sections, matching the web's `.hero-aurora`. */
export function AuroraBackground({ variant = 'hero' }: AuroraBackgroundProps) {
  if (variant === 'rose') {
    return (
      <View style={styles.wrap}>
        <Blob rgb={RGB.rose} size={260} style={{ top: -60, right: -80 }} />
      </View>
    );
  }

  if (variant === 'page') {
    return (
      <View style={styles.wrap}>
        <Blob rgb={RGB.brand} size={260} style={{ top: -90, left: -90 }} />
        <Blob rgb={RGB.brand2} size={240} style={{ top: -60, right: -100 }} />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Blob rgb={RGB.brand} size={300} style={{ top: -100, left: -110 }} />
      <Blob rgb={RGB.brand2} size={280} style={{ top: -40, right: -120 }} />
      <Blob rgb={RGB.teal} size={260} style={{ bottom: -120, left: '20%' }} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
    pointerEvents: 'none',
  },
  ring: {
    position: 'absolute',
  },
});
