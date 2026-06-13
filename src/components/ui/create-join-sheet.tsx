import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { AppButton } from '@/components/ui/app-button';
import { AppTextInput } from '@/components/ui/app-text-input';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The "create" entry point reached from the IG header's + icon. Holds the
 * create-group field (moved out of the old sticky action bar) plus a row to
 * scan a QR and join an existing group. `onCreate` should reject on failure so
 * the sheet stays open for a retry.
 */
export function CreateJoinSheet({
  visible,
  onClose,
  onCreate,
}: {
  visible: boolean;
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const router = useRouter();
  const theme = useTheme();
  const inputRef = useRef<TextInput>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await onCreate(trimmed);
      setName('');
    } catch {
      // Parent surfaces the error; keep the sheet open so they can retry.
    } finally {
      setBusy(false);
    }
  };

  const goScan = () => {
    onClose();
    router.push('/scan');
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} onShow={() => inputRef.current?.focus()}>
      <View style={styles.content}>
        <ThemedText type="subtitle">new group</ThemedText>
        <AppTextInput
          ref={inputRef}
          placeholder="group name"
          autoCapitalize="sentences"
          autoCorrect={false}
          value={name}
          onChangeText={setName}
          onSubmitEditing={submit}
          returnKeyType="go"
        />
        <AppButton title="create group" loading={busy} disabled={!name.trim()} onPress={submit} />

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        <Pressable
          onPress={goScan}
          style={({ pressed }) => [
            styles.joinRow,
            { backgroundColor: pressed ? theme.backgroundSelected : theme.background, borderColor: theme.border },
          ]}
        >
          <SymbolView name="qrcode.viewfinder" size={24} tintColor={theme.text} />
          <View style={styles.joinText}>
            <ThemedText type="smallBold">scan to join</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              join a friend&apos;s group with their QR code
            </ThemedText>
          </View>
          <SymbolView name="chevron.right" size={16} tintColor={theme.textSecondary} />
        </Pressable>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.three,
    paddingTop: Spacing.one,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing.one,
  },
  joinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderWidth: 1,
    borderRadius: Radius.card,
  },
  joinText: {
    flex: 1,
  },
});
