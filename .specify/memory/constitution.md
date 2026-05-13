<!--
## Sync Impact Report

**Version Change**: 1.1.0 → 1.2.0 (MINOR — new principle added)

**Added Sections**:
- VI. User-Facing Documentation: establishes that README and all user-facing docs MUST be
  written for first-time readers with no knowledge of project history.

**Modified Sections**: none

**Templates**: no changes required (existing templates are unaffected)

**Deferred TODOs**: none
-->

# Cronulent Constitution

## Core Principles

### I. Minimum Viable Code

Every implementation MUST contain the minimum code necessary to satisfy the defined
success criteria. Speculative features, premature abstractions, and defensive code for
impossible scenarios are prohibited. When in doubt, delete rather than add.

**Rationale**: Complexity compounds. Every unnecessary line increases cognitive load,
test surface, and future maintenance cost. Keeping code minimal ensures every line
serves a verified purpose.

### II. Precision Over Scope

Changes MUST be scoped to the exact files and components required by the task.
Incidental cleanup of unrelated code, style fixes in adjacent files, and refactoring
beyond the task boundary are prohibited unless explicitly part of the defined task.

**Rationale**: Unbounded changes inflate diffs, introduce regressions in unreviewed
areas, and make ownership unclear. Surgical precision preserves stability.

### III. Defined Success Criteria

Every feature MUST have measurable, technology-agnostic success criteria defined before
implementation begins. Implementation MUST NOT be considered complete until all criteria
are verified. Vague outcomes ("it works", "looks good") are not acceptable success
criteria.

**Rationale**: Without explicit criteria, completion is undefined and regressions go
undetected. Criteria drive both implementation scope and validation.

### IV. Monorepo Package Discipline

Packages in `packages/` MUST be independently lintable and type-checkable. Each package
MUST have a clear, singular purpose. `apps/` MUST NOT reach directly into another app's
source; shared code MUST live in a `packages/` workspace package. Inter-package
dependencies MUST be declared explicitly in `package.json`.

Shared source packages (e.g., `@repo/common`) MUST be referenced directly via TypeScript
path aliases pointing to their source — they MUST NOT have a build step or emit compiled
artifacts. Consumers MUST add the appropriate `paths` entries in their `tsconfig.json`
(e.g., `"@repo/common": ["../../packages/common/src/index.ts"]`).

**Rationale**: Turborepo's incremental builds and remote caching depend on clean package
boundaries. Leaky boundaries break caching guarantees and make ownership ambiguous.

### V. Type Safety

All TypeScript code MUST compile with `strict: true` and zero errors. Use of `any` is
prohibited without an inline comment explaining why a typed alternative is infeasible.
ESLint violations and Prettier formatting errors MUST be resolved before merge;
`--max-warnings 0` is enforced.

**Rationale**: Type errors caught at compile time cost nothing. Type errors in production
are expensive. Strict typing is the minimum viable safety net for a multi-package
monorepo where interface mismatches propagate across package boundaries.

### VI. User-Facing Documentation

The README and all user-facing documentation MUST be written exclusively for someone
encountering the project for the first time with no prior knowledge of its history.
Every sentence MUST describe the current state of the software as a standalone fact.

References to prior states, removed features, or incremental changes are prohibited.
Phrases that implicitly reference history — such as "no longer", "now uses", "replaced",
"previously", or comparisons to a former design — MUST NOT appear.

**Rationale**: Documentation that assumes historical knowledge confuses new users and
degrades over time as the referenced history becomes irrelevant. Present-tense,
history-free documentation serves all readers equally and ages well.

## Technology Standards

The following stack is canonical. Deviations require explicit justification in the PR
description and a corresponding update to this section.

- **Language**: TypeScript 5.x with `strict: true`
- **Build System**: Turborepo + pnpm workspaces
- **Package Manager**: pnpm 9.x
- **Linting**: ESLint (`@repo/eslint-config`) with `--max-warnings 0`
- **Formatting**: Prettier (enforced via `pnpm format`)
- **Type Checking**: `turbo check-types` — zero errors required

### Framework-based apps (e.g., Next.js)

- **Runtime**: Node.js ≥ 18
- **Framework**: Next.js with React 19
- TypeScript config: extend `@repo/typescript-config/nextjs.json`

### Standalone Node.js apps

Standalone apps (no framework bundler) MUST use Node.js native TypeScript execution
rather than a separate transpile/build step:

- **Runtime**: Node.js ≥ 22.6 (strip-types support); Node.js ≥ 23.6 preferred (stable,
  no flag required)
- Run entry points directly: `node --experimental-strip-types src/index.ts` (22.x) or
  `node src/index.ts` (23.6+)
- TypeScript config: extend `@repo/typescript-config/node.json`
- `package.json` MUST include `"type": "module"` and invoke Node directly in scripts —
  no `tsc`, `esbuild`, or similar build tools unless emitting to `dist/` is explicitly
  justified

### Shared packages

- Shared source packages MUST set `noEmit: true` and have no `build` script
- TypeScript config: extend `@repo/typescript-config/react-library.json` (UI) or
  `@repo/typescript-config/node.json` (non-UI)

New runtime dependencies MUST be evaluated for bundle-size impact before adoption.
Dev-only tooling MUST be placed in `devDependencies` and shared via workspace packages
where possible to avoid duplication across `packages/` and `apps/`.

## Development Workflow

All work MUST follow this sequence; skipping steps is a constitution violation:

1. **Define**: Write measurable success criteria in the feature spec before any code.
2. **Scope**: Confirm the change is bounded to the minimum set of files required.
3. **Implement**: Write only what is needed to satisfy the criteria (Principle I & II).
4. **Type-check**: `turbo check-types` — zero errors required.
5. **Lint**: `turbo lint` — zero warnings required.
6. **Build**: `turbo build` — all packages and apps MUST build cleanly.
7. **Verify**: Validate each success criterion from step 1 is demonstrably met.

Feature branches MUST follow the naming convention: `###-feature-name` (sequential
numeric prefix, kebab-case description). Commits SHOULD be atomic: one logical change
per commit with a concise, imperative-mood message.

## Governance

This constitution supersedes all other development practices and style preferences.

Amendments MUST:
1. Increment the version according to semantic versioning (MAJOR: principle removal or
   incompatible redefinition; MINOR: new principle or section; PATCH: clarification or
   wording fix).
2. Update `LAST_AMENDED_DATE` to the date of the change.
3. Prepend a Sync Impact Report as an HTML comment at the top of this file.
4. Update any dependent templates or docs identified in the report.

All feature `plan.md` files MUST include a Constitution Check gate (verified before
Phase 0 and re-checked after Phase 1). Complexity that appears to violate a principle
MUST be justified in the Complexity Tracking table in `plan.md` — not silently accepted.

**Version**: 1.2.0 | **Ratified**: 2026-05-12 | **Last Amended**: 2026-05-13
