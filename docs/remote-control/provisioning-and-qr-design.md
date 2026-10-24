# Sirius Provisioning and Per-Device QR Enrollment Proposal

**Status:** Deferred by the user's latest direction on 2026-10-10. Keep the current Wi-Fi provisioning flow unchanged while implementing and testing Remote Control. Revisit this proposal afterward.

The legacy provisioning flow has been archived at `docs/remote-control/legacy-provisioning/legacy-provisioning-2026-10-10.md`, with exact app source snapshots and SHA-256 fingerprints. Do not overwrite that archive during implementation.

## Product goal

Keep the normal app journey automatic: the user chooses a Home and Room, discovers a Sirius device, provides home Wi-Fi, and the device becomes available for local and remote control. The app must never receive MQTT credentials, and onboarding must not require per-device EMQX dashboard work.

## What the QR would mean

The factory MAC remains the public device identifier. It is not a password or proof of ownership. Espressif documents the factory MAC as a value written into eFuse; it is readable as an identity and must not be treated as a secret.

Each physical unit would receive a different, high-entropy bootstrap identity during manufacturing or a controlled USB provisioning step. A unit-specific QR label would identify that unit and carry a one-time claim code (or a protected reference to it). The QR is scanned by the app during normal onboarding; it is not broadcast in mDNS or placed in an SSID. Claim codes are short-lived, single-use, bound to the signed-in user, selected Home, factory ID, and current enrollment generation. Store only a verifier/hash server-side, and redact the code from logs.

The device also needs its own credential that the app never sees. Prefer a per-device private key/certificate or high-entropy device secret provisioned individually and stored with the strongest protection supported by the verified board. The device proves possession directly to the backend over validated HTTPS, redeems the pending claim, and receives its own broker credential. The broker credential remains on the device and server-side systems only.

The QR claim code and device credential serve different purposes: scanning proves the user has the unit's label; the device credential proves the backend is communicating with the actual enrolled unit. A MAC address alone cannot provide the second proof.

## Protect Wi-Fi provisioning too

The current open SoftAP and plain-HTTP provisioning path must not carry a claim token, MQTT credential, or unprotected Wi-Fi password in a release flow. Before changing it, inspect the actual board and app connection behavior, then select a supported authenticated/encrypted local setup channel. A QR-derived per-device setup secret may support a protected temporary access point or a reviewed password-authenticated key exchange, but the exact protocol and libraries must be verified for the actual ESP32 and React Native builds.

Preserve generic Sirius SoftAP discovery, `/api/info` product detection, Factory ID identity, and existing local control. Do not repurpose GPIO0 as a pairing button: the current common firmware declares it as `RESET_PIN` and uses it for factory reset. Any new button interaction requires board-level confirmation first.

## Re-enrollment and command fencing

The backend issues and monotonically advances `enrollmentGeneration`. Commands, ACKs, state snapshots, and presence are fenced by generation, boot count, and session ID. A factory reset must not silently restore an old generation or permit old messages to become current. The device obtains the current generation only through authenticated enrollment.

## Broker constraints

Keep the broker integration behind backend/device contracts. Verify the exact current EMQX Serverless authentication, authorization, credential lifecycle, and X.509 support on the deployed plan before selecting how per-device credentials are created/revoked. Do not use shared credentials or wildcard cross-device permissions to compensate for a missing API. The current free deployment is only for bounded evaluation; it does not establish the 10,000-device scale target.

## Evidence required before implementation is called ready

- Identify the ESP32 module/chip revision and board schematic; confirm available eFuse/key features and actual GPIO wiring.
- Confirm whether the units can receive unique credentials in a manufacturing/USB station and how QR labels are generated, protected, and attached.
- Verify the chosen secure local Wi-Fi provisioning method on the actual board and Android app.
- Verify per-device broker identity creation, topic isolation, rotation, and revocation on the actual EMQX deployment.
- Build all firmware variants, deploy backend migrations/functions, then test first and second physical devices through onboarding, local control with/without internet, and remote control.

## Current source finding (2026-10-10)

The firmware source inspected in this project derives identity with `ESP.getEfuseMac()`. The 1CH and 2CH variants have no device-secret, certificate, or MQTT enrollment implementation. The 3CH variant contains a shared MQTT username/password and has no `enrollmentGeneration` implementation. No source evidence establishes that a unique secret has already been programmed into the connected ESP32. This finding is about the checked-in firmware source; it is not a readout of the physical chip's eFuse contents.

## Approval and implementation boundary (2026-10-10)

The user later directed that the existing provisioning flow remain unchanged for the current Remote Control effort and that this identity/enrollment proposal be revisited afterward. The prior flow is preserved in `docs/remote-control/legacy-provisioning/`.
