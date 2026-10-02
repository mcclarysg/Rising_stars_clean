import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { apiRequest } from '@/lib/query-client';

export default function FhirCallbackScreen() {
  const { code, state, error, error_description } = useLocalSearchParams<{
    code?: string;
    state?: string;
    error?: string;
    error_description?: string;
  }>();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Connecting to MyChart...');

  useEffect(() => {
    async function handleCallback() {
      if (error) {
        setStatus('error');
        setMessage(`${error}: ${error_description || 'Connection failed'}`);
        notifyOpener('fhir-error');
        return;
      }

      if (!code || !state) {
        setStatus('error');
        setMessage('Missing authorization code');
        notifyOpener('fhir-error');
        return;
      }

      try {
        const res = await apiRequest('POST', '/api/fhir/exchange', { code, state });
        const data = await res.json();
        if (data.error) {
          throw new Error(data.error);
        }
        setStatus('success');
        setMessage('MyChart Connected! You can close this window.');
        notifyOpener('fhir-connected');
      } catch (e: any) {
        setStatus('error');
        setMessage(e.message || 'Failed to complete connection');
        notifyOpener('fhir-error');
      }
    }

    handleCallback();
  }, [code, state, error, error_description]);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        {status === 'loading' ? (
          <>
            <ActivityIndicator size="large" color="#1565C0" />
            <Text style={styles.text}>{message}</Text>
          </>
        ) : (
          <>
            <Text style={styles.icon}>{status === 'success' ? '✅' : '❌'}</Text>
            <Text style={[styles.title, { color: status === 'success' ? '#1565C0' : 'red' }]}>
              {status === 'success' ? 'MyChart Connected!' : 'Connection Error'}
            </Text>
            <Text style={styles.text}>{message}</Text>
          </>
        )}
      </View>
    </View>
  );
}

function notifyOpener(msg: string) {
  if (Platform.OS !== 'web') return;
  try {
    if (window.opener) {
      window.opener.postMessage(msg, '*');
    }
  } catch {}
  setTimeout(() => {
    try { window.close(); } catch {}
  }, 2000);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f7ff',
    padding: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 40,
    maxWidth: 360,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 4,
  },
  icon: { fontSize: 56, marginBottom: 16 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  text: { fontSize: 16, color: '#555', textAlign: 'center', lineHeight: 24 },
});
