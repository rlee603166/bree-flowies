import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Slide-up sheet chrome: dimmed backdrop, rounded card pinned to the bottom,
 * grab handle, and keyboard avoidance for sheets that hold inputs. Tapping the
 * backdrop (or the system back gesture) closes it.
 */
export function BottomSheet({
  visible,
  onClose,
  onShow,
  children,
  sheetStyle,
}: {
  visible: boolean;
  onClose: () => void;
  /** Fired once the modal is fully presented — handy for focusing an input. */
  onShow?: () => void;
  children: ReactNode;
  sheetStyle?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} onShow={onShow}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          {/* Stop touches inside the sheet from dismissing it. */}
          <Pressable
            style={[
              styles.sheet,
              { backgroundColor: theme.backgroundElement, paddingBottom: insets.bottom + Spacing.three },
              sheetStyle,
            ]}
            onPress={() => {}}
          >
            <View style={[styles.handle, { backgroundColor: theme.border }]} />
            {children}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: Colors.scrimStrong,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: Radius.card + 4,
    borderTopRightRadius: Radius.card + 4,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: Spacing.three,
  },
});
