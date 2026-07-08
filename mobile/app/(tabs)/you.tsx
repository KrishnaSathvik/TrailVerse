import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { useAuth } from '@/src/providers/AuthProvider';
import { useSavedParks, useUserTrips, useVisitedParks } from '@/src/hooks/useUserCollections';

export default function YouScreen() {
  const { user, isAuthenticated, loading, logout } = useAuth();
  const saved = useSavedParks();
  const visited = useVisitedParks();
  const trips = useUserTrips();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>You</Text>
        <Text style={styles.subtitle}>Sign in to save parks, track visits, and sync trips.</Text>
        <Link href="/login" asChild>
          <Pressable style={styles.primaryBtn}>
            <Text style={styles.primaryBtnText}>Sign in</Text>
          </Pressable>
        </Link>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>You</Text>
      <Text style={styles.subtitle}>
        {user?.firstName} {user?.lastName} · {user?.email}
      </Text>

      <Text style={styles.section}>Saved parks ({saved.data?.length ?? 0})</Text>
      {saved.isLoading ? (
        <ActivityIndicator />
      ) : (
        ((saved.data as Array<{ parkCode?: string; parkName?: string }>) || [])
          .slice(0, 5)
          .map((park) => (
          <Text key={park.parkCode} style={styles.item}>
            {park.parkName || park.parkCode}
          </Text>
        ))
      )}

      <Text style={styles.section}>Visited ({visited.data?.length ?? 0})</Text>
      {visited.isLoading ? (
        <ActivityIndicator />
      ) : (
        ((visited.data as Array<{ parkCode?: string; parkName?: string }>) || [])
          .slice(0, 5)
          .map((park) => (
          <Text key={park.parkCode} style={styles.item}>
            {park.parkName || park.parkCode}
          </Text>
        ))
      )}

      <Text style={styles.section}>Trips ({Array.isArray(trips.data) ? trips.data.length : 0})</Text>
      {trips.isLoading ? (
        <ActivityIndicator />
      ) : (
        (Array.isArray(trips.data) ? (trips.data as Array<{ _id?: string; title?: string }>) : [])
          .slice(0, 5)
          .map((trip) => (
          <Text key={trip._id} style={styles.item}>
            {trip.title || trip._id}
          </Text>
        ))
      )}

      <Pressable style={styles.logoutBtn} onPress={() => logout()}>
        <Text style={styles.logoutText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '700' },
  subtitle: { color: '#666', marginTop: 4, marginBottom: 16 },
  section: { fontSize: 17, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  item: { paddingVertical: 4, color: '#333' },
  primaryBtn: {
    marginTop: 16,
    backgroundColor: '#059669',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '600' },
  logoutBtn: { marginTop: 32, padding: 12, alignItems: 'center' },
  logoutText: { color: '#ef4444' },
});
