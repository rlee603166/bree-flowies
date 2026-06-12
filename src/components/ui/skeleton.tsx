import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Colors } from '@/constants/theme';

/** Pulsing placeholder block for content that is still loading. */
export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={[styles.base, style]}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.pulse, { opacity: pulse }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: Colors.backgroundElement,
    overflow: 'hidden',
  },
  pulse: {
    backgroundColor: Colors.backgroundSelected,
  },
});
