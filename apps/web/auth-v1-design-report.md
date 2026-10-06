# V1 Users and Auth Implementation Design

## Proposed Design

Add V1 user accounts with email/password authentication, opaque server-managed sessions, and per-user ownership for Pantry data.

V1 should support:

- Sign up with email and password.
- Sign in with email and password.
- Sign out.
- Authenticated access to recipes, pantry items, meal plans, and grocery list.
- User-scoped data access so each user sees and mutates only their own records.
- `401` JSON responses for unauthenticated API requests.
- Redirects from app pages to `/sign-in` when no valid session exists.

V1 should not include organizations, sharing, social login, email verification, password reset, MFA, role-based access, admin tooling, account deletion, or production-scale session/device management.

Recommended option: custom email/password auth using the existing stack plus Node `crypto`.

This is the best fit for V1 because Pantry already uses thin Next.js route handlers, Prisma-backed services, and Zod request validation. A small internal auth layer can follow those patterns without introducing a new auth framework before product requirements are clear. Use Node `crypto.scrypt` with per-user salts for password hashing. Store only password hashes. Store only hashed session tokens in the database, with the raw opaque token sent to the client in an `HttpOnly`, `Secure` in production, `SameSite=Lax` cookie.

Dependency options:

| Option | Pros | Cons | Recommendation |
| --- | --- | --- | --- |
| Custom email/password with Node `crypto` and DB-backed sessions | No new runtime dependency; fits current route/service/Zod/Prisma structure; easy to scope for V1; local tests can exercise the whole flow | Requires careful implementation of password hashing, token generation, cookie settings, and expiration cleanup; lacks built-in password reset/email verification | Recommended for V1 |
| Better Auth | Purpose-built auth library with Next.js route handler support, database-backed sessions, Prisma adapter documentation including Prisma 7/PostgreSQL, and CLI/schema generation | Adds dependency, generated schema conventions, library-owned route/session behavior, and another abstraction around auth errors/cookies; Pantry still needs user-scoped domain services either way | Consider as a fourth V1 option, but does not replace the custom-auth recommendation unless the team values built-in auth flows over minimal local control |
| Auth.js / NextAuth | Common Next.js auth abstraction; supports providers later; Prisma adapter available; more recognizable auth conventions | Adds dependency and framework contracts; credentials auth still requires custom password handling; may shape routes/session behavior before Pantry needs that complexity | Reasonable if provider/social auth is expected soon |
| Hosted auth such as Clerk or Supabase Auth | Fast path to polished auth UI, account management, email verification, and password reset | Vendor dependency; more setup and environment coupling; pricing/product decisions move into auth; local/test behavior becomes less self-contained | Better after V1 if Pantry needs managed auth UX or external identity features |

Better Auth should be considered separately from Auth.js and hosted auth. It is more self-hosted and Prisma-friendly than Clerk/Supabase, and more batteries-included for credentials/session handling than custom auth. For Pantry V1, it mainly trades a small amount of custom security-sensitive code for dependency conventions, generated database tables, and library-owned auth route behavior. It does not remove the larger Pantry-specific work: every recipe, pantry item, weekly plan, grocery list, and cross-reference still needs explicit `userId` scoping in services.

## Existing Components Affected

Current API route handlers under `apps/web/src/app/api/**` are thin and should remain thin. They should call a shared auth helper before validating and calling services.

Current services under `apps/web/src/services/**` own business behavior and Prisma queries. They should accept `userId` as an explicit argument and enforce ownership in all reads, writes, deletes, upserts, and reference checks.

Current validation schemas under `apps/web/src/schemas/**` validate client input. They should not accept `userId` from request bodies. `userId` should come only from the authenticated session.

Current Prisma data model is global:

- `Recipe` has no owner.
- `PantryItem.normalizedName` is globally unique.
- `WeeklyPlan.weekStart` is globally unique.
- `GroceryList.key` is globally unique and currently supports one global `active` list.
- `PlannedMeal`, `GroceryListRecipe`, and `GroceryItem` rely on parent relationships and referenced global records.

Current frontend navigation in `apps/web/src/components/AppNav.tsx` is not session-aware. `apps/web/src/app/layout.tsx` always renders app navigation. `apps/web/src/app/page.tsx` redirects to `/recipes`.

Current tests under `apps/web/tests/**` cover services and route handlers without users or sessions. These tests need user-scoped setup and unauthenticated coverage.

## Files Likely Affected

Likely new files:

- `apps/web/src/schemas/auth.ts`
- `apps/web/src/services/auth-service.ts`
- `apps/web/src/lib/auth.ts`
- `apps/web/src/app/sign-in/page.tsx`
- `apps/web/src/app/sign-up/page.tsx`
- `apps/web/src/components/SignInForm.tsx`
- `apps/web/src/components/SignUpForm.tsx`
- `apps/web/src/components/SignOutButton.tsx`
- `apps/web/src/app/api/auth/sign-up/route.ts`
- `apps/web/src/app/api/auth/sign-in/route.ts`
- `apps/web/src/app/api/auth/sign-out/route.ts`
- `apps/web/src/app/api/auth/me/route.ts`
- `apps/web/src/middleware.ts`
- `apps/web/tests/auth-service.test.ts`
- `apps/web/tests/api/auth-route.test.ts`

Likely modified files:

- `apps/web/prisma/schema.prisma`
- `apps/web/src/app/layout.tsx`
- `apps/web/src/app/page.tsx`
- `apps/web/src/components/AppNav.tsx`
- `apps/web/src/app/api/recipes/route.ts`
- `apps/web/src/app/api/recipes/[id]/route.ts`
- `apps/web/src/app/api/recipes/parse/route.ts`
- `apps/web/src/app/api/pantry-items/route.ts`
- `apps/web/src/app/api/pantry-items/[id]/route.ts`
- `apps/web/src/app/api/weekly-plans/[weekStart]/route.ts`
- `apps/web/src/app/api/grocery-list/route.ts`
- `apps/web/src/services/recipe-service.ts`
- `apps/web/src/services/recipe-import-service.ts`
- `apps/web/src/services/pantry-item-service.ts`
- `apps/web/src/services/weekly-plan-service.ts`
- `apps/web/src/services/grocery-list-service.ts`
- `apps/web/tests/recipe-service.test.ts`
- `apps/web/tests/pantry-item-service.test.ts`
- `apps/web/tests/weekly-plan-service.test.ts`
- `apps/web/tests/grocery-list-service.test.ts`
- `apps/web/tests/api/recipe-route.test.ts`
- `apps/web/tests/api/recipe-id-route.test.ts`
- `apps/web/tests/api/recipe-import-route.test.ts`
- `apps/web/tests/api/pantry-item-route.test.ts`
- `apps/web/tests/api/pantry-item-id-route.test.ts`
- `apps/web/tests/api/weekly-plan-route.test.ts`
- `apps/web/tests/api/grocery-list-route.test.ts`

## API Contract

New auth routes:

### `POST /api/auth/sign-up`

Request:

```ts
{
  email: string
  password: string
}
```

Behavior:

- Normalize email by trimming and lowercasing before persistence.
- Validate password length.
- Create user.
- Create session.
- Set session cookie.

Responses:

- `201 { user: { id: string, email: string } }`
- `400 { error: "Invalid sign-up", details }`
- `400 { error: "Malformed JSON" }`
- `409 { error: "Email already registered" }`
- `500 { error: "Internal Server Error" }`

### `POST /api/auth/sign-in`

Request:

```ts
{
  email: string
  password: string
}
```

Behavior:

- Normalize email by trimming and lowercasing.
- Verify password against stored hash.
- Create session.
- Set session cookie.
- Do not reveal whether email or password was incorrect.

Responses:

- `200 { user: { id: string, email: string } }`
- `400 { error: "Invalid sign-in", details }`
- `400 { error: "Malformed JSON" }`
- `401 { error: "Invalid email or password" }`
- `500 { error: "Internal Server Error" }`

### `POST /api/auth/sign-out`

Behavior:

- Read current session cookie if present.
- Delete or revoke the matching session if valid.
- Clear session cookie.
- Idempotent when no session exists.

Responses:

- `204` with no body
- `500 { error: "Internal Server Error" }`

### `GET /api/auth/me`

Behavior:

- Return the current authenticated user.
- Useful for client-side session-aware UI and tests.

Responses:

- `200 { user: { id: string, email: string } }`
- `401 { error: "Unauthorized" }`
- `500 { error: "Internal Server Error" }`

Existing protected API routes:

- `GET /api/recipes`
- `POST /api/recipes`
- `GET /api/recipes/:id`
- `PUT /api/recipes/:id`
- `DELETE /api/recipes/:id`
- `POST /api/recipes/parse`
- `GET /api/pantry-items`
- `POST /api/pantry-items`
- `GET /api/pantry-items/:id`
- `PUT /api/pantry-items/:id`
- `DELETE /api/pantry-items/:id`
- `GET /api/weekly-plans/:weekStart`
- `PUT /api/weekly-plans/:weekStart`
- `GET /api/grocery-list`
- `PUT /api/grocery-list`
- `DELETE /api/grocery-list`

Unauthenticated response for protected API routes:

```ts
{ error: "Unauthorized" }
```

Status: `401`.

Protected route handlers should call an auth helper, then pass `user.id` into the service. Existing validation and domain error responses should remain otherwise unchanged.

Cross-user access to item detail routes should return existing not-found responses, not `403`, to avoid exposing record existence.

## Data Model Changes

Add `User`:

```prisma
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  sessions     Session[]
  recipes      Recipe[]
  pantryItems  PantryItem[]
  weeklyPlans  WeeklyPlan[]
  groceryLists GroceryList[]
}
```

Add `Session`:

```prisma
model Session {
  id        String   @id @default(cuid())
  userId    String
  tokenHash String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
}
```

If using Better Auth instead of custom auth, let Better Auth generate or define its required auth models rather than manually creating the exact `User` and `Session` models above. The Pantry-owned domain models should still add a required `userId` and relation to the auth user model. The migration/backfill problem is unchanged: existing `Recipe`, `PantryItem`, `WeeklyPlan`, and `GroceryList` records still need an owner before `userId` becomes required.

Modify `Recipe`:

```prisma
model Recipe {
  userId String
  user   User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}
```

Modify `PantryItem`:

```prisma
model PantryItem {
  userId String
  user   User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, normalizedName])
  @@index([userId])
}
```

Remove the current global uniqueness from `PantryItem.normalizedName`.

Modify `WeeklyPlan`:

```prisma
model WeeklyPlan {
  userId String
  user   User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, weekStart])
}
```

Remove the current global uniqueness from `WeeklyPlan.weekStart`.

Modify `GroceryList`:

```prisma
model GroceryList {
  userId String
  user   User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, key])
  @@index([userId])
}
```

Remove the current global uniqueness from `GroceryList.key`.

Relationship notes:

- `PlannedMeal` can continue to reference `WeeklyPlan` and `Recipe`, but service code must verify referenced recipes belong to the same user before creating planned meals.
- `GroceryListRecipe` can continue to reference `GroceryList` and `Recipe`, but service code must verify referenced recipes belong to the same user.
- `GroceryItem` can continue to reference `GroceryList` and optional `PantryItem`, but service code must verify referenced pantry items belong to the same user.
- `Ingredient` can remain global for V1 because it is currently just a name table behind `RecipeIngredient`; recipe ownership protects access to recipe ingredient rows.

Migration strategy for existing records:

1. Create a default user during migration or seed, using an environment-provided email such as `PANTRY_DEFAULT_USER_EMAIL`.
2. Backfill all existing `Recipe`, `PantryItem`, `WeeklyPlan`, and `GroceryList` rows to that user.
3. Make `userId` required on owned models after backfill.
4. Replace global unique constraints with compound per-user unique constraints.
5. Keep existing IDs stable so existing relationships remain valid.

If current local data is disposable, an alternate implementation path is to reset/reseed local data instead of writing a careful backfill migration. That decision should be explicit before implementation.

## Validation

Add `apps/web/src/schemas/auth.ts` with:

- `signUpInputSchema`
- `signInInputSchema`
- shared email normalization behavior

Recommended rules:

- Email: string, trim, lowercase, valid email, max length 254.
- Password: string, min length 8, max length 200.

Existing schemas should not add `userId` fields. Ownership should not be accepted from clients.

Existing user-scoped reference validation changes:

- `saveWeeklyPlan(userId, weekStart, input)` should count referenced recipes with both `id in recipeIds` and `userId`.
- `saveActiveGroceryList(userId, input)` should count referenced recipes with `userId`.
- `saveActiveGroceryList(userId, input)` should count referenced pantry items with `userId`.
- `saveActiveGroceryList(userId, input)` should count `importedWeeklyPlanId` with `userId`.
- Detail reads and mutations should query by `id` plus `userId`, or use compound ownership filters where Prisma supports them.

Cookie/session validation:

- Missing cookie means unauthenticated.
- Unknown token hash means unauthenticated.
- Expired session means unauthenticated and should be safe to clear.
- Returned user shape should exclude `passwordHash`.

## Edge Cases

- Duplicate sign-up email with different casing should conflict after normalization.
- Sign-in should return one generic failure for unknown email and wrong password.
- Expired session cookie should not authenticate the request.
- Signing out twice should still return `204`.
- Deleted user should invalidate sessions through cascade.
- User A requesting User B's recipe should return `404`, not `403`.
- User A updating User B's pantry item should return `404`, not `403`.
- User A creating a weekly plan with User B's recipe ID should return the existing weekly-plan reference error.
- User A saving a grocery list with User B's recipe, pantry item, or weekly plan ID should return the existing grocery-list reference error.
- Pantry item duplicate detection should be per user, not global.
- Weekly plan uniqueness should be per user and week.
- Grocery list `active` key should be per user.
- Existing global records need an owner before required `userId` constraints are enforced.
- `POST /api/recipes/parse` should require auth because it may use external AI provider capacity.
- `Secure` cookies should be enabled in production but not block local HTTP development.

## Testing Requirements

Auth service tests:

- Sign-up creates a user and session.
- Duplicate normalized email is rejected.
- Password hash is stored instead of raw password.
- Sign-in accepts valid credentials.
- Sign-in rejects invalid credentials with a generic error.
- Session lookup returns the user for a valid token.
- Expired sessions are rejected.
- Sign-out deletes or revokes the current session.

API route tests:

- Auth routes validate malformed JSON.
- Auth routes validate invalid inputs.
- Sign-up sets a cookie and returns a safe user shape.
- Sign-in sets a cookie and returns a safe user shape.
- Sign-out clears the cookie and returns `204`.
- Protected routes return `401` without a valid session.
- Protected routes call services with the authenticated user context.

Service tests:

- Recipes list/create/get/update/delete are scoped by `userId`.
- Cross-user recipe access throws `RecipeNotFoundError`.
- Pantry item list/create/get/update/delete are scoped by `userId`.
- Pantry item conflicts are per user.
- Weekly plans are unique per user/week.
- Weekly plan recipe references are user-scoped.
- Active grocery list is per user.
- Grocery list recipe, pantry item, and imported weekly plan references are user-scoped.

Frontend smoke tests:

- Unauthenticated app pages redirect to `/sign-in`.
- Sign-in form displays validation and server errors.
- Sign-up form displays validation and duplicate-email errors.
- Signed-in navigation exposes sign-out.
- Signed-out navigation does not expose protected app links, or redirects when they are visited.

Regression tests:

- Existing malformed JSON and Zod validation responses remain stable for authenticated requests.
- Existing not-found and conflict status codes remain stable where ownership is not involved.

## Implementation Tasks

1. Add Prisma `User` and `Session` models.
2. Add required ownership fields to `Recipe`, `PantryItem`, `WeeklyPlan`, and `GroceryList`.
3. Replace global unique constraints with per-user compound unique constraints.
4. Create a migration/backfill plan for existing records under one default user, or explicitly choose to discard/reseed local data.
5. Run Prisma generate after schema changes.
6. Add auth Zod schemas in `apps/web/src/schemas/auth.ts`.
7. Add `apps/web/src/services/auth-service.ts` for password hashing, user creation, credential verification, session creation, session lookup, and sign-out.
8. Add `apps/web/src/lib/auth.ts` for cookie names, cookie options, session token hashing, current-user lookup, and unauthorized helpers.
9. Add `/api/auth/sign-up`, `/api/auth/sign-in`, `/api/auth/sign-out`, and `/api/auth/me` route handlers.
10. Update existing API route handlers to require auth and pass `userId` to services.
11. Update recipe, pantry item, weekly plan, and grocery list services to accept `userId` and scope all Prisma queries.
12. Update reference checks in weekly plan and grocery list services to verify records owned by the current user.
13. Add sign-in and sign-up pages and form components.
14. Add session-aware navigation and sign-out UI.
15. Add route protection using middleware and keep API route-level auth checks.
16. Update service and route tests for authenticated setup and user-scoped behavior.
17. Add frontend smoke coverage for sign-in, sign-up, redirects, and sign-out behavior.
18. Run `pnpm --filter @pantry/web test`, `pnpm --filter @pantry/web lint`, and `pnpm --filter @pantry/web build`.

If using Better Auth instead, replace tasks 1, 6, 7, 8, and 9 with:

1. Add and configure Better Auth with its Prisma adapter and Next.js route handler.
2. Generate or apply the Better Auth auth schema/migration.
3. Add a thin Pantry auth helper that reads the Better Auth session and returns the current `{ id, email }`.
4. Keep Pantry's route handlers responsible for requiring auth before calling services.
5. Keep Pantry's Zod schemas for Pantry-owned request bodies; do not accept `userId` from clients.
6. Update tests to create authenticated Better Auth users/sessions or provide a supported test helper around session lookup.

## Risks / Open Questions

- Existing data ownership needs a decision: backfill all current records to one default user, or reset/reseed local data.
- Password reset and email verification are intentionally deferred. That is acceptable for a private or early V1 but should be revisited before broader usage.
- The app needs a session lifetime decision. A reasonable V1 default is 30 days.
- Session cleanup can be simple for V1, such as deleting expired sessions during lookup/sign-in, but a scheduled cleanup job may be needed later.
- Middleware can protect pages, but API routes must still enforce auth directly because middleware alone is not the business boundary.
- Auth.js or hosted auth may become more attractive if provider login, password reset, email verification, or account-management UI becomes a near-term requirement.
- Better Auth may be attractive if the team wants library-owned credentials/session flows while staying self-hosted, but it introduces dependency and schema conventions before Pantry has proven it needs them.
- Migration order matters because current unique constraints on `PantryItem.normalizedName`, `WeeklyPlan.weekStart`, and `GroceryList.key` must be replaced only after ownership is populated.
