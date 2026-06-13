import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SFSymbol } from 'sf-symbols-typescript';

import { ThemedText } from '@/components/themed-text';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type FabAction = { key: string; label: string; icon?: SFSymbol; onPress: () => void };

/**
 * Lower-right speed dial. Closed it's a `+` puck; tapping it reveals the
 * actions stacked above and swaps the glyph to `×`. No motion — it just toggles
 * into place. A faint backdrop catches the next tap to dismiss.
 */
export function FabMenu({ actions }: { actions: FabAction[] }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  return (
    <>
      {open && (
        <Pressable
          style={styles.backdrop}
          onPress={() => setOpen(false)}
          accessibilityLabel="Close menu"
        />
      )}
      <View style={[styles.wrap, { bottom: insets.bottom + Spacing.three }]} pointerEvents="box-none">
        {open &&
          actions.map((action) => (
            <Pressable
              key={action.key}
              onPress={() => {
                setOpen(false);
                action.onPress();
              }}
              style={({ pressed }) => [
                styles.action,
                {
                  backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
                  borderColor: theme.border,
                },
              ]}
            >
              {action.icon && <SymbolView name={action.icon} size={18} tintColor={theme.text} />}
              <ThemedText type="smallBold">{action.label}</ThemedText>
            </Pressable>
          ))}
        <Pressable
          onPress={() => setOpen((o) => !o)}
          accessibilityRole="button"
          accessibilityLabel={open ? 'Close menu' : 'Open menu'}
          style={({ pressed }) => [styles.fab, { backgroundColor: theme.accent, opacity: pressed ? 0.8 : 1 }]}
        >
          <SymbolView name={open ? 'xmark' : 'plus'} size={24} tintColor={theme.onAccent} weight="semibold" />
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.scrim,
  },
  wrap: {
    position: 'absolute',
    right: Spacing.three,
    alignItems: 'flex-end',
    gap: Spacing.two,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.four - 4,
    minHeight: 44,
    justifyContent: 'center',
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
  },
});
