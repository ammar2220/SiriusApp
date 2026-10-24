# Implementation Plan: Remote Control System Correctness Fixes

## Overview
This plan addresses three correctness issues in the remote control system: precise error classification for Edge Function invokes, API visibility for reconciliation, and recovery for late ACKs.

## Requirements
1. **Precise Error Classification**: Distinguish 4xx errors (immediate rejection) from transport/5xx errors (ambiguous, trigger reconciliation) in `RemoteControlService.executeRemote`.
2. **API Visibility**: Rename `private reconcileAndResolve` to `public reconcileCommand` in `RemoteControlService` and update `ControlRouter` to use it.
3. **Late-ACK Recovery**: Implement a `public pollStatus(commandId)` method to allow users to discover late ACKs after the 15s caller timeout has elapsed.

## Detailed Implementation Steps

### 1. `RemoteControlService.ts` Enhancements

#### A. Error Classification in `executeRemote`
- Modify the handling of `supabase.functions.invoke`.
- Current logic:
  - If `error` exists $\rightarrow$ ambiguous.
  - If `data.error` exists $\rightarrow$ reject.
- New logic:
  - Inspect the `FunctionsError` (the `error` returned by `invoke`).
  - If `error` contains a status code in the 400-499 range (excluding some specific cases if needed, but generally 4xx), treat it as a `rejected` result immediately.
  - If `error` is a network timeout, 5xx, or has no status code, treat it as ambiguous (continue to the 15s reconciliation).

#### B. API Visibility & Renaming
- Rename `private async reconcileAndResolve(commandId: string)` $\rightarrow$ `public async reconcileCommand(commandId: string)`.
- Ensure it returns a `Promise<CommandResult>`.

#### C. Late-ACK Recovery via `pollStatus`
- Implement `public async pollStatus(commandId: string): Promise<CommandResult>`.
- This method will simply call the existing `reconcileCommandStatus(commandId)` logic.
- Update `executeRemote` timeout:
  - When the 15s timeout hits, it calls `reconcileCommand`.
  - `reconcileCommand` should resolve the promise and then call `cleanupCommand`.
  - **Crucially**, modify `cleanupCommand` or the timeout flow:
    - To support the "Durable Gateway" pattern, the `executeRemote` promise resolves to `applied_unconfirmed` at 15s.
    - The Realtime channel and `pendingCommands` entry can be cleaned up at 15s to avoid leaks, since `pollStatus` will query the database directly (via `command_log`) to find the eventual state.

### 2. `ControlRouter.ts` Updates
- Update line 41: Change `RemoteControlService.reconcileAndResolve(command.commandId)` $\rightarrow$ `RemoteControlService.reconcileCommand(command.commandId)`.

## Verification Strategy

### Test Case 1: Immediate 4xx Rejection
- **Setup**: Mock the Supabase Edge Function to return a 403 Forbidden or 401 Unauthorized error.
- **Expected**: `executeRemote` should reject the promise immediately without waiting 15s.

### Test Case 2: Ambiguous Transport Error
- **Setup**: Mock a network timeout or a 502 Bad Gateway during `invoke`.
- **Expected**: `executeRemote` should not reject immediately; it should wait for the 15s timeout and then return the result of `reconcileCommand`.

### Test Case 3: Late-ACK Discovery
- **Setup**: 
  1. Trigger `executeRemote`.
  2. Ensure the device does not ACK within 15s.
  3. Verify the caller receives `applied_unconfirmed`.
  4. Wait until 20s (simulating a late ACK arriving in `command_log`).
  5. Call `pollStatus(commandId)`.
- **Expected**: `pollStatus` should return `accepted` (or the actual terminal state from the DB).

## Critical Files for Implementation
- `src/api/remote/RemoteControlService.ts`
- `src/api/ControlRouter.ts`
- `src/types/device.ts`
