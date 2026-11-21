# Pantry web app

The application, API routes, and Prisma schema are in this workspace. Start with the [repository README](../../README.md) for setup and checks. The [architecture notes](../../docs/architecture.md) describe the code boundaries, and [STYLE.md](STYLE.md) records TypeScript conventions.

## Test account fixture

After configuring `apps/web/.env` with `DATABASE_URL`, run these commands from the repository root:

```sh
PANTRY_TEST_PASSWORD='choose-a-test-password' pnpm --filter @pantry/web test-user:seed
pnpm --filter @pantry/web test-user:remove
pnpm --filter @pantry/web test-user:remove --apply
```

The seed command creates `pantry-test@example.com` with the supplied password, 10 recipes, 21 pantry items, a plan for the current week, and an active grocery list. It refuses to change an existing account with the reserved email or ID. To reseed, remove the account first. The remove command previews the account and owned-record counts; `--apply` deletes that account and all of its owned data. It targets only the reserved fixture ID and email. Use these commands against a development database.

To add the fixture pantry items to a specific account, run this from the repository root:

```sh
pnpm --filter @pantry/web pantry:seed --email user@example.com
```

The command uses the existing account when found. Otherwise it creates the account with password `1234567890`. It adds pantry items that are missing by normalized name and leaves existing items, recipes, and plans unchanged. Run it only against a development database.
