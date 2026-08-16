# Project Principles — Obsidian Life Tracker

## Tech Stack
- Language/runtime: TypeScript, targeting the Obsidian Plugin API (desktop + mobile).
- Framework(s): React, used for custom views. Exact component/visual language (e.g. whether to draw on shadcn/ui-style patterns seen in the Lovable reference prototype) is deferred to a dedicated UI/UX design study during the design phase, not locked here.
- Database: none. Two-tier file-based storage instead (see Storage Model below) — deliberately rejects native/Node-only DB engines, which don't work on Obsidian mobile.
- Key libraries: charting library (Chart.js vs. Recharts vs. other) deferred to design.md per module, chosen against real requirements rather than guessed now.

## Storage Model
- **Definitions/config** (accounts, categories, habit definitions, data point definitions, recurring entry definitions, shopping list names, plugin preferences) → plugin settings (`data.json`).
- **Logged/time-series data** (transactions, habit check-ins, data point entries) → plain markdown files, one line per entry, Dataview-style inline fields (e.g. `- 2026-08-10 [account:: wallet] [amount:: -45] [category:: Food/Snacks]`).
- Habit/data-point logs specifically: one markdown line per day (not per habit/point), with each item's own id as the inline-field key.
- Rationale: Dataview-queryability, git-diffability, hand-editability, and mobile-safety (plain file I/O, no native DB binding). Chosen deliberately over an internal JSON store + generated summary — one source of truth, not two.
- Account balances change only via a recorded transaction (including a dedicated "adjustment" type) — never by editing a stored number directly.
- All "what is today" date logic goes through one shared function using local date parts — never UTC-based parsing (`.toISOString()`), which previously caused day-rollover bugs for UTC+2/+3 users.

## Conventions
- Layered architecture: `domain` (pure logic, no I/O) → `application` (services) → `infrastructure` (Obsidian file I/O) → `ui` (views/modals/settings) → `shared/ui-kit` (design system) → `main.ts` (composition root).
- Code style / linting: ESLint + Prettier, TypeScript strict mode.
- Naming conventions: camelCase for variables/functions, PascalCase for React components and classes, kebab-case for file names.
- File/module layout: one folder per life-tracking module under `src/modules/<module-name>/`; shared/cross-cutting code under `src/core/` and `src/shared/ui-kit/`.
- View-type strings are namespaced per-plugin to avoid Obsidian's global view-registry colliding with other plugins.
- User-facing display labels may diverge from internal type/storage-key names (e.g. a UI relabel doesn't require a matching code/data rename) — labels are a presentation concern, not a data-model concern.

## Testing Standards
- Required test types: unit tests for all calculation/aggregation logic (streaks, balances, completion rates, insight calculations); integration tests for markdown parse/write round-tripping and settings read/write. Full e2e is not required (Obsidian's plugin sandboxing makes it impractical) — each module's design.md instead defines a manual test checklist for UI flows.
- Coverage expectation: not numerically specified — flagged as an open item. Non-negotiable regardless: all calculation/aggregation logic and all data read/write paths must have tests.
- Build/verify convention: `tsc -noEmit -skipLibCheck` and the esbuild config must both run clean before every handoff.

## Non-Negotiable Constraints
- Security/compliance: Local-first. No tracked data is transmitted off-device; no telemetry, no third-party analytics.
- Performance floors: Not yet specified — the user has explicitly prioritized functionality, visual polish, and feature power over performance/bundle size/native-feel. Revisit only if real usage reveals a problem.
- Platform/OS support: Obsidian Desktop (Windows/macOS/Linux) and Obsidian Mobile (iOS/Android), with full functional parity. No Node-only APIs.
- Delivery convention: `main.js` + `styles.css` + `manifest.json` as drop-in files, plus a full-source archive.

## Standing Non-Goals
- No task management or time management (to-dos, scheduling, reminders, calendars) — Obsidian's existing plugin ecosystem already covers this well.
- No text-based journaling in this phase (explicitly deferred by the user).
- No possessions/inventory cataloging (item lists, warranties, valuations) — "tracking" in this project means life metrics/data points, not belongings.
- No built-in cloud sync — relies on whatever vault sync mechanism (Obsidian Sync, iCloud, Git, etc.) the user already uses.
- Will NOT constrain its visual design to match Obsidian's default UI conventions where a more deliberate, polished custom UI serves the user better — while still respecting the user's light/dark theme via Obsidian's own CSS variables.
- Will NOT hardcode a value or behavior that a reasonable user would want as a preference, following a sensible-default-plus-override pattern — with the explicit caveat that "everything is a setting" has a real cost in settings-UI surface and test states, so this is applied with judgment, not absolutism.
