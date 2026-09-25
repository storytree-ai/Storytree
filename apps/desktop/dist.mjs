// `pnpm dist`: package the built app (dist/) for Windows arm64 with electron-builder, as configured
// under "build" in package.json: release/win-arm64-unpacked/ (the app, runnable in place) and a
// portable exe that unpacks itself to %TEMP% and runs it.
//
// ELECTRON_BUILDER_7Z_FILTER=BCJ: the 7-Zip that electron-builder uses compresses arm64
// executables with its ARM64 filter by default, and the 7z plugin in electron-builder's NSIS (which
// the portable exe unpacks itself with) predates that filter. Without this, the portable exe
// unpacks every file but the .exe and .dll ones and fails to start. The x86 BCJ filter it decodes.
import { Arch, build, Platform } from "electron-builder";

process.env.ELECTRON_BUILDER_7Z_FILTER ??= "BCJ";
await build({ targets: Platform.WINDOWS.createTarget(undefined, Arch.arm64) });
