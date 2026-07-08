import React, { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import { QueryProvider } from '@/src/providers/QueryProvider';
import { AuthProvider, useAuth } from '@/src/providers/AuthProvider';
import { navigateDeepLink, parseDeepLink } from '@/src/lib/deepLinks';
import { OfflineBanner } from '@/src/components/OfflineBanner';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

function LoginPromptModal() {
  const { loginPrompt, closeLoginPrompt } = useAuth();

  return (
    <Modal visible={loginPrompt.visible} transparent animationType="slide">
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Sign in required</Text>
          <Text style={styles.modalBody}>{loginPrompt.message}</Text>
          <Pressable style={styles.modalBtn} onPress={closeLoginPrompt}>
            <Text>OK</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function DeepLinkHandler({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const handleUrl = (url: string) => {
      const route = parseDeepLink(url);
      if (route) navigateDeepLink(route);
    };

    Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });

    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, []);

  return children;
}

function AppShell() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <OfflineBanner />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="park/[slug]" options={{ title: 'Park' }} />
        <Stack.Screen name="compare" options={{ title: 'Compare' }} />
        <Stack.Screen name="login" options={{ title: 'Sign in', presentation: 'modal' }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <LoginPromptModal />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  return (
    <QueryProvider>
      <AuthProvider>
        <DeepLinkHandler>
          <AppShell />
        </DeepLinkHandler>
      </AuthProvider>
    </QueryProvider>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  modalBody: { color: '#444', marginBottom: 16 },
  modalBtn: {
    alignSelf: 'flex-end',
    padding: 10,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
  },
});
