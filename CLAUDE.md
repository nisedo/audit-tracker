# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Documentation Requirements

**IMPORTANT**: After making ANY code changes, you MUST update all relevant documentation:

1. **readme.md** - Update feature descriptions, usage instructions, and commands table
2. **CLAUDE.md** - Update if architecture or data flow changes (this file)

Never skip documentation updates. Always check both files after implementing features or making changes.

## Build Commands

```bash
npm run compile      # Compile TypeScript
npm run watch        # Watch mode compilation
npm run lint         # Run ESLint
```

## Package and Install

```bash
npm run compile && npx vsce package && code --install-extension auditracker-*.vsix --force
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
- **StateManager** - Persists state to `.vscode/{repo-name}-auditracker.json`. Manages scope paths, `excludedPaths`, scoped files with functions, and progress history. All state mutations go through this class.
- **StateManager** also tracks `excludedPaths` for files explicitly removed from scope (useful when a folder is in scope but a specific file should be skipped).
- **ScopeManager** - Orchestrates adding/removing files from scope. Expands folders to files, delegates to SymbolExtractor, updates StateManager.
- **SymbolExtractor** - Uses VSCode's `DocumentSymbolProvider` API to extract functions/methods from files.

### Providers Layer (`src/providers/`)
- **ActiveFileTreeProvider** - `TreeDataProvider` for the Active File panel (top). Shows functions of a single selected file, sorted by audit status (unaudited → audited). Shows a placeholder when no file is selected.
- **FilesTreeProvider** - `TreeDataProvider` for the Files panel (bottom). Flat list of all in-scope files with audit progress counts. Clicking a file selects it into the Active File panel and opens it in the editor.

### Models (`src/models/types.ts`)
TypeScript interfaces for all data structures: `FunctionState`, `ScopedFile`, `DailyProgress`, `AudiotrackerState`.

Key `FunctionState` fields: `id`, `name`, `filePath`, `startLine`, `endLine`, `isAudited`, `isHidden`.

### Data Flow
1. On activation, if no scope exists: try SCOPE file → auto-discover source folder (`contracts/`, `src/`, `lib/`, `sources/`)
2. User can also add file/folder to scope via context menu
3. `ScopeManager.addToScope()` expands path, extracts symbols via `SymbolExtractor`
4. `StateManager` stores file data and persists to JSON
5. User clicks a file in the Files panel → `ActiveFileTreeProvider.setActiveFile()` loads it into the top panel
6. Both tree providers read from `StateManager` and render UI

### Key Files
- State: `.vscode/{repo-name}-auditracker.json`
- Progress report: `.vscode/{repo-name}-audit-progress.md`
- Scope definition: `SCOPE.txt` or `SCOPE.md` at workspace root (optional, auto-loaded)
