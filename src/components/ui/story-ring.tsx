import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Avatar } from '@/components/ui/avatar';
import { Fonts, Spacing } from '@/constants/theme';
import { IG_STORY_GRADIENT } from '@/constants/ig-gradient';
import { useTheme } from '@/hooks/use-theme';

const RING_WIDTH = 2.5;
/** Bare gap between the ring stroke and the avatar, like Instagram's. */
const GAP = 3;

type StoryRingProps = {
  /** Used for the initial + tone when there's no picture. */
  name: string;
  uri?: string | null;
  size?: number;
  /** Live group → glowing IG gradient ring; otherwise a hairline neutral ring. */
  live?: boolean;
  /** Renders a dashed "create" tile with a + instead of an avatar. */
  create?: boolean;
  /** Caption under the ring. Omit to render the ringed avatar on its own. */
  label?: string;
  onPress: () => void;
};

export function StoryRing({ name, uri, size = 68, live, create, label, onPress }: StoryRingProps) {
  const theme = useTheme();
  const radius = size / 2 - RING_WIDTH / 2;
  const inner = size - (RING_WIDTH + GAP) * 2;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.wrap, { width: size + Spacing.two, opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          {live && (
            <Defs>
              <LinearGradient id="ig-ring" x1="0%" y1="100%" x2="100%" y2="0%">
                {IG_STORY_GRADIENT.map((color, i) => (
                  <Stop
                    key={color}
                    offset={`${(i / (IG_STORY_GRADIENT.length - 1)) * 100}%`}
                    stopColor={color}
                  />
                ))}
              </LinearGradient>
            </Defs>
          )}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={live ? 'url(#ig-ring)' : theme.border}
            strokeWidth={live ? RING_WIDTH : 1}
            strokeDasharray={create ? '4 4' : undefined}
          />
        </Svg>

        {create ? (
          <View
            style={[
              styles.create,
              { width: inner, height: inner, borderRadius: inner / 2, backgroundColor: theme.backgroundElement },
            ]}
          >
            <Text style={[styles.plus, { color: theme.text }]}>+</Text>
          </View>
        ) : (
          <Avatar name={name} uri={uri} size={inner} style={styles.avatar} />
        )}
      </View>

      {label != null && (
        <ThemedText
          type="small"
          themeColor={live ? 'text' : 'textSecondary'}
          numberOfLines={1}
          style={styles.label}
        >
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  avatar: {
    borderWidth: 0,
  },
  create: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  plus: {
    fontFamily: Fonts.sans,
    fontSize: 26,
    lineHeight: 30,
  },
  label: {
    fontSize: 12,
    maxWidth: '100%',
  },
});
