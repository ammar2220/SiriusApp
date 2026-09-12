# Sirius UX Specification

This document defines the information architecture and screen-level specifications for the Sirius smart-home application.

## 1. Application Hierarchy

The application follows a hierarchical structure designed for scalability from a single device to a multi-home ecosystem.

**Sirius App**
├── **Home Dashboard** (Root)
│   └── **Room View** (Nested)
│       └── **Device Control** (Detail)
├── **Automations** (Global)
└── **Profile** (Settings/Account)

### Logical Data Model
- **Home**: `id`, `name`, `rooms[]`
- **Room**: `id`, `name`, `type`, `devices[]`
- **Device**: `factoryId`, `name`, `roomId`, `powerState`, `connectionStatus`, `ipAddress`, `rssi`

---

## 2. Main Screen Specifications

### 2.1 Home Dashboard
**Purpose**: Provide an immediate overview of the entire home and quick access to most-used devices.

**Layout**:
- **Header**:
    - User greeting ("Hi Ammar").
    - Home name dropdown (for future multi-home support).
    - Quick-add button (+).
- **Body**:
    - **Room-based Grouping**: Vertical list of rooms.
    - **Room Row**: Section title (e.g., "Living Room") with a "See all" link.
    - **Device Grid**: 2-column grid of device cards within each room.
    - **Device Card**:
        - Icon representing device type.
        - Device name.
        - Power state toggle (immediate action).
        - Online/Offline indicator.
- **Empty State**: If no rooms exist, show a "No Rooms Yet" illustration with an "Add Room" CTA.

### 2.2 Room View
**Purpose**: Focused control of all devices within a specific physical space.

**Layout**:
- **Header**: Room name and back button.
- **Body**:
    - Full grid of all devices assigned to this room.
    - "Add Device" button at the bottom of the grid.
- **Interaction**: Tapping a device card opens the **Device Control** screen.

### 2.3 Device Control
**Purpose**: Detailed management and monitoring of a single hardware unit.

**Layout**:
- **Header**: Device name and room context.
- **Status Section**: 
    - Connection status (Connected/Disconnected).
    - Current IP address and signal strength (RSSI).
- **Main Control**:
    - Large central power toggle.
    - Visual feedback (glow effect) based on state.
- **Details Section**:
    - Factory ID.
    - Firmware version.
    - Last seen timestamp.

---

## 3. Core User Flows

### 3.1 Provisioning a New Device
1. **Entry**: Home $\rightarrow$ (+) Button $\rightarrow$ "Add Device".
2. **Connection**: App connects to ESP32 SoftAP $\rightarrow$ Sends Home Wi-Fi credentials.
3. **Verification**: App disconnects from SoftAP $\rightarrow$ Discovers device via mDNS on Home Wi-Fi $\rightarrow$ Verifies Factory ID.
4. **Completion**: Device is automatically added to the selected Room $\rightarrow$ Redirects to **Device Control**.

### 3.2 Controlling a Device
1. **Quick Action**: Home $\rightarrow$ Toggle switch on Device Card $\rightarrow$ State updates.
2. **Detailed Action**: Home $\rightarrow$ Tap Card $\rightarrow$ **Device Control** $\rightarrow$ Toggle power $\rightarrow$ State updates.

---

## 4. Future Scalability
The architecture is designed to support:
- **Scenes**: Global triggers (e.g., "Movie Night") that control multiple devices across rooms.
- **Automations**: Time-based or sensor-based triggers.
- **Members**: Shared home access with different permission levels.
- **Cloud**: Transition from `apiClient.local` to a hybrid `local/cloud` approach without changing the UI layer.
