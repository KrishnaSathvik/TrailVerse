import { useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView from 'react-native-maps';
import { router } from 'expo-router';
import { parkToSlug } from '@trailverse/api';
import { useMapParks } from '@/src/hooks/useMapParks';
import ParksMapView, { type MapParkPin, focusMapPark } from '@/src/components/ParksMapView';
import { buildAppleMapsUrl } from '@/src/lib/deepLinks';
import { OfflineBanner } from '@/src/components/OfflineBanner';

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<ComponentRef<typeof MapView>>(null);
  const { data, isLoading, error } = useMapParks();
  const [selected, setSelected] = useState<MapParkPin | null>(null);
  const [search, setSearch] = useState('');

  const parks = (data || []) as MapParkPin[];

  const filteredParks = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return parks;
    return parks.filter(
      (p) =>
        p.fullName?.toLowerCase().includes(q) ||
        p.states?.toLowerCase().includes(q) ||
        p.parkCode?.toLowerCase().includes(q),
    );
  }, [parks, search]);

  const handleSelectPark = (park: MapParkPin) => {
    setSelected(park);
    focusMapPark(mapRef, park);
  };

  const handleSearchSubmit = () => {
    const q = search.trim().toLowerCase();
    if (!q) return;
    const match = parks.find(
      (p) =>
        p.fullName?.toLowerCase().includes(q) ||
        p.parkCode?.toLowerCase() === q,
    );
    if (match) handleSelectPark(match);
  };

  if (isLoading && parks.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#059669" />
        <Text style={styles.loadingText}>Loading parks…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{(error as Error).message}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <OfflineBanner />
      <ParksMapView
        mapRef={mapRef}
        parks={filteredParks}
        selectedParkCode={selected?.parkCode}
        onSelectPark={handleSelectPark}
      />

      <View style={[styles.searchWrap, { top: insets.top + 8 }]}>
        <TextInput
          style={styles.search}
          placeholder="Search parks…"
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={handleSearchSubmit}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        <Text style={styles.pill}>{filteredParks.length} parks</Text>
      </View>

      {selected && (
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Text style={styles.parkName}>{selected.fullName}</Text>
          <Text style={styles.meta}>{selected.states}</Text>
          <View style={styles.actions}>
            <Pressable
              style={styles.btn}
              onPress={() =>
                router.push({
                  pathname: '/park/[slug]',
                  params: { slug: parkToSlug(selected.fullName) || selected.parkCode },
                })
              }>
              <Text style={styles.btnText}>View park</Text>
            </Pressable>
            {selected.latitude && selected.longitude && (
              <Pressable
                style={styles.btn}
                onPress={() =>
                  Linking.openURL(
                    buildAppleMapsUrl(
                      Number(selected.latitude),
                      Number(selected.longitude),
                      selected.fullName,
                    ),
                  )
                }>
                <Text style={styles.btnText}>Directions</Text>
              </Pressable>
            )}
          </View>
          <Pressable onPress={() => setSelected(null)}>
            <Text style={styles.dismiss}>Close</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 12, color: '#666' },
  error: { color: '#ef4444', textAlign: 'center' },
  searchWrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    gap: 6,
  },
  search: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 17,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  pill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 12,
    color: '#444',
    overflow: 'hidden',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderColor: '#e5e7eb',
    padding: 16,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
    elevation: 8,
  },
  parkName: { fontSize: 17, fontWeight: '600' },
  meta: { color: '#666', marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  btn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#059669',
    borderRadius: 10,
  },
  btnText: { color: '#fff', fontWeight: '600' },
  dismiss: { marginTop: 12, color: '#059669', textAlign: 'center' },
});
