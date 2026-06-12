import { StyleSheet, TextInput, type TextInputProps } from 'react-native';

import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function AppTextInput({ style, ...rest }: TextInputProps) {
  const theme = useTheme();
  return (
    <TextInput
      placeholderTextColor={theme.textSecondary}
      selectionColor={theme.accent}
      style={[
        styles.input,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
          color: theme.text,
        },
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.four - 4,
    fontSize: 16,
    fontFamily: Fonts.sans,
  },
});
