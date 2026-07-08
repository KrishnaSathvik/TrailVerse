import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { useParkDetail, useParkTabData } from '@/src/hooks/useParkDetail';
import { useSavedParks } from '@/src/hooks/useUserCollections';
import { OfflineBanner } from '@/src/components/OfflineBanner';

const TABS = ['overview', 'alerts', 'places', 'permits', 'reviews'] as const;

export default function ParkDetailScreen() {
  const { slug, tab: initialTab } = useLocalSearchParams<{ slug: string; tab?: string }>();
  const [activeTab, setActiveTab] = useState(
    typeof initialTab === 'string' ? initialTab : 'overview',
  );
  const { data, isLoading, error } = useParkDetail(slug);
  const parkCode = (data as Record<string, unknown> | undefined)?.parkCode as string | undefined;
  const tabQuery = useParkTabData(parkCode, activeTab, activeTab !== 'overview');
  const { savePark } = useSavedParks();

  const fullName = ((data as Record<string, unknown> | undefined)?.fullName as string) || slug;

  return (
    <ScrollView style={styles.container}>
      <OfflineBanner />
      <Pressable onPress={() => router.back()}>
        <Text style={styles.back}>← Back</Text>
      </Pressable>

      {isLoading ? (
        <ActivityIndicator style={styles.loader} />
      ) : error ? (
        <Text style={styles.error}>{(error as Error).message}</Text>
      ) : (
        <>
          <Text style={styles.title}>{fullName}</Text>
          <Text style={styles.meta}>{String((data as Record<string, unknown>)?.states || '')}</Text>

          <View style={styles.actions}>
            {parkCode && (
              <Pressable style={styles.btn} onPress={() => savePark(parkCode, fullName)}>
                <Text>Save</Text>
              </Pressable>
            )}
            <Link
              href={{
                pathname: '/(tabs)/trailie',
                params: { park: parkCode, name: fullName },
              }}
              asChild>
              <Pressable style={styles.btn}>
                <Text>Plan with Trailie</Text>
              </Pressable>
            </Link>
            <Link
              href={{ pathname: '/compare', params: { parks: parkCode || '' } }}
              asChild>
              <Pressable style={styles.btn}>
                <Text>Compare</Text>
              </Pressable>
            </Link>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs}>
            {TABS.map((tab) => (
              <Pressable
                key={tab}
                style={[styles.tab, activeTab === tab && styles.tabActive]}
                onPress={() => setActiveTab(tab)}>
                <Text>{tab}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.tabContent}>
            {activeTab === 'overview' ? (
              <Text>{String((data as Record<string, unknown>)?.description || 'No description.')}</Text>
            ) : tabQuery.isLoading ? (
              <ActivityIndicator />
            ) : tabQuery.error ? (
              <Text style={styles.error}>{(tabQuery.error as Error).message}</Text>
            ) : (
              <Text>{JSON.stringify(tabQuery.data, null, 2)}</Text>
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  back: { color: '#059669', marginBottom: 8 },
  title: { fontSize: 24, fontWeight: '700' },
  meta: { color: '#666', marginBottom: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  btn: { padding: 10, borderWidth: 1, borderColor: '#ccc', borderRadius: 8 },
  tabs: { marginBottom: 12 },
  tab: { paddingHorizontal: 12, paddingVertical: 8, marginRight: 8, borderRadius: 16, backgroundColor: '#f3f4f6' },
  tabActive: { backgroundColor: '#d1fae5' },
  tabContent: { minHeight: 120 },
  loader: { marginTop: 24 },
  error: { color: '#ef4444' },
});
