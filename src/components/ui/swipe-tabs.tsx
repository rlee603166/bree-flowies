import { SymbolView } from 'expo-symbols';
import { useRef, useState, type ReactNode } from 'react';
import { type LayoutChangeEvent, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type SwipeTab = {
  key: string;
  label: string;
  /** When set, an SF Symbol is shown instead of the text label (IG icon-tabs). */
  icon?: SFSymbol;
  content: ReactNode;
};

/**
 * A row of tabs over a horizontally paged area — tap a label or swipe between
 * pages, Instagram-profile style. Both pages stay mounted; `onIndexChange`
 * fires on tap and on swipe so callers can lazy-load a page when first seen.
 * No motion of its own beyond the native paging scroll (darkroom = no anim).
 */
export function SwipeTabs({
  tabs,
  onIndexChange,
}: {
  tabs: SwipeTab[];
  onIndexChange?: (index: number) => void;
}) {
  const theme = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [index, setIndex] = useState(0);

  const change = (i: number) => {
    setIndex(i);
    onIndexChange?.(i);
  };

  const goTo = (i: number) => {
    scrollRef.current?.scrollTo({ x: i * size.width, animated: true });
    change(i);
  };

  const onLayout = (e: LayoutChangeEvent) =>
    setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });

  return (
    <View style={styles.fill}>
      <View style={[styles.tabBar, { borderBottomColor: theme.border }]}>
        {tabs.map((tab, i) => {
          const active = i === index;
          return (
            <Pressable
              key={tab.key}
              style={styles.tab}
              onPress={() => goTo(i)}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: active }}
            >
              {tab.icon ? (
                <SymbolView name={tab.icon} size={22} tintColor={active ? theme.text : theme.textSecondary} />
              ) : (
                <ThemedText type="smallBold" themeColor={active ? 'text' : 'textSecondary'}>
                  {tab.label}
                </ThemedText>
              )}
              <View style={[styles.underline, { backgroundColor: active ? theme.text : 'transparent' }]} />
            </Pressable>
          );
        })}
      </View>
      <View style={styles.fill} onLayout={onLayout}>
        {size.width > 0 && (
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            keyboardShouldPersistTaps="handled"
            onMomentumScrollEnd={(e) => change(Math.round(e.nativeEvent.contentOffset.x / size.width))}
          >
            {tabs.map((tab) => (
              <View key={tab.key} style={{ width: size.width, height: size.height }}>
                {tab.content}
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingTop: Spacing.three,
    gap: Spacing.two,
  },
  underline: {
    height: 2,
    alignSelf: 'stretch',
    borderRadius: 1,
  },
});
