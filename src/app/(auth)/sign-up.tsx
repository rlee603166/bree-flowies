import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppButton } from '@/components/ui/app-button';
import { AppTextInput } from '@/components/ui/app-text-input';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { createGroup, joinGroup, listGroups, type GroupSummary } from '@/lib/api';
import { useUserId } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

type FormMode = 'none' | 'create' | 'join';

export default function GroupsScreen() {
    const router = useRouter();
    const theme = useTheme();
    const userId = useUserId();

    const [groups, setGroups] = useState<GroupSummary[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [formMode, setFormMode] = useState<FormMode>('none');
    const [formValue, setFormValue] = useState('');
    const [busy, setBusy] = useState(false);

    const refresh = useCallback(async () => {
        try {
            setGroups(await listGroups());
        } catch (err) {
            Alert.alert('Could not load groups', err instanceof Error ? err.message : undefined);
        } finally {
            setLoaded(true);
            setRefreshing(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            refresh();
        }, [refresh])
    );

    const submitForm = async () => {
        if (!formValue.trim()) return;
        setBusy(true);
        try {
            if (formMode === 'create') {
                const group = await createGroup(formValue, userId);
                router.push({ pathname: '/group/[id]', params: { id: group.id } });
            } else {
                const groupId = await joinGroup(formValue);
                router.push({ pathname: '/group/[id]', params: { id: groupId } });
            }
            setFormMode('none');
            setFormValue('');
            refresh();
        } catch (err) {
            Alert.alert(
                formMode === 'create' ? 'Could not create group' : 'Could not join group',
                err instanceof Error ? err.message : undefined
            );
        } finally {
            setBusy(false);
        }
    };

    return (
        <ThemedView style={styles.container}>
            <FlatList
                data={groups}
                keyExtractor={(g) => g.id}
                contentInsetAdjustmentBehavior="automatic"
                contentContainerStyle={styles.listContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
                renderItem={({ item }) => (
                    <Pressable
                        onPress={() => router.push({ pathname: '/group/[id]', params: { id: item.id } })}
                        style={({ pressed }) => [
                            styles.groupRow,
                            { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
                        ]}
                    >
                        <View style={styles.groupRowText}>
                            <ThemedText type="default">{item.name}</ThemedText>
                            <ThemedText type="small" themeColor="textSecondary">
                                {item.members.length} {item.members.length === 1 ? 'member' : 'members'}
                            </ThemedText>
                        </View>
                        <ThemedText themeColor="textSecondary">›</ThemedText>
                    </Pressable>
                )}
                ListEmptyComponent={
                    loaded ? (
                        <View style={styles.empty}>
                            <ThemedText type="subtitle" style={styles.emptyTitle}>
                                no groups yet
                            </ThemedText>
                            <ThemedText themeColor="textSecondary" style={styles.emptyTitle}>
                                create one for your friends, or join with a code
                            </ThemedText>
                        </View>
                    ) : null
                }
                ListFooterComponent={
                    <View style={styles.footer}>
                        {formMode === 'none' ? (
                            <>
                                <AppButton title="Create a group" onPress={() => setFormMode('create')} />
                                <AppButton title="Join with a code" variant="secondary" onPress={() => setFormMode('join')} />
                            </>
                        ) : (
                                <>
                                    <AppTextInput
                                        placeholder={formMode === 'create' ? 'group name' : 'join code'}
                                        autoFocus
                                        autoCapitalize={formMode === 'join' ? 'characters' : 'sentences'}
                                        autoCorrect={false}
                                        value={formValue}
                                        onChangeText={setFormValue}
                                        onSubmitEditing={submitForm}
                                    />
                                    <AppButton
                                        title={formMode === 'create' ? 'Create' : 'Join'}
                                        loading={busy}
                                        disabled={!formValue.trim()}
                                        onPress={submitForm}
                                    />
                                    <AppButton
                                        title="Cancel"
                                        variant="secondary"
                                        onPress={() => {
                                            setFormMode('none');
                                            setFormValue('');
                                        }}
                                    />
                                </>
                            )}
                        <Pressable onPress={() => supabase.auth.signOut()} style={styles.signOut}>
                            <ThemedText type="small" themeColor="textSecondary">
                                Sign out
                            </ThemedText>
                        </Pressable>
                    </View>
                }
            />
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    listContent: {
        padding: Spacing.three,
        gap: Spacing.two,
    },
    groupRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: Spacing.three,
        borderRadius: Spacing.three,
    },
    groupRowText: {
        flex: 1,
        gap: Spacing.half,
    },
    empty: {
        alignItems: 'center',
        gap: Spacing.two,
        paddingVertical: Spacing.six,
    },
    emptyTitle: {
        textAlign: 'center',
    },
    footer: {
        gap: Spacing.two,
        marginTop: Spacing.four,
    },
    signOut: {
        alignSelf: 'center',
        padding: Spacing.three,
    },
});
