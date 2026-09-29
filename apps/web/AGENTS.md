# Pantry Engineering Instructions

This file defines the shared rules for all AI agents working in the Pantry repository.

Role-specific instructions live under:

- `agents/orchestrator.md`
- `agents/architect.md`
- `agents/backend.md`
- `agents/frontend.md`
- `agents/tester.md`
- `agents/reviewer.md`

All agents must follow this file in addition to their role-specific instructions.

# Project

Pantry is a recipe and meal-planning application.

Users will be able to manage recipes, plan meals, generate shopping lists, and eventually use AI-assisted features around recipes and pantry contents.

# Technology

Current stack:

- Next.js
- React
- TypeScript
- PostgreSQL
- Prisma
- Zod
- Vitest
- pnpm workspaces

# Architecture

## Frontend

Frontend code primarily lives in:

- `apps/web/app/**`
- `apps/web/components/**`
- `apps/web/hooks/**`

Frontend code must not access Prisma or the database directly.

## API

Next.js Route Handlers live under:

`apps/web/app/api/**`

Route handlers should remain thin.

They should primarily:

1. parse requests
2. validate external input
3. call services
4. translate known errors into HTTP responses
5. return responses

Business logic should not live directly in route handlers unless it is trivial.

## Services

Business logic belongs primarily under:

`apps/web/services/**`

Services should:

- operate on validated inputs
- enforce domain behavior
- coordinate database operations
- remain independent of HTTP-specific concepts where practical

## Validation

External input must be treated as untrusted.

Use Zod for request validation.

Schemas should primarily live under:

`apps/web/schemas/**`

Prefer deriving TypeScript types from Zod schemas instead of maintaining duplicate interfaces.

## Database

Use the shared Prisma client.

Do not instantiate separate Prisma clients inside individual services or routes.

Database schema changes must be intentional and clearly reported.

Do not modify Prisma models or create migrations unless the assigned task requires it.

# General Engineering Rules

Before changing code:

1. Read the task carefully.
2. Read this file.
3. Read the relevant role-specific agent file.
4. Inspect the relevant existing code.
5. Understand existing conventions.
6. Identify the smallest change required.

Prefer:

- straightforward solutions
- existing project patterns
- small changes
- explicit behavior
- strong type safety
- clear separation of responsibilities

Avoid:

- speculative architecture
- premature abstractions
- unrelated refactors
- unnecessary dependencies
- implementing future requirements that were not requested
- rewriting working code without a clear reason

# Scope Control

Agents must keep changes scoped to the assigned task.

Do not:

- refactor unrelated files
- rename unrelated code
- reorganize directories without need
- rewrite existing architecture without explicit direction
- add packages without justification and user approval
- silently alter API contracts
- silently alter product requirements

If a task requires a significant change outside the assigned scope, report it to the orchestrator.

# Git and Merge Authority

Agents may:

- inspect files
- edit files
- create files
- run development commands
- run tests
- run type checks
- run builds
- inspect diffs
- review code

Agents must never:

- merge changes
- commit changes
- push changes
- create commits on behalf of the user
- approve pull requests
- merge pull requests
- modify Git history
- delete branches
- force push
- run destructive Git commands
- represent changes as approved by the user

All changes must remain available for human review.

Only the user decides whether changes are:

- committed
- pushed
- merged
- accepted

No agent may override this rule.

# Destructive Operations

Agents must not run destructive commands without explicit user instruction.

Examples include:

- deleting large groups of files
- dropping databases
- resetting databases
- removing migrations
- force-resetting Git state
- rewriting Git history
- deleting branches
- force pushing

If destructive work appears necessary, stop and report why.

# Dependency Changes

Do not add, remove, or upgrade dependencies unless required by the task.

Before adding a dependency:

1. determine whether the existing stack can solve the problem
2. explain why the dependency is needed
3. surface the proposed dependency to the user

Do not introduce libraries only for convenience when the existing stack is sufficient.

# Database Changes

Database changes require additional caution.

Agents must clearly report:

- models changed
- fields added or removed
- relationships changed
- migration implications
- compatibility risks

Do not apply destructive migrations without explicit user instruction.

# API Contracts

Do not silently change existing API behavior.

Any API contract change must identify:

- HTTP method
- route
- request shape
- response shape
- validation rules
- status codes
- relevant error cases

If frontend and backend expectations disagree, report the mismatch instead of inventing behavior.

# Testing

Testing should verify requirements rather than merely confirm implementation details.

Agents must not:

- remove failing tests to get a green suite
- weaken assertions without justification
- skip failing tests solely to make checks pass
- claim tests passed when they were not run
- alter expected behavior merely to match an incorrect implementation

Relevant checks should be run after implementation when practical.

Examples:

- unit tests
- integration tests
- TypeScript checks
- linting
- production builds

The exact checks should depend on the scope of the change.

# Error Handling

Do not silently swallow errors.

Expected errors should be handled intentionally.

Unexpected errors should remain observable during development.

Do not expose sensitive implementation details or raw database errors through public APIs.

# Type Safety

Prefer strong TypeScript types.

Avoid:

- unnecessary `any`
- unsafe casts
- ignoring TypeScript errors
- duplicating types that can be inferred from existing schemas or generated types

Do not use type assertions simply to suppress compiler errors.

# Security

Treat all external input as untrusted.

Be cautious with:

- user-controlled IDs
- ownership fields
- authorization boundaries
- database writes
- secrets
- environment variables
- raw error responses

Do not place secrets in source code.

When authentication or authorization becomes relevant, do not assume a user is authorized simply because the frontend supplied an identifier.

# Multi-Agent Workflow

For substantial features, the primary agent should act as the orchestrator.

Typical flow:

1. Architect
2. Backend and/or Frontend
3. Tester
4. Reviewer
5. User review

## Architect

Use for:

- API design
- data modeling
- architecture decisions
- identifying affected components
- breaking work into implementation tasks

Read:

`agents/architect.md`

## Backend

Use for:

- Next.js Route Handlers
- services
- Zod schemas
- Prisma integration
- backend behavior

Read:

`agents/backend.md`

## Frontend

Use for:

- React components
- forms
- UI behavior
- client-side API integration

Read:

`agents/frontend.md`

## Tester

Use after implementation.

The tester should independently verify the requested behavior.

Read:

`agents/tester.md`

## Reviewer

Use after testing.

The reviewer should inspect the completed implementation and identify blocking or non-blocking issues.

Read:

`agents/reviewer.md`

# Agent Coordination

Agents may read the entire repository when necessary for context.

Write access should remain limited to files relevant to the assigned task.

Avoid having multiple agents modify the same files concurrently.

If two agents need changes in the same file:

1. coordinate ownership through the orchestrator
2. perform changes sequentially
3. inspect the combined diff afterward

The orchestrator is responsible for preventing conflicting work.

# Human Decision Points

The user remains the final authority for:

- architecture approval
- API contract approval
- database schema changes
- dependency additions
- significant product behavior changes
- final code acceptance
- committing
- pushing
- merging

Agents may recommend or report.

Agents may not make these decisions on the user's behalf.

# Completion Standard

A substantial implementation should not be considered complete until:

- requested behavior is implemented
- relevant checks have been run
- known test failures are documented
- reviewer findings are documented
- assumptions are documented
- unresolved issues are surfaced
- changes remain unmerged for user review

A passing test suite or clean review does not constitute user approval.
