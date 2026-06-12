import { useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { AppButton } from '@/components/ui/app-button';
import { AppTextInput } from '@/components/ui/app-text-input';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Spacing } from '@/constants/theme';

/**
 * Names and starts a roll. `onCreate` should reject on failure so the sheet
 * stays open (the parent surfaces the error) and clears on success.
 */
export function NewEventSheet({
  visible,
  onClose,
  onCreate,
}: {
  visible: boolean;
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
}) {
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

  return (
    <BottomSheet visible={visible} onClose={onClose} onShow={() => inputRef.current?.focus()}>
      <View style={styles.content}>
        <ThemedText type="subtitle">new event</ThemedText>
        <ThemedText type="label" themeColor="textSecondary">
          everyone shoots into one roll — photos stay hidden until it develops.
        </ThemedText>
        <AppTextInput
          ref={inputRef}
          placeholder="what's happening tonight?"
          value={name}
          onChangeText={setName}
          onSubmitEditing={submit}
          returnKeyType="go"
        />
        <AppButton title="start shooting" loading={busy} disabled={!name.trim()} onPress={submit} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.three,
    paddingTop: Spacing.one,
  },
});
