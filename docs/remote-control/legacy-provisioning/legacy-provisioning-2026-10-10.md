# Legacy Provisioning Snapshot — 2026-10-10

This is a rollback/reference record of the provisioning flow that existed before the secure-enrollment work. It is documentation, not an instruction to keep using the legacy flow for release onboarding.

## User flow

1. The app discovers the generic Sirius SoftAP using `WifiProvisioningModule.discoverSoftAPs()`.
2. The user selects the device and enters the home Wi-Fi SSID and password in the app.
3. The app sends those Wi-Fi credentials as JSON to the device's `/provision` endpoint at the SoftAP address.
4. The device stores the credentials in ESP32 Preferences and restarts into station mode.
5. The app discovers the device on the LAN through mDNS, reads `/api/info`, and adds it to the selected room.

## Firmware behavior recorded

- The generic product SoftAP is started with an empty password (`SOFTAP_PASS=""` in the 1CH common header).
- The firmware exposes `POST /provision` and accepts `ssid` and `pass` in the request body over plain HTTP.
- Wi-Fi credentials are stored under Preferences namespace `aion-proto`, keys `ssid` and `pass`.
- The factory-reset path removes those Wi-Fi keys. The boot-time reset handling uses `RESET_PIN` GPIO0 and a five-second hold; GPIO0 must not be repurposed as a pairing button without board-level verification.
- The current provisioning handler logs the supplied SSID and password. This is a credential disclosure defect in the legacy implementation; this snapshot intentionally records only the logging behavior and never copies actual credentials or log values.
- After provisioning, the device restarts and the app uses mDNS plus `/api/info` to complete discovery. Product type is obtained from `/api/info`, not inferred from the SSID.

## Security and product limitations

- The factory ID/MAC is an identifier, not a secret or proof that a device is genuine.
- An open SoftAP and plain HTTP do not protect Wi-Fi credentials against a nearby observer or rogue access point.
- This flow does not establish a device-to-backend identity, enrollment generation, or unique MQTT credentials.
- Do not use this legacy flow as the release secure-enrollment path. Preserve generic Sirius SoftAP discovery and the normal add-device experience where possible, while replacing the credential handoff and adding device authentication.

## Rollback fingerprints

SHA-256 hashes captured before provisioning changes on 2026-10-10:

| File | SHA-256 |
|---|---|
| `C:\Users\Ammar\Sirius\firmware\esp32\Sirius_1CH_switch\SiriusCommon.cpp` | `81426904665BA8A7AC043AE4821621430FD1BA4A225BF0DF7383D663AE247A3E` |
| `C:\Users\Ammar\Sirius\firmware\esp32\Sirius_1CH_switch\SiriusCommon.h` | `DC31D2BD4A0B0ED233351F45AF60C7FD4630ED0A1F8BBC6754B3092C133CC341` |
| `C:\SiriusApp\src\screens\ProvisioningScreen.tsx` | `4EB67EAB53AD988F9370743FE3A51477879B4FE9B58ED27CE19A2A22D34F77AA` |
| `C:\SiriusApp\src\api\local\apiClient.ts` | `17D2A7483591FD37C0D75BD9AF97FA5BBE9341581A1721AC8FF0E3F14C5648C4` |

Exact app snapshots captured from those files are stored alongside this note at `app-snapshot/ProvisioningScreen.tsx` and `app-snapshot/apiClient.ts`.

The firmware directory is outside the Git repository. These hashes identify the captured files but do not provide an automatic restore; keep a separate copy of any firmware file before changing it.

## Revisit checklist

If the legacy path must be restored for diagnosis, compare the current files against the hashes above and restore only the required provisioning behavior. Never restore password logging or describe open SoftAP/plain HTTP as secure.
