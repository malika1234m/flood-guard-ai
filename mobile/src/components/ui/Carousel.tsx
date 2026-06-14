import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';

interface CarouselProps {
  pages: React.ReactNode[];
  index: number;
  onIndexChange: (index: number) => void;
  style?: ViewStyle;
}

/**
 * Controlled horizontal-paging carousel. Width is measured via onLayout (not
 * useWindowDimensions) so it works correctly when nested inside padded
 * containers. `onMomentumScrollEnd` never fires on react-native-web, so page
 * index is derived from onScroll + scrollEventThrottle.
 */
export function Carousel({ pages, index, onIndexChange, style }: CarouselProps) {
  const [width, setWidth] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const isProgrammatic = useRef(false);
  const lastIndex = useRef(index);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
  }, []);

  useEffect(() => {
    if (!width || lastIndex.current === index) return;
    lastIndex.current = index;
    isProgrammatic.current = true;
    scrollRef.current?.scrollTo({ x: index * width, animated: true });
    const t = setTimeout(() => {
      isProgrammatic.current = false;
    }, 400);
    return () => clearTimeout(t);
  }, [index, width]);

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (isProgrammatic.current || !width) return;
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    if (next !== index && next >= 0 && next < pages.length) {
      lastIndex.current = next;
      onIndexChange(next);
    }
  }

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      onLayout={onLayout}
      onScroll={handleScroll}
      onScrollBeginDrag={() => {
        isProgrammatic.current = false;
      }}
      scrollEventThrottle={16}
      style={style}
    >
      {pages.map((page, i) => (
        <View key={i} style={[styles.page, { width: width || undefined }]}>
          {page}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    height: '100%',
  },
});
