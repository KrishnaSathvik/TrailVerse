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
import { useLocalSearchParams } from 'expo-router';
import { useTrailieChat } from '@/src/hooks/useTrailieChat';
import { OfflineBanner } from '@/src/components/OfflineBanner';

export default function TrailieScreen() {
  const params = useLocalSearchParams<{ park?: string; name?: string }>();
  const [input, setInput] = useState('');
  const { messages, streaming, error, sendMessage, clearChat, isOnline } = useTrailieChat(
    typeof params.park === 'string' ? params.park : undefined,
    typeof params.name === 'string' ? params.name : undefined,
  );

  return (
    <View style={styles.container}>
      <OfflineBanner />
      <View style={styles.header}>
        <Text style={styles.title}>Trailie</Text>
        <Pressable onPress={clearChat}>
          <Text style={styles.newChat}>New</Text>
        </Pressable>
      </View>

      {params.name ? (
        <Text style={styles.prefill}>Planning context: {params.name}</Text>
      ) : null}

      {!isOnline && (
        <Text style={styles.offline}>Trailie requires an internet connection.</Text>
      )}

      <FlatList
        style={styles.messages}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View
            style={[
              styles.bubble,
              item.role === 'user' ? styles.userBubble : styles.assistantBubble,
            ]}>
            <Text>{item.content || (streaming && item.role === 'assistant' ? '…' : '')}</Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            Ask Trailie to plan a trip, compare parks, or check live alerts.
          </Text>
        }
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          placeholder="Message Trailie..."
          value={input}
          onChangeText={setInput}
          editable={!streaming}
          onSubmitEditing={() => {
            sendMessage(input);
            setInput('');
          }}
        />
        <Pressable
          style={styles.send}
          disabled={streaming || !input.trim()}
          onPress={() => {
            sendMessage(input);
            setInput('');
          }}>
          {streaming ? <ActivityIndicator /> : <Text>Send</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    alignItems: 'center',
  },
  title: { fontSize: 24, fontWeight: '700' },
  newChat: { color: '#059669' },
  prefill: { paddingHorizontal: 16, color: '#666' },
  offline: { color: '#f59e0b', paddingHorizontal: 16 },
  messages: { flex: 1, paddingHorizontal: 16 },
  bubble: { padding: 12, borderRadius: 12, marginVertical: 4, maxWidth: '85%' },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#d1fae5' },
  assistantBubble: { alignSelf: 'flex-start', backgroundColor: '#f3f4f6' },
  empty: { color: '#666', padding: 16, textAlign: 'center' },
  error: { color: '#ef4444', paddingHorizontal: 16 },
  composer: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    borderTopWidth: 1,
    borderColor: '#eee',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 10,
  },
  send: {
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
  },
});
