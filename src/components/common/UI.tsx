import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  Modal,
} from 'react-native';
import { SiriusTheme } from '../../constants/theme';

interface BoxProps {
  children: React.ReactNode;
  style?: ViewStyle;
  elevation?: 'light' | 'medium' | 'none';
}

export const Box = ({ children, style, elevation = 'none' }: BoxProps) => {
  const boxStyle: ViewStyle = {
    backgroundColor: SiriusTheme.colors.surface,
    borderRadius: SiriusTheme.borderRadius.m,
    padding: SiriusTheme.spacing.m,
    ...(elevation === 'light' ? SiriusTheme.shadows.light : {}),
    ...(elevation === 'medium' ? SiriusTheme.shadows.medium : {}),
  };

  return <View style={[boxStyle, style]}>{children}</View>;
};

interface TextProps {
  children: React.ReactNode;
  style?: TextStyle;
  variant?: 'title' | 'section' | 'card' | 'body' | 'secondary' | 'button' | 'status' | 'screenTitle';
  color?: string;
  numberOfLines?: number;
  ellipsizeMode?: 'head' | 'middle' | 'tail' | 'clip';
}

export const Typography = ({ children, style, variant = 'body', color, numberOfLines, ellipsizeMode }: TextProps) => {
  const variants = {
    title: SiriusTheme.typography.screenTitle,
    section: SiriusTheme.typography.sectionTitle,
    card: SiriusTheme.typography.cardTitle,
    body: SiriusTheme.typography.body,
    secondary: SiriusTheme.typography.secondary,
    button: SiriusTheme.typography.button,
    status: SiriusTheme.typography.status,
    screenTitle: SiriusTheme.typography.screenTitle,
  };

  return (
    <Text
      numberOfLines={numberOfLines}
      ellipsizeMode={ellipsizeMode}
      style={[{ ...variants[variant] } as any, { color: color || SiriusTheme.colors.textPrimary }, style]}
    >
      {children}
    </Text>
  );
};

interface ButtonProps {
  onPress: () => void;
  title: string;
  variant?: 'primary' | 'secondary';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

export const Button = ({ onPress, title, variant = 'primary', loading, disabled, style }: ButtonProps) => {
  const btnStyle: ViewStyle = {
    backgroundColor: variant === 'primary' ? SiriusTheme.colors.primary : SiriusTheme.colors.surface,
    padding: SiriusTheme.spacing.m,
    borderRadius: SiriusTheme.borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: variant === 'secondary' ? 1 : 0,
    borderColor: SiriusTheme.colors.primary,
    opacity: disabled ? 0.5 : 1,
  };

  const textStyle: TextStyle = {
    color: variant === 'primary' ? '#fff' : SiriusTheme.colors.primary,
    ...SiriusTheme.typography.button,
  } as any;

  return (
    <TouchableOpacity style={[btnStyle, style]} onPress={onPress} disabled={disabled}>
      {loading ? <ActivityIndicator color={variant === 'primary' ? '#fff' : SiriusTheme.colors.primary} /> : (
        <Text style={textStyle}>{title}</Text>
      )}
    </TouchableOpacity>
  );
};

interface ModalProps {
  isVisible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export const SiriusModal = ({ isVisible, onClose, title, children }: ModalProps) => {
  return (
    <Modal
      transparent
      visible={isVisible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <View style={styles.header}>
            <Typography variant="card">{title}</Typography>
            <TouchableOpacity onPress={onClose}>
              <Text style={{ fontSize: 24, color: SiriusTheme.colors.textSecondary }}>×</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.content}>
            {children}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: SiriusTheme.colors.surface,
    borderRadius: SiriusTheme.borderRadius.xl,
    width: '100%',
    maxHeight: '80%',
    padding: SiriusTheme.spacing.l,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  content: {
    paddingBottom: 20,
  },
});
