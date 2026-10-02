import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface Props {
  children?: React.ReactNode;
  style?: object;
}

export default function ChildHeroBg({ children, style }: Props) {
  return (
    <LinearGradient
      colors={['#5BC8F5', '#82D4FF', '#B4E8FF', '#D4F0FF']}
      locations={[0, 0.4, 0.75, 1]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.container, style]}
    >
      {/* Sun */}
      <View style={styles.sun}>
        <View style={styles.sunGlow} />
        <View style={styles.sunCore} />
      </View>

      {/* Stars */}
      <View style={[styles.star, { top: 44, left: 28 }]} />
      <View style={[styles.star, { top: 70, left: 110 }]} />
      <View style={[styles.star, styles.starLg, { top: 30, right: 88 }]} />
      <View style={[styles.star, { top: 90, right: 52 }]} />
      <View style={[styles.star, styles.starLg, { top: 58, left: 60 }]} />
      <View style={[styles.star, { top: 110, left: 180 }]} />

      {/* Cloud 1 — large, left */}
      <View style={[styles.cloudWrap, { top: 80, left: -10 }]}>
        <View style={[styles.cloudBase, { width: 130, height: 36 }]} />
        <View style={[styles.cloudPuff, { width: 62, height: 62, left: 18, bottom: 18 }]} />
        <View style={[styles.cloudPuff, { width: 50, height: 50, left: 56, bottom: 18 }]} />
      </View>

      {/* Cloud 2 — small, right */}
      <View style={[styles.cloudWrap, { top: 110, right: 10 }]}>
        <View style={[styles.cloudBase, { width: 88, height: 26 }]} />
        <View style={[styles.cloudPuff, { width: 42, height: 42, left: 10, bottom: 14 }]} />
        <View style={[styles.cloudPuff, { width: 34, height: 34, left: 38, bottom: 14 }]} />
      </View>

      {/* Cloud 3 — medium, bottom-left */}
      <View style={[styles.cloudWrap, { bottom: 36, left: 30 }]}>
        <View style={[styles.cloudBase, { width: 100, height: 28 }]} />
        <View style={[styles.cloudPuff, { width: 50, height: 50, left: 12, bottom: 14 }]} />
        <View style={[styles.cloudPuff, { width: 40, height: 40, left: 48, bottom: 14 }]} />
      </View>

      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  sun: {
    position: 'absolute',
    top: -28,
    right: -28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sunGlow: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#FFE566',
    opacity: 0.35,
  },
  sunCore: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFD93D',
    opacity: 0.85,
  },
  star: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFF',
    opacity: 0.8,
  },
  starLg: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    opacity: 0.9,
  },
  cloudWrap: {
    position: 'absolute',
  },
  cloudBase: {
    backgroundColor: '#fff',
    borderRadius: 30,
    opacity: 0.9,
  },
  cloudPuff: {
    position: 'absolute',
    backgroundColor: '#fff',
    borderRadius: 999,
    opacity: 0.95,
  },
});
