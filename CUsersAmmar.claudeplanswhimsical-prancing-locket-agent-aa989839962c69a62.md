# Implementation Plan: Phase 4 Milestone 2 (Home/Room Management UI)

## Goal
Implement comprehensive Home and Room management, ensuring strict user/home isolation and persistence of the active home session.

## 1. Repository Layer Updates

### Interface Updates (`src/api/deviceRepository.ts`)
Update `DeviceRepository` to enforce `userId` and `homeId` isolation in all calls.

**Updated Method Signatures:**
- `getHomes(userId: string): Promise<Home[]>`
- `getHome(id: string, userId: string): Promise<Home>`
- `addHome(userId: string, name: string): Promise<Home>`
- `addRoom(homeId: string, userId: string, name: string, type: string): Promise<Room>`
- `getDevicesInRoom(homeId: string, roomId: string): Promise<SiriusDevice[]>`

**New Method Signatures:**
- `renameHome(homeId: string, userId: string, newName: string): Promise<void>`
- `deleteHome(homeId: string, userId: string): Promise<void>`
- `renameRoom(roomId: string, homeId: string, userId: string, newName: string): Promise<void>`

### Implementation Updates (`src/api/repositories/MockDeviceRepository.ts`)
- **`renameHome`**: Find home by `id` and `userId`. Validate `newName`. Update and call `this.save()`.
- **`deleteHome`**: Filter `this.homes` to remove the home matching `id` and `userId`. Call `this.save()`.
- **`renameRoom`**: Find home by `homeId` and `userId`, then find room by `roomId`. Update name and call `this.save()`.
- Update existing methods to match the new interface signatures.

### Composite Layer Updates (`src/api/repositories/CompositeDeviceRepository.ts`)
- Update all method calls to `mockRepo` and `localRepo` to pass the required `userId` and `homeId`.
- Delegate the new `renameHome`, `deleteHome`, and `renameRoom` methods to `mockRepo`.

## 2. Session & App Integration (`App.tsx`)

### Session Integration
- **Hydration**: In the `useEffect` that handles hydration, load the current session using `SessionManager.getSession()`. If `activeHomeId` exists, set `setSelectedHomeId(activeHomeId)`.
- **Active Home Selection**: Update `navigateToHome(homeId)` to call `await SessionManager.setActiveHome(homeId)` before updating local state.

### Persistence
- Ensure `SessionManager` is the source of truth for `activeHomeId`.
- Any change to the active home (selection or deletion) must be reflected in `SessionManager`.

## 3. UI Enhancements

### DashboardScreen (`src/screens/home/DashboardScreen.tsx`)
- **Active Home Visualization**: Use `activeHomeId` from `SessionManager` to apply `styles.activeHomeCard` to the currently active home.
- **Home Management UI**:
    - Add an "Edit" button to `HomeCard`.
    - Implement `ManageHomeModal` allowing:
        - **Rename**: Input field for new name $\rightarrow$ `deviceRepository.renameHome`.
        - **Delete**: Confirmation button $\rightarrow$ `deviceRepository.deleteHome`.
- **Empty State**: Display a friendly "No Homes" message when the list is empty.
- **Deletion Fallback Logic**:
    - When a home is deleted:
        1. If the deleted home was the active home:
            - Fetch updated list of homes.
            - If homes still exist, set the first one as the active home in `SessionManager` and `App.tsx` state.
            - If no homes remain, set `activeHomeId` to `null`.
        2. Refresh the homes list in the UI.

### HomeView (`src/screens/home/HomeView.tsx`)
- **Room Management UI**:
    - Add a "Rename" button to the `RoomSection` header.
    - Implement `RenameRoomModal` $\rightarrow$ `deviceRepository.renameRoom`.
- **Empty State**: Display "No Rooms" message when `home.rooms` is empty.
- **Isolation**: Ensure all calls to `deviceRepository` include the `userId` from `SessionManager`.

## 4. Verification Strategy

### Test Suite
1. **Home Lifecycle**:
    - Create $\rightarrow$ Verify appearance.
    - Select $\rightarrow$ Verify active state $\rightarrow$ Reload App $\rightarrow$ Verify it's still active.
    - Rename $\rightarrow$ Verify change.
    - Delete $\rightarrow$ Verify removal.
2. **Active Home Fallback**:
    - Create Home A and Home B.
    - Set Home A as active.
    - Delete Home A $\rightarrow$ Verify Home B becomes active.
    - Delete Home B $\rightarrow$ Verify no active home.
3. **Room Lifecycle**:
    - Create $\rightarrow$ Verify appearance.
    - Rename $\rightarrow$ Verify change.
    - Verify visibility of empty rooms.
4. **Isolation Check**:
    - Simulate a request for a home/room using a different `userId` $\rightarrow$ Verify it throws an error (not found/forbidden).
5. **UI States**:
    - Clear all homes $\rightarrow$ Verify "No Homes" empty state.
    - Create home, remove all rooms $\rightarrow$ Verify "No Rooms" empty state.

## Critical Files for Implementation
- `src/api/deviceRepository.ts`
- `src/api/repositories/MockDeviceRepository.ts`
- `src/api/repositories/CompositeDeviceRepository.ts`
- `App.tsx`
- `src/screens/home/DashboardScreen.tsx`
- `src/screens/home/HomeView.tsx`
- `src/api/session/SessionManager.ts`
EOF`
