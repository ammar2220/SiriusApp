# Design Plan: Fix 'Connecting' Hang After Provisioning

## Problem Statement
Devices remain stuck in the 'Connecting' state after provisioning if initial resolution attempts fail. This happens because:
1. `LocalEsp32DeviceRepository.getDevice` immediately publishes a 'connecting' status.
2. If the request is superseded (`mySeq < this.requestSequences[id]`), it returns the cached 'connecting' device without updating it to a terminal state.
3. `LocalRealtimeService` fails to notify listeners when its own reconciliation (`fetchBaseline`) fails, leaving the UI dependent on the repository.
4. Redundant network calls are made between the Repository and the Realtime Service.

## Proposed Solution

### 1. Refactor `LocalEsp32DeviceRepository.ts`
- **Fix Supersession Logic**: When a request is superseded, we should only return the cached device if a *newer* request is actually pending. If no newer request is active (or if we are in a failure state), we must ensure the device doesn't stay 'connecting'.
- **Ensure Terminal State**: In the `.catch` block of `getDevice`, the logic should always result in an 'offline' state if it's the most recent attempt.
- **Improve Cache Management**: Update the 'connecting' state only if we don't already have a more recent session/revision.

### 2. Refactor `LocalRealtimeService.ts`
- **Handle Reconciliation Failure**: When `fetchBaseline` fails, the service should emit a signal or transition the device to 'offline' via the repository/listeners, rather than just setting `isReconciling = false` silently.
- **Reduce Redundancy**: Currently, both `LocalEsp32DeviceRepository._fetchDeviceData` and `LocalRealtimeService.fetchBaseline` call `/api/info` and `/api/state`. I will evaluate if the Realtime Service should rely on the Repository for the baseline.

### 3. State Transition Logic
- **Connecting $\rightarrow$ Online**: Successful HTTP fetch or WebSocket baseline.
- **Connecting $\rightarrow$ Offline**: All HTTP attempts fail AND WebSocket fails/times out.

## Implementation Steps

### Step 1: `LocalEsp32DeviceRepository.ts` Changes
- Modify `getDevice` to handle superseded failures more robustly.
- Ensure that the `.catch` block correctly identifies if it is the latest request and updates the cache to `offline`.
- Refine the `connectingDevice` seeding logic to avoid overwriting 'online' status with 'connecting' during rapid re-fetches.

### Step 2: `LocalRealtimeService.ts` Changes
- Add a failure notification mechanism in `ws.onopen`'s reconciliation block.
- If `fetchBaseline` fails, emit a "failure" event or call back into the repository to mark the device as offline.

### Step 3: Integration & Verification
- **Verification Case 1 (Network Fail)**: Provision a device, then block its IP. Verify it transitions from 'Connecting' to 'Offline'.
- **Verification Case 2 (Race Condition)**: Trigger multiple `getDevice` calls rapidly. Verify the final state is consistent (Online or Offline) and not stuck in 'Connecting'.
- **Verification Case 3 (WS Fail)**: Simulate WebSocket failure but HTTP success. Verify it stays 'Online'.

## Critical Files
- `src/api/repositories/LocalEsp32DeviceRepository.ts`
- `src/api/realtime/LocalRealtimeService.ts`
- `src/api/repositories/CompositeDeviceRepository.ts` (to verify how it triggers resolution)
