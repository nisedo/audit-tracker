<p align="center">
  <img src="icon.png" alt="Auditracker Logo" width="128" height="128">
</p>

# Auditracker

[![CI](https://github.com/nisedo/auditracker/actions/workflows/ci.yml/badge.svg)](https://github.com/nisedo/auditracker/actions/workflows/ci.yml)

A VSCode extension for tracking code audit progress. Mark files as in-scope and track function audit status.

## Installation

```bash
git clone https://github.com/nisedo/auditracker.git && cd auditracker && npm install && npm run compile && npx @vscode/vsce package && code --install-extension auditracker-*.vsix --force
```

## Development

```bash
npm install
npm run compile   # type-check and build to out/
npm run lint      # ESLint
npm test          # unit tests (node --test) for the state/merge/persistence logic
```

## Features

- **Two-Panel Layout**: Top panel focuses on one file at a time; bottom panel lists all in-scope files
- **Scope Management**: Right-click files or folders in the Explorer to add/remove from audit scope
- **Function Tracking**: Automatically extracts all functions from in-scope files
- **Audit Status**: Track functions as unaudited or audited
- **Auto-Discovery**: Automatically loads `contracts/`, `src/`, `lib/`, or `sources/` folder when no scope is defined
- **SCOPE File Support**: Auto-load scope from `SCOPE.txt` or `SCOPE.md` at workspace root
- **Navigation**: Click any function to jump to it with temporary highlighting
- **Progress Tracking**: Automatic daily progress tracking with detailed markdown reports
- **Persistence**: State is saved per-workspace in `.vscode/{repo-name}-auditracker.json`

## Usage

### Panel Layout

Auditracker uses a two-panel layout in the sidebar:

- **Active File** (top): Shows all functions of the currently selected file. Click functions to navigate to them, mark them as audited, or hide them.
- **Files** (bottom): Lists all in-scope files with their audit progress (e.g., "3/23 audited"). Click a file to load it into the Active File panel and open it in the editor.

### Adding Files to Scope

**Auto-Discovery**: When you first open a workspace, Auditracker automatically scans for common source folders (`contracts/`, `src/`, `lib/`, `sources/`) and loads the first one found. No manual setup needed for most projects.

**Manual**: Right-click a file or folder in the Explorer and select **Auditracker: Add to Scope**.

**SCOPE File**: Create a `SCOPE.txt` or `SCOPE.md` file at your workspace root with one path per line:

```
src/contracts/Token.sol
src/contracts/Vault.sol
lib/utils/
```

The scope file is auto-loaded when no existing config is found. Use the **Auditracker: Load Scope File** command to manually reload it.

### Removing from Scope

Use **Auditracker: Remove from Scope** on a file or folder.

If a folder is in scope and you remove a single file, Auditracker remembers that file as **excluded**. To include it again, run **Auditracker: Add to Scope** on that file.

### Tracking Progress

Functions display with two states:

| Icon | Status | Description |
|:----:|--------|-------------|
| ○ | **Unaudited** | Not yet audited |
| ✓ | **Audited** | Audited (green) |

Click the inline button or right-click to change status.

### Hiding Functions

Some functions (like abstract declarations or trivial getters) may not need review. Right-click a function in the Active File panel and select **Hide Function** to remove it from the panel. Hidden functions:
- Don't appear in the function list
- Don't count toward audit progress
- File description shows hidden count (e.g., "3/10 audited (2 hidden)")

To restore hidden functions, right-click the file in the Files panel and select **Show Hidden Functions**.

### Progress Tracking

Auditracker automatically tracks your daily audit activity. Use **Auditracker: Show Progress Report** to generate a markdown report showing:

- **Overall Progress**: Current status of functions and files (audited counts and percentages)
- **Daily Activity Summary**: Table of daily counts for functions audited, lines of code audited, and files completed
- **Detailed Activity Log**: For each day, lists exactly which functions were audited and which files were completed

The report is saved to `.vscode/{repo-name}-audit-progress.md` and opens automatically.

### Panel Information

**Active File panel** — each function shows:
- Status icon (○ unaudited, ✓ audited)
- Function name
- Line count

**Files panel** — each file shows:
- File name (hover for full path)
- Audit progress (e.g., "3/23 audited")

## Commands

| Command | Description |
|---------|-------------|
| `Auditracker: Add to Scope` | Add file/folder to audit scope |
| `Auditracker: Remove from Scope` | Remove from scope |
| `Mark as Audited` | Mark function as audited (inline/context menu) |
| `Unmark Audited` | Unmark audited (context menu) |
| `Auditracker: Load Scope File` | Load/reload scope from SCOPE.txt or SCOPE.md |
| `Auditracker: Clear All Tracking State` | Reset all tracking data |
| `Auditracker: Show Progress Report` | Generate and open daily progress report |
| `Auditracker: Refresh` | Re-extract symbols from all files |
| `Hide Function` | Hide a function from the panel (context menu) |
| `Show Hidden Functions` | Restore all hidden functions in a file (context menu) |

## Requirements

- VSCode 1.85.0 or higher
- Trusted workspace (Auditracker writes tracking files under `.vscode/`)
- Local file system workspace only (no remote/virtual workspaces)
- Single-folder workspace only (multi-root workspaces are not supported)
- Language server for your target language (for symbol extraction)

## Extension Settings

This extension stores state in `.vscode/{repo-name}-auditracker.json` within your workspace, where `{repo-name}` is the name of your workspace folder.

Progress reports are generated at `.vscode/{repo-name}-audit-progress.md`.

If you don't want to commit these files, add them to your repo's `.gitignore`:

```
.vscode/*-auditracker.json
.vscode/*-audit-progress.md
```

## Language Support

Works with any language that provides document symbols via VSCode's Language Server Protocol.

**Important**: Install only **one** language extension per language to avoid duplicate or conflicting symbols.

### Recommended Extensions

| Language | Recommended Extension |
|----------|----------------------|
| Solidity | [Hardhat Solidity](https://marketplace.visualstudio.com/items?itemName=NomicFoundation.hardhat-solidity) (`NomicFoundation.hardhat-solidity`) |
| Rust | [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer) (`rust-lang.rust-analyzer`) |
