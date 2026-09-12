import React from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  Text,
  Animated,
  Easing,
} from 'react-native';
import { SiriusTheme } from '../../constants/theme';

interface CircularPowerDialProps {
  state: 'on' | 'off';
  onToggle: () => void;
}

export const CircularPowerDial = ({ state, onToggle }: CircularPowerDialProps) => {
  // Animation for the needle rotation
  // Off: 0 deg (roughly pointing up/off)
  // On: 180 deg (roughly pointing down/on)
  const rotation = new Animated.Value(state === 'on' ? 180 : 0);

  React.useEffect(() => {
    Animated.timing(rotation, {
      toValue: state === 'on' ? 180 : 0,
      duration: 400,
      easing: Easing.out(Easing.back(1.5)),
      useNativeDriver: true,
    }).start();
  }, [state]);

  const rotateInterpolate = rotation.interpolate({
    inputRange: [0, 180],
    outputRange: ['0deg', '180deg'],
  });

  return (
    <View style={styles.container}>
      {/* Decorative Sparkles (Simplified for Mock) */}
      <View style={[styles.sparkle, { top: -20, left: '20%' }]}><Text>✨</Text></View>
      <View style={[styles.sparkle, { bottom: -20, right: '20%' }]}><Text>✨</Text></View>
      <View style={[styles.sparkle, { top: '40%', right: -30 }]}><Text>✨</Text></View>
      <View style={[styles.sparkle, { top: '40%', left: -30 }]}><Text>✨</Text></View>

      <TouchableOpacity onPress={onToggle} activeOpacity={0.9} style={styles.dialOuter}>
        <View style={styles.dialInner}>
          <View style={styles.stateLabels}>
            <Text style={[styles.label, state === 'on' ? styles.labelActive : styles.labelInactive]}>ON</Text>
            <View style={styles.divider} />
            <Text style={[styles.label, state === 'off' ? styles.labelActive : styles.labelInactive]}>OFF</Text>
          </View>

          <Animated.View style={[styles.needle, { transform: [{ rotate: rotateInterpolate }] }]}>
            <View style={styles.needleHead} />
            <View style={styles.needleTail} />
          </Animated.View>
        </View>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 240,
    height: 240,
  },
  dialOuter: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: SiriusTheme.colors.surface,
    borderWidth: 8,
    borderColor: SiriusTheme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  dialInner: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: SiriusTheme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  stateLabels: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 20,
  },
  label: {
    fontSize: 18,
    fontWeight: 'bold',
    color: SiriusTheme.colors.textSecondary,
  },
  labelActive: {
    color: SiriusTheme.colors.primary,
  },
  labelInactive: {
    color: SiriusTheme.colors.textSecondary,
    opacity: 0.5,
  },
  divider: {
    width: '60%',
    height: 1,
    backgroundColor: SiriusTheme.colors.disabled,
    marginVertical: 10,
  },
  needle: {
    width: 4,
    height: 70,
    backgroundColor: SiriusTheme.colors.primary,
    position: 'absolute',
    top: 20,
    alignItems: 'center',
    zIndex: 10,
  },
  needleHead: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: SiriusTheme.colors.primary,
    position: 'absolute',
    top: 0,
  },
  needleTail: {
    width: 4,
    height: 60,
    backgroundColor: SiriusTheme.colors.primary,
    marginTop: 8,
  },
  sparkle: {
    position: 'absolute',
    fontSize: 20,
  },
});
