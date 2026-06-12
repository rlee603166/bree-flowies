import { View, type ViewStyle } from 'react-native';

import { Colors } from '@/constants/theme';

type FilmStripProps = {
  /** Number of perforation holes. */
  count?: number;
  direction?: 'row' | 'column';
  holeSize?: number;
  color?: string;
  style?: ViewStyle;
};

/** Static film-edge perforation — a strip of tiny rounded holes, no assets. */
export function FilmStrip({
  count = 8,
  direction = 'row',
  holeSize = 5,
  color = Colors.border,
  style,
}: FilmStripProps) {
  return (
    <View
      style={[
        {
          flexDirection: direction,
          gap: holeSize * 1.5,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={{
            width: holeSize,
            height: holeSize,
            borderRadius: holeSize * 0.3,
            backgroundColor: color,
          }}
        />
      ))}
    </View>
  );
}
