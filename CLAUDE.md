# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
npm run compile      # Compile TypeScript
npm run watch        # Watch mode compilation
npm run lint         # Run ESLint
```

## Package and Install

```bash
npm run compile && npx vsce package --allow-missing-repository && code --install-extension audit-tracker-*.vsix --force
```

## Architecture

This is a VSCode extension for tracking code audit progress. The codebase follows a layered architecture:

### Entry Point
- `src/extension.ts` - Activates extension, registers all commands, tree views, and providers. Contains command implementations inline.

### Services Layer (`src/services/`)
- **StateManager** - Persists state to `.vscode/{repo-name}-audit-tracker.json`. Manages scope paths, scoped files with functions, and notes. All state mutations go through this class.
- **ScopeManager** - Orchestrates adding/removing files from scope. Expands folders to files, delegates to SymbolExtractor, updates StateManager.
- **SymbolExtractor** - Uses VSCode's `DocumentSymbolProvider` API to extract functions/methods from files. Includes Solidity-specific cleanup for solidity-visual-auditor metadata.

### Providers Layer (`src/providers/`)
- **AuditTreeProvider** - `TreeDataProvider` for the Functions panel. Shows files with their functions, sorted by review status (unread → read → reviewed).
- **NotesTreeProvider** - `TreeDataProvider` for the Notes panel. Shows codebase notes link and line notes grouped by file:line.
- **ScopeDecorationProvider** - `FileDecorationProvider` that adds 📌 badge to in-scope files in the Explorer.
- **NoteDecorationProvider** - Manages gutter icons for lines with notes. Also exports `NoteHoverProvider` for showing note content on hover.

### Models (`src/models/types.ts`)
TypeScript interfaces for all data structures: `FunctionState`, `ScopedFile`, `AuditNote` (union of `LineNote`, `CodebaseNote`, etc.), `AuditTrackerState`.

### Data Flow
1. User adds file/folder to scope via context menu
2. `ScopeManager.addToScope()` expands path, extracts symbols via `SymbolExtractor`
3. `StateManager` stores file data and persists to JSON
4. Tree providers read from `StateManager` and render UI
5. Decoration providers query `StateManager` to determine badges/icons

### Key Files
- State: `.vscode/{repo-name}-audit-tracker.json`
- Codebase notes: `.vscode/{repo-name}-audittracker-notes.md`
- Scope definition: `SCOPE.txt` or `SCOPE.md` at workspace root (optional, auto-loaded)
