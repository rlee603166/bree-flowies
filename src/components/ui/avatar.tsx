import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { Colors, Fonts } from '@/constants/theme';

/** Muted film-stock tones — readable against the dark background. */
const TONES = ['#E8C170', '#A3B18A', '#C97B63', '#7FA8C9', '#B08BBB', '#D4A5A5'];

function toneFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return TONES[Math.abs(hash) % TONES.length];
}

type AvatarProps = {
  name: string;
  size?: number;
  style?: ViewStyle;
};

export function Avatar({ name, size = 34, style }: AvatarProps) {
  return (
    <View
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: toneFor(name),
        },
        style,
      ]}
    >
      <Text style={[styles.initial, { fontSize: size * 0.42 }]}>{name.charAt(0)}</Text>
    </View>
  );
}

export function AvatarStack({ names, size = 34 }: { names: string[]; size?: number }) {
  return (
    <View style={styles.stack}>
      {names.map((name, i) => (
        <Avatar
          key={`${name}-${i}`}
          name={name}
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
    color: '#15130C',
    textTransform: 'lowercase',
  },
  stack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
