import React, { ReactNode } from 'react';
import { PaperProvider, MD3DarkTheme } from 'react-native-paper';
import { NavigationContainer } from '@react-navigation/native';

const theme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#3498db',
    secondary: '#2ecc71',
    background: '#1a1a2e',
    surface: '#2d2d44',
    text: '#ffffff',
  },
};

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <PaperProvider theme={theme}>
      <NavigationContainer>
        {children}
      </NavigationContainer>
    </PaperProvider>
  );
}
