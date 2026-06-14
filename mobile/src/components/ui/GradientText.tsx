import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { Text, type TextStyle } from 'react-native';

import { Gradients } from '@/constants/theme';

interface GradientTextProps {
  children: string;
  style?: TextStyle | TextStyle[];
}

/** Renders text filled with the brand → indigo gradient, matching the web's `.gradient-text`. */
export function GradientText({ children, style }: GradientTextProps) {
  return (
    <MaskedView maskElement={<Text style={style}>{children}</Text>}>
      <LinearGradient colors={Gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <Text style={[style, { opacity: 0 }]}>{children}</Text>
      </LinearGradient>
    </MaskedView>
  );
}
