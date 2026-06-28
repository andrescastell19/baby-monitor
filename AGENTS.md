# AGENTS.md - Baby Monitor App

## Project Overview

Aplicación móvil para monitoreo de bebé mediante cámaras. Dos roles de dispositivo:
- **Android (Cámara/Transmitter)**: Captura video y audio del bebé, procesa señales localmente
- **iPhone (Monitor/Receiver)**: Recibe el stream en tiempo real y muestra alertas

## Tech Stack

| Componente | Tecnología |
|---|---|
| Framework | React Native (Expo managed workflow) |
| Lenguaje | TypeScript |
| Video Streaming | WebRTC (via react-native-webrtc) |
| Conexión | Internet/WebRTC (sin depender de red local) |
| Navegación | React Navigation |
| Estado | Zustand |
| UI | React Native Paper (Material Design) |
| Build | EAS Build (Expo Application Services) |

## Project Structure

```
baby-monitor/
├── AGENTS.md                    # Este archivo
├── package.json
├── tsconfig.json
├── app.json                     # Expo config
├── eas.json                     # EAS Build config
├── src/
│   ├── app/                     # Entry point y providers
│   │   ├── App.tsx
│   │   └── providers.tsx
│   ├── screens/                 # Pantallas
│   │   ├── CameraScreen.tsx     # Android - vista de cámara
│   │   ├── MonitorScreen.tsx    # iPhone - vista de monitor
│   │   └── PairingScreen.tsx    # Emparejamiento de dispositivos
│   ├── components/              # Componentes reutilizables
│   │   ├── VideoStream.tsx
│   │   ├── Controls.tsx
│   │   └── AlertBadge.tsx
│   ├── services/                # Lógica de negocio
│   │   ├── webrtc.ts            # Conexión WebRTC
│   │   ├── signaling.ts         # Servidor de signaling
│   │   └── detection.ts         # Detección básica on-device
│   ├── stores/                  # Estado global
│   │   └── connectionStore.ts
│   ├── hooks/                   # Custom hooks
│   │   ├── useWebRTC.ts
│   │   └── useCamera.ts
│   ├── utils/                   # Utilidades
│   │   └── permissions.ts
│   └── types/                   # Tipos TypeScript
│       └── index.ts
├── server/                      # Servidor de signaling (opcional)
│   ├── package.json
│   └── index.ts
└── assets/                      # Recursos estáticos
    └── icon.png
```

## Architecture

### Flujo de Conexión

```
[Android Camera] <--WebRTC--> [Signaling Server] <--WebRTC--> [iPhone Monitor]
```

1. Ambos dispositivos se conectan al servidor de signaling
2. Android inicia como "transmitter", iPhone como "receiver"
3. Se intercambian SDP offers/answers y ICE candidates
4. Una vez conectados, el video fluye directamente device-to-device via WebRTC
5. El servidor solo facilita el handshake, NO transmite video

### Roles de Dispositivo

**Android (Cámara/Transmitter):**
- Captura cámara trasera (o frontal si está en cuna)
- Captura micrófono
- Envía stream de video/audio
- Ejecuta detección básica on-device (sonido, movimiento)
- Muestra estado de conexión

**iPhone (Monitor/Receiver):**
- Recibe y reproduce stream de video/audio
- Muestra alertas de sonido/movimiento
- Controles de volumen y brillo
- Opción de hablar (audio bidireccional)

## Development Rules

### Code Style
- TypeScript estricto (`strict: true` en tsconfig)
- Funciones component con hooks
- Naming: PascalCase para componentes, camelCase para funciones/variables
- Un componente por archivo
- Separar lógica de UI en custom hooks

### Dependencies
- NO instalar dependencias sin verificar compatibilidad con Expo
- Preferir soluciones de Expo sobre librerías nativas
- Usar `expo-camera`, `expo-av` cuando sea posible
- WebRTC requiere config nativa (ver `react-native-webrtc` docs)

### Testing
- Tests unitarios con Jest
- Tests de componentes con React Native Testing Library
- Comandos:
  ```bash
  npm test                    # Ejecutar todos los tests
  npm run test:watch          # Modo watch
  npm run lint                # Verificar código
  ```

### Git
- Commits descriptivos en español
- Branches: `feature/nombre`, `fix/nombre`, `chore/nombre`
- No commitear `.env` ni secrets

## Environment Variables

Crear archivo `.env`:
```
SIGNALING_SERVER_URL=wss://tu-servidor.com
APP_ENV=development
```

## Build Commands

```bash
# Desarrollo
npx expo start                # Iniciar Expo
npx expo start --android      # Solo Android
npx expo start --ios          # Solo iOS

# Build
eas build --platform android  # Build Android
eas build --platform ios      # Build iOS
eas build --platform all      # Ambos

# Publish
eas update                    # Actualizar OTA
```

## Key Implementation Notes

1. **WebRTC en React Native**: Usar `react-native-webrtc` que expone APIs nativas de WebRTC
2. **Permisos**: Necesarios cámara, micrófono, y permisos de red
3. **Background**: Usar `expo-task-manager` para mantener conexión en background
4. **Notificaciones**: `expo-notifications` para alertas en el iPhone
5. **Señalización**: Implementar WebSocket server simple para el handshake WebRTC

## Current Status

- [ ] Proyecto inicializado
- [ ] Servidor de signaling
- [ ] Pantalla de emparejamiento
- [ ] Conexión WebRTC
- [ ] Stream de video
- [ ] Audio bidireccional
- [ ] Detección de sonido
- [ ] Detección de movimiento
- [ ] Notificaciones
- [ ] UI completa
- [ ] Testing
- [ ] Build y publicación
