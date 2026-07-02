# AGENTS.md - Baby Monitor App

## Project Overview

Aplicación móvil para monitoreo de bebé mediante cámaras. Dos roles de dispositivo:
- **Android (Cámara/Transmitter)**: Captura video y audio del bebé, procesa señales localmente
- **Web (Monitor/Receiver)**: Dashboard en navegador que recibe video via WebSocket relay

## Tech Stack

| Componente | Tecnología |
|---|---|
| Framework | React Native (Expo managed workflow) |
| Lenguaje | TypeScript |
| Video Streaming | WebRTC (Android↔Android) + WebSocket Relay (Android→Web) |
| Conexión | Internet/WebRTC + WebSocket relay |
| Navegación | React Navigation |
| Estado | Zustand |
| UI | React Native Paper (Material Design) |
| Build | Gradle local (EAS free tier agotado) |
| Server | Node.js + ws (WebSocket) en Render.com |

## Arquitectura Hexagonal

**REGLA PRINCIPAL:** Toda lógica de negocio vive en `src/core/`. Los adaptadores implementan puertos. Los usecases orquestan puertos. El core NUNCA importa de adapters o UI.

```
src/
├── core/                          # Dominio puro — 0 dependencias externas
│   ├── ports/                     # Interfaces (puertos)
│   │   ├── SignalingPort.ts       # Transporte de mensajes WebSocket
│   │   ├── StreamPort.ts          # Envío/recepción de video
│   │   ├── DetectionPort.ts       # Detección de sonido/movimiento
│   │   ├── DisplayPort.ts         # Renderizado de video
│   │   ├── AudioPort.ts           # Control de audio
│   │   └── AlertPort.ts           # Gestión de alertas
│   ├── domain/                    # Entidades y lógica de negocio
│   │   ├── Device.ts              # Entidad Device
│   │   ├── Peer.ts                # Entidad Peer (conexión)
│   │   ├── Frame.ts               # Entidad Frame (video)
│   │   ├── Alert.ts               # Entidad Alert
│   │   └── Connection.ts          # Entidad ConnectionState
│   ├── usecases/                  # Casos de uso (orquestan puertos)
│   │   ├── InitializeCamera.ts    # Inicializar modo cámara
│   │   ├── InitializeMonitor.ts   # Inicializar modo monitor
│   │   ├── SendStream.ts          # Enviar stream (WebRTC o Relay)
│   │   ├── ReceiveStream.ts       # Recibir stream
│   │   ├── Detect.ts              # Ejecutar detecciones
│   │   └── ManageAlerts.ts        # Gestión de alertas
│   └── config/                    # Configuración constante
│       └── ice.ts                 # Configuración ICE, frames, quality
│
├── adapters/                      # Implementaciones concretas
│   ├── signaling/
│   │   └── WebSocketSignalingAdapter.ts  # WebSocket client con keepalive
│   ├── streaming/
│   │   ├── WebRTCStreamAdapter.ts        # Android↔Android (WebRTC P2P)
│   │   └── WebSocketRelayAdapter.ts      # Android→Web (relay por server)
│   ├── detection/
│   │   └── WebRTCDetectionAdapter.ts     # Detección via getStats()
│   └── display/
│       ├── CanvasDisplayAdapter.ts       # Web: canvas receiver
│       └── RTCViewDisplayAdapter.ts      # Android: RTCView native
│
├── infra/                         # Infraestructura externa
│   ├── store/
│   │   └── zustandStore.ts        # Zustand store global
│   └── server/
│       ├── index.js               # Servidor signaling + relay (Node.js)
│       ├── package.json           # Dependencias del server
│       └── cert.pem              # Certificados TLS (dev)
│
├── ui/                            # Interfaz de usuario
│   ├── android/                   # React Native (móvil)
│   │   ├── screens/
│   │   │   ├── CameraScreen.tsx   # Vista de cámara
│   │   │   ├── MonitorScreen.tsx  # Vista de monitor
│   │   │   └── PairingScreen.tsx  # Selección de rol
│   │   └── hooks/
│   │       └── useInitialize.ts   # Hook de inicialización
│   └── web/                       # Dashboard web (HTML/JS/CSS)
│       ├── index.html
│       ├── app.js                 # Canvas receiver + alerts
│       └── styles.css
│
├── hooks/                         # Legacy hooks (mantener por compat)
│   ├── useWebRTC.ts
│   └── useCamera.ts
│
├── stores/                        # Legacy stores (mantener por compat)
│   └── connectionStore.ts
│
├── screens/                       # Legacy screens (ya movidas a ui/android)
├── components/                    # Legacy components (vacío)
├── utils/
│   └── permissions.ts
├── types/
│   └── index.ts                   # Tipos compartidos
└── main/
    ├── App.tsx                    # Entry point React Native
    └── providers.tsx
```

## Architecture

### Flujo de Conexión Dual

```
Android Camera ──WebRTC──> Android Monitor  (P2P, funciona en local)
Android Camera ──Relay WS──> Web Monitor     (via server, siempre funciona)
```

**Canal 1 — WebRTC (Android↔Android):**
1. Ambos dispositivos se conectan al servidor de signaling
2. Se intercambian SDP offers/answers y ICE candidates
3. Video fluye directamente device-to-device via WebRTC
4. El servidor solo facilita el handshake

**Canal 2 — Relay (Android→Web):**
1. Android captura frames del canvas cada 200ms (5 FPS)
2. Convierte a JPEG base64 (quality 0.4)
3. Envía por WebSocket al server
4. Server reenvía a todos los monitores web conectados
5. Web dibuja los frames en un canvas

### Roles de Dispositivo

**Android (Cámara/Transmitter):**
- Captura cámara trasera (o frontal si está en cuna)
- Captura micrófono
- Envía stream via WebRTC (a Android) y relay (a Web)
- Ejecuta detección básica on-device (sonido, movimiento)
- Muestra estado de conexión y monitores conectados

**Web (Monitor/Receiver):**
- Recibe frames base64 por WebSocket
- Muestra en canvas HTML
- Recibe alertas de sonido/movimiento
- Controles de screenshot y fullscreen

### Capas de la Arquitectura

```
┌─────────────────────────────────────────────┐
│  UI Layer (src/ui/)                         │
│  Screens, hooks, components                 │
│  Depende de: Core usecases + Adapters       │
├─────────────────────────────────────────────┤
│  Core Layer (src/core/)                     │
│  Ports (interfaces) + Domain + Use Cases    │
│  DEPENDE DE: NADA (dominio puro)            │
├─────────────────────────────────────────────┤
│  Adapters Layer (src/adapters/)             │
│  Implementaciones concretas de puertos      │
│  Depende de: Core ports + libs externas     │
├─────────────────────────────────────────────┤
│  Infra Layer (src/infra/)                   │
│  Store, server, permisos                    │
│  Depende de: Adapters                       │
└─────────────────────────────────────────────┘
```

### Reglas de Dependencia

```
core/ports → (sin dependencias, solo interfaces TypeScript)
core/domain → (sin dependencias, solo entidades)
core/usecases → ports (solo interfaces)
adapters/* → core/ports + libs externas (react-native-webrtc, ws, etc.)
ui/* → core/usecases + adapters + react
infra/* → adapters (implementa puertos con Zustand, Node.js, etc.)
```

**NUNCA hacer:**
- `core/` importa de `adapters/`, `ui/`, o `infra/`
- `adapters/` importa de `ui/`
- Direct dependency de servicios viejos (`services/signaling.ts`, `services/webrtc.ts`) — usar adapters

### Canal Dual — Cómo funciona

El `useInitialize` hook orquesta ambos canales:

```typescript
// En useInitialize.ts
const webrtcStream = new WebRTCStreamAdapter(signaling);  // Para Android↔Android
const relayStream = new WebSocketRelayAdapter(signaling);  // Para Android→Web

// Cuando un monitor se conecta:
// - Si platform='android' → WebRTCStreamAdapter.addMonitor()
// - Si platform='web' → WebSocketRelayAdapter.addMonitor()
```

El server distingue monitores web de android por el campo `platform` en el registro.

## Development Rules

### Code Style
- TypeScript estricto (`strict: true` en tsconfig)
- Funciones component con hooks
- Naming: PascalCase para componentes, camelCase para funciones/variables
- Un componente por archivo
- Separar lógica de UI en custom hooks

### Arquitectura Hexagonal — Reglas estrictas

1. **Core es sagrado**: `src/core/` nunca importa de adapters, UI, o infra
2. **Puertos son interfaces**: Definidas en `src/core/ports/`, implementadas en `src/adapters/`
3. **Use cases orquestan**: `src/core/usecases/` usa puertos, no implementaciones concretas
4. **Adapters son intercambiables**: Para cambiar WebRTC por otro protocolo, solo crear nuevo adapter
5. **UI solo consume**: Las screens importan usecases y adapters, nunca core directamente
6. **Al agregar funcionalidad nueva:**
   - Definir puerto en `src/core/ports/`
   - Crear adapter en `src/adapters/`
   - Crear usecase en `src/core/usecases/`
   - Conectar en UI via hooks

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
SIGNALING_SERVER_URL=wss://baby-monitor-signaling-20xt.onrender.com
APP_ENV=development
```

## Build Commands

```bash
# Desarrollo
npx expo start                # Iniciar Expo
npx expo start --android      # Solo Android

# Build APK (local, EAS free tier agotado)
export JAVA_HOME=~/java/zulu17.54.21-ca-jdk17.0.13-macosx_aarch64
export ANDROID_HOME=~/android-sdk
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/build-tools/35.0.0:$PATH"
cd android && ./gradlew assembleRelease

# Firmar APK
export JAVA_HOME=~/java/zulu17.54.21-ca-jdk17.0.13-macosx_aarch64
export PATH="$JAVA_HOME/bin:$PATH"
~/android-sdk/build-tools/35.0.0/apksigner sign \
  --ks app/baby-monitor.keystore \
  --ks-pass pass:babymonitor123 \
  --key-pass pass:babymonitor123 \
  --out baby-monitor-release.apk \
  app/build/outputs/apk/release/app-release.apk

# Deploy server (auto via git push a main)
git push origin main
```

## Server

El servidor (`src/infra/server/index.js`) maneja:
1. **Registro de devices** con role + platform
2. **Routing de WebRTC signaling** (offer/answer/candidate)
3. **Relay de frames** a monitores web
4. **Heartbeat** con timeout de 30s
5. **Static file serving** del dashboard web

### Configuración del server
- Puerto: `process.env.PORT || 8888`
- Web directory: `src/ui/web/`
- Deploy: Render.com (auto-deploy from main)

## Key Implementation Notes

1. **WebRTC**: Usar `react-native-webrtc` que expone APIs nativas de WebRTC
2. **Relay**: Frames se envían como base64 JPEG cada 200ms (5 FPS, quality 0.4)
3. **Keepalive**: El `WebSocketSignalingAdapter` envía ping cada 20s para mantener la conexión viva
4. **Permisos**: Necesarios cámara, micrófono, y permisos de red
5. **Server heartbeat**: Actualiza `lastPong` con cualquier mensaje recibido (no solo pong de protocolo)

## Current Status

- [x] Proyecto inicializado (Expo 54, RN 0.81)
- [x] Servidor de signaling (Render.com)
- [x] Pantalla de emparejamiento
- [x] Conexión WebRTC (Android↔Android)
- [x] Stream de video (WebRTC + Relay)
- [x] Detección de sonido
- [x] Detección de movimiento
- [x] Arquitectura hexagonal (core/adapters/ui/infra)
- [x] Canal dual (WebRTC + WebSocket relay)
- [x] Web dashboard con canvas receiver
- [x] Keepalive + reconnect
- [ ] Audio bidireccional
- [ ] Notificaciones push
- [ ] Testing
- [ ] Build y publicación
