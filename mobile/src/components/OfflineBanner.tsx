import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

export function useNetworkStatus() {
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsConnected(state.isConnected ?? true);
    });
    return unsubscribe;
  }, []);

  return { isConnected };
}

export function OfflineBanner() {
  const { isConnected } = useNetworkStatus();
  if (isConnected) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>You are offline. Some features require a connection.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#f59e0b',
    padding: 8,
  },
  text: {
    color: '#111',
    textAlign: 'center',
    fontSize: 13,
  },
});
