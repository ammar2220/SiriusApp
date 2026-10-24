# Sirius Master Roadmap

## Project Direction

* The active client is the React Native Android mobile app.
* The Web App / Web-first direction is CANCELLED and must NOT be reintroduced.
* Backend / Cloud is still REQUIRED.
* Existing completed local functionality must NOT be rebuilt or duplicated.
* This roadmap is the canonical source of truth for remaining product development.
* Before starting a new feature, check this roadmap and the existing codebase first.

## Completed Baseline — DO NOT REBUILD

The following are already implemented and physically tested where applicable:

### Local ESP32 / Hardware Foundation

* ESP32 device communication
* Relay control
* Safe startup behavior
* 1CH / 2CH / 3CH support
* Factory ID based on hardware identity
* Physical factory reset

### Wi-Fi / Local Connectivity

* Wi-Fi Station mode
* SoftAP provisioning
* Wi-Fi credential provisioning
* Wi-Fi reconnect
* Local HTTP API
* `/api/info`
* `/api/state`
* `/api/control`
* mDNS discovery
* Factory ID validation
* Product type / channel count handling
* Persistent device configuration

### Mobile App Foundation

* React Native Android application
* Existing state-based navigation architecture
* Repository architecture
* Persistent local storage
* Device communication layer
* Standalone Release APK that does not require Metro
* Base Sirius theme/components
* Physical Android testing foundation

### Home / Room / Device Management

* Create Home
* Multiple Homes
* Create Room
* Add Device
* Rename Home
* Rename Room
* Rename Device
* Move Device
* Remove Device
* Persistent Home / Room / Device hierarchy
* Home dashboard
* Room sections
* Device control screen
* Persistent device/home/room state

### Provisioning / Device Lifecycle

* Discover Sirius SoftAP
* Connect to SoftAP
* Send Wi-Fi credentials
* Connect device to home Wi-Fi
* Post-provisioning mDNS discovery
* `/api/info` validation
* Factory ID registration
* Physical device mapping
* Dynamic IP recovery
* Retry / recovery behavior
* 1CH / 2CH / 3CH provisioning
* Device re-provisioning
* Remove → reset → SoftAP → re-provision lifecycle
* Multi-device robustness
* Graceful unreachable-device handling

### Local Accounts

* Sign Up
* Sign In
* Logout
* Email
* Password
* Display Name
* Unique UID
* Password hashing
* Persistent session
* Multiple local accounts
* User isolation
* User-specific Homes / Rooms / Devices
* Account-aware authorization checks
* Physical mappings preserved across logout

## Current Development Position

**Current task:** Phase F Remote Control implementation using the existing Wi-Fi provisioning flow. The user has explicitly deferred QR/bootstrap identity changes until after the control paths are exercised.

### Verified Local-Control Checkpoint — 2026-10-03

The user physically verified the following on the 3-channel ESP32 and Android app:

* App-to-device local channel control works.
* Local control continues to work with Internet unavailable (verified earlier in this session).
* Physical-button state changes appear in the app immediately.
* The 3-channel firmware was flashed with the `/api/state` JSON closing-brace correction; local control and realtime state updates work afterward.
* The app routes locally registered physical devices through the local command path; remote transport remains unimplemented and must not be treated as available.

This checkpoint records the user's physical verification. It does not mark Phases B–E or Phase F complete; cloud/backend and remote-control readiness still require audit.

### Remote-Control Readiness Snapshot — 2026-10-03

Read-only source audit findings:

* The mobile `ControlRouter` has a local path and a Phase 3 remote placeholder; there is no implemented cloud command transport.
* Supabase currently provides authentication and home/room/device/channel metadata. The checked-in schema has no live state/revision fields or command/acknowledgement queue, and the mobile app has no cloud device-state subscription or Edge Function command relay.
* The firmware exposes local HTTP control/state endpoints and a local WebSocket state server. No outbound MQTT or cloud connection implementation or broker configuration was found in the available firmware source.
* Therefore remote control is not ready to implement as a mobile-only change. A secure device-to-cloud transport and backend authorization/command/acknowledgement contract are still required.

This is an audit snapshot, not an implementation or completion of Phase F.

### Remote-Control Implementation Checkpoint — 2026-10-10

Source work currently present in the working tree and partially deployed (not yet physically verified):

* The app builds fenced commands with `commandId`, `enrollmentGeneration`, boot/session/revision identity, and an expiry; cloud device state and app cache paths are being connected for online/offline UI behavior.
* Supabase migrations `001` through `007` are applied to project `ilwdaoxftjscrztawkna`. They provide durable command/state records, generation fencing, per-device quota, Realtime publication, and scheduled expiry reconciliation to `TIMED_OUT_UNKNOWN`.
* The `remote-command-publish`, `remote-command-ack`, `device-uplink`, `remote-command-status`, and `activate-legacy-remote-device` Edge Functions are deployed. Their EMQX secrets and HTTP Data Integrations are not configured yet.
* The existing 3CH firmware source has a unified local/MQTT command path and now publishes generation-fenced ACK, presence, and periodic full-state uplinks for the bounded evaluation. The 1CH and 2CH variants remain local-only and require the same validated port after the 3CH physical loop succeeds.
* Secure claim redemption is not implemented. Existing open SoftAP/plain-HTTP provisioning must not carry a bearer claim or MQTT credentials. No physical pairing control or manufacturing credential has been verified.
* By the user's latest direction, keep the current Wi-Fi provisioning flow unchanged and defer per-device QR/bootstrap identity work until after Remote Control testing. The prior flow remains archived under `docs/remote-control/legacy-provisioning/`; the QR/bootstrap proposal is future work only.
* For this bounded Remote Control evaluation, use the currently configured MQTT path only after rotating the shared broker credential found in the local firmware configuration. This is an evaluation setup, not secure per-device enrollment or production readiness.
* EMQX Serverless is retained for bounded real-device evaluation. Its deployment limits and credential lifecycle do not establish the 10,000-device product target; do not claim scale or per-device isolation.
* App-only typecheck and Android release build pass in this workspace. The current 3CH firmware source cannot be compiled in the present Windows environment because the ESP32 compiler fails to launch with a Windows `Illegal System DLL Relocation` error before project compilation. Deno validation is unavailable. EMQX setup and physical testing remain outstanding.

Phase F remains **in progress**. Do not mark remote control, automatic enrollment, offline release behavior, or production readiness complete until deployment and real-device tests pass.

---

# Remaining Product Roadmap

## Phase A — Finish Local Device Management
- [x] Device Details
- [x] Factory ID visible in UI
- [x] Last Seen
- [x] State refresh / automatic synchronization
- [x] Finish any remaining small local device-management gaps identified by code audit

## Phase B — Backend Foundation

* Supabase setup
* PostgreSQL database
* Production data model
* Users / Profiles
* Homes
* Rooms
* Devices
* Channels
* Cloud service / API layer
* Environment configuration
* Authentication integration foundation
* Row Level Security (RLS)
* Authorization model
* Local-to-cloud data migration strategy
* Secure cloud/local separation

## Phase C — Cloud Accounts

* Cloud authentication
* User account synchronization
* Persistent cloud identity
* Sign up / sign in integration with cloud
* Session handling against backend
* Migration from current local-only account foundation

## Phase D — Cloud Home / Room / Device Sync

* Sync Homes
* Sync Rooms
* Sync Devices
* Device ownership
* Cloud persistence
* Conflict handling
* Local cache + cloud source-of-truth behavior

## Phase E — Realtime Device State

* Realtime device status
* Online / offline state synchronization
* Last Seen synchronization
* Realtime channel state updates
* Connection state consistency between app, cloud, and ESP32

## Phase F — Remote Control

* Cloud-assisted remote device control
* Secure command flow
* Device command acknowledgement
* Command status / failure handling
* Local LAN control remains available when applicable

## Phase G — Home Sharing & Permissions

* Invite members
* Home membership
* Roles
* Owner / Admin / Member permissions
* Device-level authorization where required
* Permission enforcement in both client and backend

## Phase H — Scenes

* Create Scene
* Edit Scene
* Delete Scene
* Multiple device actions
* Scene execution
* Scene state persistence
* Future extensibility for additional device types

## Phase I — Scheduling

* Scheduled actions
* Recurring schedules
* Time-based automation
* Enable / disable schedules
* Schedule persistence
* Reliable execution architecture

## Phase J — Notifications & Activity

* Device notifications
* Event notifications
* Activity history
* Device state events
* User-visible event timeline
* Notification preferences

## Phase K — Advanced Account & Security

* Email verification
* Forgot password
* Change password
* Change email
* Session timeout
* App Lock
* Trusted devices
* Failed-login protection
* Additional account security controls

## Phase L — OTA & Diagnostics

* Firmware version tracking
* OTA firmware updates
* Device diagnostics
* Device health information
* Error reporting
* Firmware / hardware compatibility checks
* Recovery mechanisms

## Phase M — Offline / Reliability Hardening

* Offline-first behavior where appropriate
* Local cache reliability
* Cloud outage handling
* Internet loss handling
* LAN fallback
* Retry policies
* State reconciliation
* Edge-case recovery
* Long-term reliability testing

## Phase N — Production QA

* Full regression testing
* Multi-device testing
* Multi-user / permissions testing
* Provisioning testing
* Offline / online transition testing
* Cloud failure testing
* Security review
* Performance testing
* Release build validation
* Production readiness review

---

# Development Rules

1. Always inspect the current codebase before implementing a feature.
2. Do not rebuild already-completed functionality.
3. Do not introduce the cancelled Web App / Web-first architecture.
4. Do not introduce React Navigation; preserve the current navigation architecture unless explicitly approved.
5. Factory ID remains the immutable physical device identity.
6. IP address is recoverable and must never be treated as the permanent device identity.
7. Prefer a read-only audit before significant implementation work.
8. Do not make unrelated refactors while implementing roadmap features.
9. Do not commit, tag, or change Git history unless explicitly requested.
10. When a roadmap item is completed, update `MASTER_ROADMAP.md` so the repository remains synchronized with the actual implementation.
11. When implementation status differs from the roadmap, verify against the codebase and correct the roadmap rather than assuming the roadmap is correct.
12. The existing local baseline is considered the starting point for cloud/backend expansion.
