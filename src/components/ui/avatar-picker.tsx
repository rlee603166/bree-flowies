import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Colors, Fonts } from '@/constants/theme';
import { uploadAvatar } from '@/lib/api';

type AvatarPickerProps = {
  /** Owner of the avatar — storage path is scoped to this id by RLS. */
  userId: string;
  name: string;
  avatarUrl: string | null;
  onChange: (url: string | null) => void;
  size?: number;
};

const PICK_OPTIONS = {
  mediaTypes: ['images'] as ImagePicker.MediaType[],
  allowsEditing: true,
  aspect: [1, 1] as [number, number],
  quality: 0.7,
};

export function AvatarPicker({ userId, name, avatarUrl, onChange, size = 96 }: AvatarPickerProps) {
  const [busy, setBusy] = useState(false);

  const pickFrom = async (source: 'library' | 'camera') => {
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        source === 'camera' ? 'Camera access needed' : 'Photo access needed',
        'You can enable it in Settings to set a profile picture.'
      );
      return;
    }

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(PICK_OPTIONS)
        : await ImagePicker.launchImageLibraryAsync(PICK_OPTIONS);
    if (result.canceled || !result.assets[0]) return;

    setBusy(true);
    try {
      const url = await uploadAvatar(userId, result.assets[0].uri, avatarUrl);
      onChange(url);
    } catch (err) {
      Alert.alert('Could not upload picture', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const openMenu = () => {
    if (busy) return;
    const hasAvatar = !!avatarUrl;

    // The picker must be presented AFTER this menu has fully dismissed —
    // launching the camera from inside an Alert handler (mid-dismissal) leaves
    // iOS's camera controller visible but unresponsive. The native action
    // sheet's callback runs post-dismissal, so the camera presents cleanly.
    if (Platform.OS === 'ios') {
      const labels = [
        'Choose from library',
        'Take photo',
        ...(hasAvatar ? ['Remove photo'] : []),
        'Cancel',
      ];
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: 'Profile picture',
          options: labels,
          cancelButtonIndex: labels.length - 1,
          destructiveButtonIndex: hasAvatar ? 2 : undefined,
        },
        (index) => {
          if (index === 0) void pickFrom('library');
          else if (index === 1) void pickFrom('camera');
          else if (hasAvatar && index === 2) onChange(null);
        }
      );
      return;
    }

    Alert.alert('Profile picture', undefined, [
      { text: 'Choose from library', onPress: () => void pickFrom('library') },
      { text: 'Take photo', onPress: () => void pickFrom('camera') },
      ...(hasAvatar
        ? [{ text: 'Remove photo', style: 'destructive' as const, onPress: () => onChange(null) }]
        : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  return (
    <Pressable onPress={openMenu} disabled={busy} hitSlop={8}>
      <View style={{ width: size, height: size }}>
        <Avatar name={name} uri={avatarUrl} size={size} />
        {busy && (
          <View style={[styles.overlay, { borderRadius: size / 2 }]}>
            <ActivityIndicator color={Colors.accent} />
          </View>
        )}
        {!busy && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>edit</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.scrimStrong,
  },
  badge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: Colors.accent,
    borderWidth: 2,
    borderColor: Colors.background,
  },
  badgeText: {
    fontFamily: Fonts.monoBold,
    fontSize: 9,
    letterSpacing: 0.5,
    color: Colors.onAccent,
    textTransform: 'lowercase',
  },
});
