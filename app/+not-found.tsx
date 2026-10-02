import { useEffect, useState } from 'react';
import { Link, Stack, usePathname, useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View, ActivityIndicator, Platform } from "react-native";
import { apiRequest } from '@/lib/query-client';

function FhirCallbackHandler({ code, state }: { code: string; state: string }) {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Completing MyChart connection...');

  useEffect(() => {
    async function exchange() {
      try {
        const res = await apiRequest('POST', '/api/fhir/exchange', { code, state });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        setStatus('success');
        setMessage('Your VCU Health records are now linked. You can close this window.');

        if (Platform.OS === 'web') {
          try {
            if (window.opener) {
              window.opener.postMessage('fhir-connected', '*');
            }
          } catch {}
          setTimeout(() => {
            try { window.close(); } catch {}
          }, 1500);
        }
      } catch (e: any) {
        setStatus('error');
        setMessage(e.message || 'Failed to complete connection');
      }
    }
    exchange();
  }, [code, state]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.callbackContainer}>
        <View style={styles.callbackCard}>
          {status === 'loading' && (
            <>
              <ActivityIndicator size="large" color="#1565C0" />
              <Text style={styles.callbackTitle}>{message}</Text>
            </>
          )}
          {status === 'success' && (
            <>
              <Text style={styles.callbackEmoji}>✅</Text>
              <Text style={[styles.callbackTitle, { color: '#1565C0' }]}>MyChart Connected!</Text>
              <Text style={styles.callbackSubtitle}>{message}</Text>
            </>
          )}
          {status === 'error' && (
            <>
              <Text style={styles.callbackEmoji}>❌</Text>
              <Text style={[styles.callbackTitle, { color: 'red' }]}>Connection Failed</Text>
              <Text style={styles.callbackSubtitle}>{message}</Text>
            </>
          )}
        </View>
      </View>
    </>
  );
}

export default function NotFoundScreen() {
  const pathname = usePathname();
  const params = useLocalSearchParams<{ code?: string; state?: string; error?: string; error_description?: string }>();

  if (pathname === '/api/fhir/callback') {
    if (params.error) {
      return (
        <>
          <Stack.Screen options={{ headerShown: false }} />
          <View style={styles.callbackContainer}>
            <View style={styles.callbackCard}>
              <Text style={styles.callbackEmoji}>❌</Text>
              <Text style={[styles.callbackTitle, { color: 'red' }]}>Connection Failed</Text>
              <Text style={styles.callbackSubtitle}>{params.error}: {params.error_description || 'Authorization denied'}</Text>
            </View>
          </View>
        </>
      );
    }

    if (params.code && params.state) {
      return <FhirCallbackHandler code={params.code} state={params.state} />;
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: "Oops!" }} />
      <View style={styles.container}>
        <Text style={styles.title}>This screen doesn&apos;t exist.</Text>
        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>Go to home screen!</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
  linkText: {
    fontSize: 14,
    color: "#2e78b7",
  },
  callbackContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f7ff',
    padding: 20,
  },
  callbackCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 40,
    maxWidth: 360,
    width: '100%',
    alignItems: 'center',
  },
  callbackEmoji: { fontSize: 56, marginBottom: 16 },
  callbackTitle: { fontSize: 20, fontWeight: '700', textAlign: 'center', marginTop: 16 },
  callbackSubtitle: { fontSize: 14, color: '#555', textAlign: 'center', marginTop: 8, lineHeight: 20 },
});
