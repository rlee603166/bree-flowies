import { ActivityIndicator, Pressable, StyleSheet, type PressableProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type AppButtonProps = Omit<PressableProps, 'children'> & {
  title: string;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
};

export function AppButton({ title, variant = 'primary', loading, disabled, style, ...rest }: AppButtonProps) {
  const theme = useTheme();
  const variantStyle =
    variant === 'primary'
      ? { backgroundColor: theme.accent }
      : variant === 'danger'
        ? { borderWidth: 1, borderColor: theme.danger }
        : { borderWidth: 1, borderColor: theme.border };
  const textColor = variant === 'primary' ? theme.onAccent : variant === 'danger' ? theme.danger : theme.text;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      style={(state) => [
        styles.button,
        variantStyle,
        { opacity: disabled || loading ? 0.4 : state.pressed ? 0.7 : 1 },
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <ThemedText type="smallBold" style={{ color: textColor }}>
          {title}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.three - 2,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.pill,
    minHeight: 50,
  },
});
