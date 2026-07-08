import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useCompareParks } from '@/src/hooks/useCompareParks';
import { OfflineBanner, useNetworkStatus } from '@/src/components/OfflineBanner';

export default function CompareScreen() {
  const params = useLocalSearchParams<{ parks?: string }>();
  const initialCodes = useMemo(
    () =>
      (typeof params.parks === 'string' ? params.parks : '')
        .split(',')
        .map((c) => c.trim().toLowerCase())
        .filter(Boolean),
    [params.parks],
  );
  const [codes, setCodes] = useState<string[]>(initialCodes);
  const [input, setInput] = useState('');
  const { isConnected } = useNetworkStatus();
  const { data, isLoading, error } = useCompareParks(codes);

  const addCode = () => {
    const code = input.trim().toLowerCase();
    if (!code || codes.includes(code) || codes.length >= 4) return;
    setCodes((prev) => [...prev, code]);
    setInput('');
  };

  const removeCode = (code: string) => setCodes((prev) => prev.filter((c) => c !== code));

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <OfflineBanner />
      <Text style={styles.title}>Compare parks</Text>

      <View style={styles.chips}>
        {codes.map((code) => (
          <Pressable key={code} style={styles.chip} onPress={() => removeCode(code)}>
            <Text>
              {code} ×
            </Text>
          </Pressable>
        ))}
      </View>

      {codes.length < 4 && (
        <View style={styles.addRow}>
          <TextInput
            style={styles.input}
            placeholder="Park code (e.g. yell)"
            value={input}
            onChangeText={setInput}
            autoCapitalize="none"
          />
          <Pressable style={styles.btn} onPress={addCode}>
            <Text>Add</Text>
          </Pressable>
        </View>
      )}

      {!isConnected && (
        <Text style={styles.warn}>Compare requires an internet connection.</Text>
      )}

      {codes.length < 2 ? (
        <Text style={styles.meta}>Add at least 2 parks to compare.</Text>
      ) : isLoading ? (
        <ActivityIndicator />
      ) : error ? (
        <Text style={styles.error}>{(error as Error).message}</Text>
      ) : (
        <View>
          <Text style={styles.section}>Comparison</Text>
          <Text style={styles.json}>{JSON.stringify(data?.comparison, null, 2)}</Text>
          <Text style={styles.section}>Summary</Text>
          <Text style={styles.json}>{JSON.stringify(data?.summary, null, 2)}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: { padding: 8, backgroundColor: '#f3f4f6', borderRadius: 16 },
  addRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  input: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10 },
  btn: { padding: 10, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, justifyContent: 'center' },
  warn: { color: '#f59e0b', marginBottom: 8 },
  meta: { color: '#666' },
  section: { fontWeight: '600', marginTop: 12, marginBottom: 4 },
  json: { fontFamily: 'Menlo', fontSize: 11 },
  error: { color: '#ef4444' },
});
