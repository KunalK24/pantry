# Pantry web app

The application, API routes, Prisma schema, and worker are in this workspace. Start with the [repository README](../../README.md) for setup and checks. The [architecture notes](../../docs/architecture.md) describe the code boundaries, and [STYLE.md](STYLE.md) records TypeScript conventions.

## Test account fixture

After configuring `apps/web/.env` with `DATABASE_URL`, run these commands from the repository root:

```sh
PANTRY_TEST_PASSWORD='choose-a-test-password' pnpm --filter @pantry/web test-user:seed
pnpm --filter @pantry/web test-user:remove
pnpm --filter @pantry/web test-user:remove --apply
```

The seed command creates `pantry-test@example.com` with the supplied password, 10 recipes, 20 pantry items, a plan for the current week, and an active grocery list. It refuses to change an existing account with the reserved email or ID. To reseed, remove the account first. The remove command previews the account and owned-record counts; `--apply` deletes that account and all of its owned data. It targets only the reserved fixture ID and email. Use these commands against a development database.
