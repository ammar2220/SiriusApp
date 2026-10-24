# Sirius Project Handoff

## Master Roadmap

The canonical product roadmap is:
`MASTER_ROADMAP.md`

Always read `MASTER_ROADMAP.md` before planning or implementing a new feature.

The roadmap must remain synchronized with the actual repository state.

## 1. CURRENT STABLE BASELINE
- **Tag**: `v0.3.0-stable`
- **Stable commit**: `ed570e4ca0e0b57c9bc22e7ca1add31e51273b61`
- **Annotated tag object**: `aad2d251fe266037528f92b1430bf59e6f300984`
- **Current checkout**: `ed570e4`
- **Working tree should remain clean except for intentional feature work.**
- **Authority**: This is the official starting point for all future feature work.

## 2. CURRENT STATUS
- **Baseline Restoration**: Complete.
- **Android Build**: Debug build succeeded.
- **APK Path**: `android/app/build/outputs/apk/debug/app-debug.apk`
- **Java Runtime**: `C:\Program Files\Android\Android Studio\jbr`
- **TypeScript**: Currently reports 3 pre-existing errors in `src/screens/HardwareTestScreen.tsx`.
- **Critical Note**: These errors are part of the stable baseline and **MUST NOT** be treated as a regression or automatically fixed.

## 3. SAFETY BACKUP
- Previous experimental/Phase-6B state is preserved in branch: `backup/pre-restore-stable-20260916`.
- **Do not delete this branch.**

## 4. PROJECT ROOTS
- **Mobile App**: `C:\Users\Ammar\Sirius\mobile\sirius`
- **Firmware**: `C:\Users\Ammar\Sirius\firmware\esp32`
  - *Note*: Firmware is separate and is **NOT** a Git repository. Do not modify unless explicitly requested.

## 5. DEVELOPMENT RULES
- **Phase 6B**: Do not start Phase 6B automatically.
- **Accounts/Sessions**: Do not reintroduce the discarded account/session changes.
- **Provisioning**: Do not change provisioning architecture without explicit approval.
- **SSID Discovery**: Generic Sirius SoftAP discovery is required.
- **Product Type**: Derived from `/api/info`, not from the SSID.
- **Identity**: Factory ID is the primary physical identity anchor.
- **Persistence**: Preserve the known-good multi-device persistence implementation from `v0.3.0-stable`.
- **Testing**: Physical testing is preferred over mock-only validation.
- **Git**: Do not create commits or tags unless explicitly requested.
- **Code Quality**: Do not make unrelated refactors or "cleanup" changes.

## 6. WORKFLOW
Future feature work must follow this sequence:
`PLAN/DESIGN` $\rightarrow$ `IMPLEMENT` $\rightarrow$ `TYPECHECK/BUILD` $\rightarrow$ `PHYSICAL TEST` $\rightarrow$ `VERIFY` $\rightarrow$ `COMMIT ONLY WHEN EXPLICITLY REQUESTED`

## 7. IMMEDIATE STATE
- **In-Progress**: NO feature is currently in progress.
- **Current Position**: Parked at the clean `v0.3.0-stable` baseline.
