# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Documentation Requirements

**IMPORTANT**: After making ANY code changes, you MUST update all relevant documentation:

1. **readme.md** - Update feature descriptions, usage instructions, and commands table
2. **changelog.md** - Add changes to the `[Unreleased]` section
3. **CLAUDE.md** - Update if architecture or data flow changes (this file)

Never skip documentation updates. Always check all three files after implementing features or making changes.

## Build Commands

```bash
npm run compile      # Compile TypeScript
npm run watch        # Watch mode compilation
npm run lint         # Run ESLint
```

## Package and Install

```bash
npm run compile && npx vsce package --allow-missing-repository && code --install-extension auditracker-*.vsix --force
```

## Architecture

This is a VSCode extension for tracking code audit progress. The codebase follows a layered architecture:

## Workspace Support

Auditracker intentionally supports **single-folder, local file system workspaces only**.

- If no folder is open, the extension disables itself.
- If VSCode is opened with a multi-root workspace, the extension warns and disables itself to avoid ambiguous state storage and relative paths.

### Entry Point
- `src/extension.ts` - Activates extension, registers all commands, tree views, and providers. Contains command implementations inline.

### Services Layer (`src/services/`)
- **StateManager** - Persists state to `.vscode/{repo-name}-auditracker.json`. Manages scope paths, `excludedPaths`, `functionFilters`, scoped files with functions, and progress history. All state mutations go through this class.
- **StateManager** also tracks `excludedPaths` for files explicitly removed from scope (useful when a folder is in scope but a specific file should be skipped).
- **ScopeManager** - Orchestrates adding/removing files from scope. Expands folders to files, delegates to SymbolExtractor, updates StateManager.
- **SymbolExtractor** - Uses VSCode's `DocumentSymbolProvider` API to extract functions/methods from files.

### Providers Layer (`src/providers/`)
- **AuditTreeProvider** - `TreeDataProvider` for the Functions panel. Shows files with their functions, sorted by review status (unread → read → reviewed).
- **ScopeDecorationProvider** - `FileDecorationProvider` that adds 📌 badge to in-scope files in the Explorer.

### Models (`src/models/types.ts`)
TypeScript interfaces for all data structures: `FunctionState`, `ScopedFile`, `DailyProgress`, `AuditrackerState`.

Key `FunctionState` fields: `id`, `name`, `filePath`, `startLine`, `endLine`, `readCount`, `isReviewed`, `isEntrypoint`, `isAdmin`, `isHidden`.

### Data Flow
1. On activation, if no scope exists: try SCOPE file → auto-discover source folder (`contracts/`, `src/`, `lib/`, `sources/`)
2. User can also add file/folder to scope via context menu
3. `ScopeManager.addToScope()` expands path, extracts symbols via `SymbolExtractor`
4. `StateManager` stores file data and persists to JSON
5. Tree providers read from `StateManager` and render UI
6. Decoration providers query `StateManager` to determine badges

### Key Files
- State: `.vscode/{repo-name}-auditracker.json`
- Progress report: `.vscode/{repo-name}-audit-progress.md`
- Scope definition: `SCOPE.txt` or `SCOPE.md` at workspace root (optional, auto-loaded)
