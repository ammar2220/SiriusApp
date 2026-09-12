export const SiriusTheme = {
  colors: {
    primary: '#007AFF',
    primaryDark: '#005BBF',
    primaryLight: '#E3F2FD',
    background: '#F8F9FA',
    surface: '#FFFFFF',
    textPrimary: '#1C1C1E',
    textSecondary: '#8E8E93',
    success: '#34C759',
    warning: '#FFCC00',
    error: '#FF3B30',
    offline: '#D1D1D6',
    disabled: '#E5E5EA',
    deviceOn: '#34C759',
    deviceOff: '#8E8E93',
  },
  spacing: {
    xs: 4,
    s: 8,
    m: 16,
    l: 24,
    xl: 32,
    xxl: 48,
  },
  borderRadius: {
    s: 4,
    m: 8,
    l: 16,
    xl: 24,
    full: 9999,
  },
  shadows: {
    light: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
    },
    medium: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 4,
    },
  },
  typography: {
    screenTitle: {
      fontSize: 28,
      fontWeight: 'bold',
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: '600',
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: '500',
    },
    body: {
      fontSize: 14,
      fontWeight: '400',
    },
    secondary: {
      fontSize: 12,
      fontWeight: '400',
    },
    button: {
      fontSize: 16,
      fontWeight: 'bold',
    },
    status: {
      fontSize: 14,
      fontWeight: 'bold',
    },
  },
};

export type Theme = typeof SiriusTheme;
