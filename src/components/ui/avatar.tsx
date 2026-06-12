import { Image, type ImageStyle } from 'expo-image';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { Colors, Fonts } from '@/constants/theme';

function toneFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return Colors.avatarTones[Math.abs(hash) % Colors.avatarTones.length];
}

type AvatarProps = {
  name: string;
  /** When set, the picture is shown instead of the initial. */
  uri?: string | null;
  size?: number;
  style?: ViewStyle;
};

export function Avatar({ name, uri, size = 34, style }: AvatarProps) {
  const dimensions = { width: size, height: size, borderRadius: size / 2 };

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[styles.circle, dimensions, style as ImageStyle]}
        contentFit="cover"
        recyclingKey={uri}
        transition={150}
      />
    );
  }

  return (
    <View style={[styles.circle, dimensions, { backgroundColor: toneFor(name) }, style]}>
      <Text style={[styles.initial, { fontSize: size * 0.42 }]}>{name.charAt(0)}</Text>
    </View>
  );
}

export type AvatarFace = { name: string; uri?: string | null };

export function AvatarStack({ people, size = 34 }: { people: AvatarFace[]; size?: number }) {
  return (
    <View style={styles.stack}>
      {people.map((person, i) => (
        <Avatar
          key={`${person.name}-${i}`}
          name={person.name}
          uri={person.uri}
          size={size}
          style={i > 0 ? { marginLeft: -size / 3 } : undefined}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.background,
  },
  initial: {
    fontFamily: Fonts.sansBold,
    color: Colors.onAvatarTone,
    textTransform: 'lowercase',
  },
  stack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
