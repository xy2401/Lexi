# Repository Guidelines

## Project Structure & Module Organization

Lexi uses Vue 3, TypeScript, Vite, Pinia, and Dexie/IndexedDB.

- `src/components/`: Vue interfaces; `src/composables/`: shared browser interactions; `src/stores/`: Pinia state.
- `src/lib/`: dictionary, reader, course, persistence, and import logic; `src/assets/main.css`: shared styling.
- `tests/`: Vitest suites and IndexedDB setup.
- `scripts/`: dataset builders, validators, and the local ebook server.
- `public/data/`: course Markdown and indexes; `public/dicts/`: generated dictionary assets.
- `data/ECDICT/`: upstream submodule; `docs/`: architecture and course specifications. `dist/` is generated output.

## Build, Test, and Development Commands

Use Node.js 22+ (`.node-version`). Install dependencies with `npm install`; initialize data with `git submodule update --init --recursive`.

- `npm run build:data`: extract ECDICT and generate Main/Hot dictionary shards.
- `npm run build:wordnet`: download, verify, and build WordNet assets; requires network access initially.
- `npm run dev`: generate extension datasets and serve Vite at port 3000.
- `npm run dev:library -- --root "D:\path\to\Ebooks" --port 8000`: serve an external ebook library with CORS.
- `npm run build`: build WordNet/extensions, validate Duolingo courses, and produce `dist/`.
- `npm run preview`: preview the production build.
- `npm run typecheck`: check TypeScript with `tsc --noEmit`.
- `npm test`: run all Vitest suites.
- `npm run validate:course` / `npm run validate:system-courses` / `npm run validate:dicts`: validate Duolingo versions, system chapters, or dictionary assets.

## Coding Style & Naming Conventions

Follow existing two-space indentation, single-quoted JavaScript/TypeScript strings, and omitted semicolons. Use Vue `<script setup lang="ts">`, PascalCase component filenames, `useX.ts` composables, kebab-case library filenames, and camelCase functions. Use strict TypeScript; no ESLint or Prettier configuration is present.

## Testing Guidelines

Tests use Vitest with jsdom and `fake-indexeddb`. Name suites `tests/<feature>.test.ts`; describe observable behavior with `describe` and `it`. Add regression tests for changed persistence, imports, parsing, or interactions. Run one suite with `npm test -- tests/reader-library.test.ts`. No numeric coverage threshold is configured. Check responsive UI changes on desktop and mobile.

## Commit & Pull Request Guidelines

Recent history favors `feat:`, `fix:`, and optional scopes such as `feat(courses):`. Use concise, imperative summaries. PRs should explain behavior changes, link relevant issues, report validation commands, and include screenshots for UI changes.

## Data & Configuration Guidelines

Generate ignored datasets with scripts. System courses follow `public/data/system-courses/_spec.md` and `_curriculum.md`; store chapters directly in category folders (no series subdirectories), use stable slugs for reading records, and preserve legacy migration mappings. New Duolingo versions follow `docs/duolingo-course-versions.md`: preserve source JSON; never consult old/other-model prose. Separate `.test.md` exercises follow `docs/duolingo-practice-spec.md`: write readable Markdown with stable tags, not JSON blocks. `build:course` updates availability only. Legacy maintenance follows `docs/duolingo-unit-spec.md`. Preserve sanitization, safe paths, HTTPS/CORS, and `LICENSES` attribution.
