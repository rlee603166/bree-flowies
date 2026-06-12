import { useEffect, useRef } from 'react';
import { Animated, Keyboard, Platform } from 'react-native';

/**
 * Animated upward shift (translateY) for a vertically centered form, driven by
 * keyboard show/hide only. Unlike KeyboardAvoidingView it ignores the keyboard
 * frame changes fired when focus moves between inputs (autofill / QuickType
 * bars differ per field), which otherwise make the layout jitter.
 *
 * iOS only — Android resizes the window itself (softwareKeyboardLayoutMode).
 */
export function useKeyboardShift(factor = 0.5) {
  const height = useRef(new Animated.Value(0)).current;
  const translateY = useRef(Animated.multiply(height, -factor)).current;
  const visible = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    const show = Keyboard.addListener('keyboardWillShow', (e) => {
      if (visible.current) return; // already shifted; ignore per-field frame changes
      visible.current = true;
      Animated.timing(height, {
        toValue: e.endCoordinates.height,
        duration: e.duration || 250,
        useNativeDriver: true,
      }).start();
    });
    const hide = Keyboard.addListener('keyboardWillHide', (e) => {
      visible.current = false;
      Animated.timing(height, {
        toValue: 0,
        duration: e.duration || 250,
        useNativeDriver: true,
      }).start();
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [height]);

  return translateY;
}
