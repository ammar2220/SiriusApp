# UI Bug Exploration Plan

## Objectives
Investigate 6 UI bugs in the SiriusApp codebase.

## Tasks

### 1. Home Greeting
- [ ] Locate the greeting rendering in src/screens/home/HomeView.tsx or src/screens/home/DashboardScreen.tsx.
- [ ] Trace how the user name is retrieved.
- [ ] Identify where the authenticated account displayName should be sourced from.

### 2. Room Summary Counters
- [ ] Find the room counter logic in src/screens/home/HomeView.tsx, src/screens/home/DashboardScreen.tsx, or src/screens/home/RoomView.tsx.
- [ ] Analyze the state management for these counters.
- [ ] Determine why they stay at zero until the room is expanded.

### 3. Device Control Refresh
- [ ] Analyze src/screens/DeviceControlScreen.tsx.
- [ ] Identify the state updates triggered by ON/OFF taps.
- [ ] Find the cause of the full screen refresh (e.g., re-mounts, loading state triggers).

### 4. Room Arrow Layout
- [ ] Inspect the Room card layout in src/screens/home/RoomView.tsx or shared components.
- [ ] Examine the styling of the arrow/icon.
- [ ] Find the cause of the overflow.

### 5. Add Device Header
- [ ] Inspect src/screens/ProvisioningScreen.tsx header.
- [ ] Analyze the styling and container of the "Connecting your Sirius Device" text.
- [ ] Identify why the text is being cut off.

### 6. Wi-Fi Password Visibility
- [ ] Inspect the password TextInput in src/screens/ProvisioningScreen.tsx.
- [ ] Analyze the style properties for text color and background color.
- [ ] Identify why the text is white on a light background.

## Priority Files
- src/screens/home/HomeView.tsx
- src/screens/home/DashboardScreen.tsx
- src/screens/DeviceControlScreen.tsx
- src/screens/ProvisioningScreen.tsx
- src/screens/home/RoomView.tsx
- Shared UI components (Room cards, Headers)
