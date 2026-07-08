import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Link, router } from 'expo-router';
import { parkToSlug } from '@trailverse/api';
import { useParks } from '@/src/hooks/useParks';
import { OfflineBanner } from '@/src/components/OfflineBanner';

export default function ExploreScreen() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const { data, isLoading, error, refetch, isRefetching } = useParks({
    search: query || undefined,
    limit: 30,
  });

  const parks = data?.parks || [];

  return (
    <View style={styles.container}>
      <OfflineBanner />
      <View style={styles.header}>
        <Text style={styles.title}>Explore</Text>
        <Link href="/compare" asChild>
          <Pressable style={styles.compareBtn}>
            <Text>Compare</Text>
          </Pressable>
        </Link>
      </View>

      <TextInput
        style={styles.search}
        placeholder="Search parks, states..."
        value={search}
        onChangeText={setSearch}
        onSubmitEditing={() => setQuery(search.trim())}
        returnKeyType="search"
      />

      {isLoading ? (
        <ActivityIndicator style={styles.loader} />
      ) : error ? (
        <Text style={styles.error}>{(error as Error).message}</Text>
      ) : (
        <FlatList
          data={parks}
          keyExtractor={(item) => item.parkCode}
          refreshing={isRefetching}
          onRefresh={() => refetch()}
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() =>
                router.push({
                  pathname: '/park/[slug]',
                  params: { slug: parkToSlug(item.fullName) || item.parkCode },
                })
              }>
              <Text style={styles.parkName}>{item.fullName}</Text>
              <Text style={styles.meta}>{item.states}</Text>
            </Pressable>
          )}
          ListEmptyComponent={<Text style={styles.meta}>No parks found.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  title: { fontSize: 24, fontWeight: '700' },
  compareBtn: { padding: 8, borderWidth: 1, borderColor: '#ccc', borderRadius: 8 },
  search: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
  },
  loader: { marginTop: 24 },
  error: { color: '#ef4444', padding: 16 },
  row: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  parkName: { fontSize: 17, fontWeight: '600' },
  meta: { color: '#666', marginTop: 4 },
});
