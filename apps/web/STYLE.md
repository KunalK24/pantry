# Pantry TypeScript Style Guide

All TypeScript and TSX code in Pantry must follow these conventions. Prioritize readability, consistency, and simplicity.

## 1. Naming Conventions

| Element | Convention | Example |
|---|---|---|
| Variables | camelCase | `recipeId` |
| Functions | camelCase, verb-first | `createRecipe()` |
| Booleans | is/has/can/should prefix | `isLoading` |
| Types / Interfaces | PascalCase | `RecipeInput` |
| React Components | PascalCase | `RecipeForm` |
| Constants | UPPER_SNAKE_CASE for global constants | `MAX_RETRIES` |
| TypeScript files | kebab-case | `recipe-service.ts` |
| React component files | PascalCase | `RecipeForm.tsx` |
| Test files | `.test.ts` / `.test.tsx` | `recipe-service.test.ts` |

- Use descriptive names without unnecessary verbosity.
- Prefer domain-specific names (`recipe`, `ingredient`, `importJob`).
- Avoid vague names like `data`, `temp`, `handler`, or `utils` when something more specific is available.
- Use consistent terminology throughout the codebase.

## 2. Functions and Utilities

- Each function should have one clear responsibility.
- Prefer named functions for exported utilities and services.
- Use arrow functions for short callbacks and inline handlers.
- Prefer early returns over deeply nested conditionals.
- Extract utility functions only when logic is reused or sufficiently complex to warrant separation.
- Keep single-use helpers near their callers.
- Group related shared utilities into purpose-specific files (e.g., `recipe-utils.ts`, `date-utils.ts`).
- Avoid catch-all `utils.ts` or `helpers.ts` files.
- Do not create unnecessary wrappers, factories, classes, or generic abstractions.
- Prefer a small amount of duplication over a confusing abstraction.

## 3. TypeScript Conventions

- Use `const` by default; `let` only when reassignment is necessary.
- Never use `var`.
- Prefer type inference for local variables.
- Explicitly type function parameters and exported return values where useful.
- Prefer `type` for object shapes and unions; use `interface` when extension or declaration merging is needed.
- Avoid `any`. Use `unknown` when the type is genuinely unknown.
- Avoid unnecessary type assertions (`as`) and non-null assertions (`!`).
- Prefer string unions over enums for simple values.
- Use optional chaining (`?.`) and nullish coalescing (`??`) when appropriate.
- Infer types from Zod schemas and Prisma where possible instead of duplicating definitions.

## 4. Formatting and Readability

- Follow the project's ESLint and formatter configuration.
- Use 2-space indentation, semicolons, and double quotes.
- Include trailing commas in multiline structures.
- Use braces for conditional blocks, including single-line conditions.
- Keep functions and conditionals easy to scan.
- Avoid deeply nested ternaries and overly complex expressions.
- Prefer `async/await` over chained `.then()` calls.
- Avoid unnecessary comments; document *why*, not *what*.
- Separate distinct logical steps with blank lines.
- Do not introduce new formatting conventions that conflict with existing code.

## 5. Imports and Exports

- Prefer named exports for utilities, services, and components.
- Use default exports where required by Next.js.
- Use `import type` for type-only imports.
- Prefer the existing `@/` path alias for project imports.
- Keep imports organized: external packages, internal modules, then relative imports.
- Remove unused imports and exports.
- Avoid barrel files (`index.ts`) unless they provide a meaningful public interface.
- Do not introduce circular dependencies.

## 6. File Organization

- Keep related functionality together.
- Use filenames that describe their contents.
- Split files when they contain unrelated responsibilities or become difficult to navigate.
- Avoid creating separate files for trivial helpers or one-line functions.
- Place reusable domain logic in clearly named modules.
- Follow existing directory structure rather than introducing new patterns.

## 7. React Conventions

- Use functional components.
- Use PascalCase for component names.
- Name custom hooks with the `use` prefix.
- Prefer derived values over unnecessary React state.
- Avoid `useEffect` when logic can be performed during rendering or in an event handler.
- Extract components when they are reused or meaningfully improve readability.
- Keep simple component-specific helpers in the component file.
- Avoid unnecessary prop drilling abstractions or global state.

## 8. AI Agent Rules

When writing or modifying code:

1. Inspect existing code and follow established conventions.
2. Keep changes focused on the requested functionality.
3. Reuse existing utilities before creating new ones.
4. Avoid introducing abstractions for hypothetical future requirements.
5. Do not refactor unrelated code or rename files unnecessarily.
6. Remove unused code, imports, and temporary debugging statements.
7. Ensure new code passes existing linting and TypeScript checks.
8. Review the diff for unnecessary complexity before completion.

**Guiding principle:** Write straightforward, idiomatic TypeScript that another developer can understand and modify without additional explanation.
