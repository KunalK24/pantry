# Pantry mobile

The iOS app lives in the Pantry pnpm workspace. It supports sign-in with an existing Pantry account, a read-only pantry list, sign-out, and a connection check. The login token stays in app memory for this development slice, so a full app restart requires sign-in again.

## Local setup

1. Install dependencies from the repository root with `pnpm install`.
2. Start the Pantry web API with `pnpm --filter @pantry/web dev` using a development database.
3. Copy `.env.example` to `.env.local` in this directory. The iOS Simulator can use `http://localhost:3000`; a physical iPhone needs a reachable HTTPS URL.
4. Install Xcode and an iOS Simulator runtime. Run `pnpm --filter @pantry/mobile ios` from the repository root to compile and open a local development build.

For later JavaScript or TypeScript edits, run `pnpm --filter @pantry/mobile exec expo start --dev-client` and press `i` in Expo's terminal. Rebuild after native dependency or app configuration changes.

Run `pnpm --filter @pantry/mobile typecheck` and `pnpm --filter @pantry/mobile lint` for local checks.
