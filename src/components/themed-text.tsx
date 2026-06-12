import { StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'small' | 'smallBold' | 'subtitle' | 'link' | 'linkPrimary' | 'code' | 'label';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return (
    <Text
      style={[
        { color: theme[themeColor ?? 'text'] },
        type === 'default' && styles.default,
        type === 'title' && styles.title,
        type === 'small' && styles.small,
        type === 'smallBold' && styles.smallBold,
        type === 'subtitle' && styles.subtitle,
        type === 'link' && styles.link,
        type === 'linkPrimary' && [styles.link, { color: theme.accent }],
        type === 'code' && styles.code,
        type === 'label' && styles.label,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  small: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    lineHeight: 20,
  },
  smallBold: {
    fontFamily: Fonts.sansBold,
    fontSize: 14,
    lineHeight: 20,
  },
  default: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    lineHeight: 24,
  },
  title: {
    fontFamily: Fonts.sansBold,
    fontSize: 44,
    lineHeight: 50,
    letterSpacing: -1,
  },
  subtitle: {
    fontFamily: Fonts.sansBold,
    fontSize: 28,
    lineHeight: 36,
    letterSpacing: -0.5,
  },
  link: {
    fontFamily: Fonts.sans,
    lineHeight: 30,
    fontSize: 14,
  },
  code: {
    fontFamily: Fonts.mono,
    fontSize: 12,
  },
  /** Tiny mono caption — "darkroom equipment label" voice. */
  label: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
});
