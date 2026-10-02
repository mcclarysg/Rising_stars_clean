import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { Tabs, Redirect } from 'expo-router';
import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';
import { LinearGradient } from 'expo-linear-gradient';
import { Platform, StyleSheet, useColorScheme, View, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import Colors from '@/constants/colors';

function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: 'house', selected: 'house.fill' }} />
        <Label>Home</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="activity">
        <Icon sf={{ default: 'list.bullet', selected: 'list.bullet' }} />
        <Label>Activity</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="health">
        <Icon sf={{ default: 'calendar', selected: 'calendar' }} />
        <Label>Calendar</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="documents">
        <Icon sf={{ default: 'cross.case', selected: 'cross.case.fill' }} />
        <Label>Medical</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} />
        <Label>Settings</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function GradientTabBar() {
  return (
    <LinearGradient
      colors={['#2AACE2', '#1B7EC2']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={StyleSheet.absoluteFill}
    />
  );
}

function ClassicTabLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const isWeb = Platform.OS === 'web';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#FFFFFF',
        tabBarInactiveTintColor: 'rgba(255,255,255,0.55)',
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarLabelStyle: {
          fontFamily: 'Inter_700Bold',
          fontSize: 11,
        },
        tabBarBackground: () => <GradientTabBar />,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: 'Activity',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'list' : 'list-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="health"
        options={{
          title: 'Calendar',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="documents"
        options={{
          title: 'Medical',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'medkit' : 'medkit-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'settings' : 'settings-outline'} size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/login" />;
  }

  return <ClassicTabLayout />;
}
