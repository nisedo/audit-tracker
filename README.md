<p align="center">
  <img src="icon.png" alt="AuditTracker Logo" width="128" height="128">
</p>

# AuditTracker

A VSCode extension for tracking code audit progress. Mark files as in-scope, track function review status, identify entrypoints, and take notes.

## Features

- **Scope Management**: Right-click files or folders in the Explorer to add/remove from audit scope
- **File Decorations**: In-scope files display a 📌 badge in the Explorer
- **Function Tracking**: Automatically extracts all functions from in-scope files
- **Review Status**: Track functions as unread, read, or reviewed
- **Entrypoints**: Mark critical functions as entrypoints for special visibility
- **SCOPE File Support**: Auto-load scope from `SCOPE.txt` or `SCOPE.md` at workspace root
- **Navigation**: Click any function to jump to it with temporary highlighting
- **Notes**: Take codebase-level notes (markdown file) and line-specific notes
- **Progress Tracking**: Automatic daily progress tracking with detailed markdown reports
- **Persistence**: State is saved per-workspace in `.vscode/{repo-name}-audit-tracker.json`

## Usage

### Adding Files to Scope

1. Right-click a file or folder in the Explorer
2. Select **AuditTracker: Add to Scope**
3. Functions will appear in the AuditTracker panel

Or create a `SCOPE.txt` / `SCOPE.md` file at your workspace root with one path per line:

```
src/contracts/Token.sol
src/contracts/Vault.sol
lib/utils/
```

The scope file is auto-loaded when no existing config is found. Use the **AuditTracker: Load Scope File** command to manually reload it.

### Tracking Progress

Functions display with three states:
- **Unread** (circle icon): Not yet reviewed
- **Read** (eye icon, yellow): Read but not fully reviewed
- **Reviewed** (check icon, green): Fully reviewed

**Workflow**: Functions must be marked as "read" before they can be marked as "reviewed". Right-click or use inline buttons to change status.

### Hiding Functions

Some functions (like abstract declarations or trivial getters) may not need review. Right-click a function and select **Hide Function** to remove it from the panel. Hidden functions:
- Don't appear in the function list
- Don't count toward review progress
- File description shows hidden count (e.g., "3/10 reviewed (2 hidden)")

To restore hidden functions, right-click the file and select **Show Hidden Functions**.

### Marking Entrypoints

Right-click any function and select **Mark as Entrypoint** to highlight critical entry points. Entrypoints display with:
- Arrow prefix (`→`)
- "entrypoint" label in the description

### Taking Notes

AuditTracker provides two types of notes:

**Codebase Notes**: A markdown file (`.vscode/{repo-name}-audit-tracker-notes.md`) for free-form notes about the entire codebase. Click "Codebase Notes" in the Notes panel to open it. The file is auto-populated with the git repo URL and commit hash when first created.

**Line Notes**: Attach notes to specific lines of code:
1. Right-click on a line and select **AuditTracker: Add Line Note**
2. Lines with notes show a gutter icon
3. Hover over annotated lines to see the note content
4. Click notes in the Notes panel to navigate to them

### Progress Tracking

AuditTracker automatically tracks your daily audit activity. Use **AuditTracker: Show Progress Report** to generate a markdown report showing:

- **Overall Progress**: Current status of functions and files (read/reviewed counts and percentages)
- **Daily Activity Summary**: Table of daily counts for functions read/reviewed, lines of code read/reviewed, files completed, and notes added
- **Detailed Activity Log**: For each day, lists exactly which functions were read/reviewed, which files were completed, and which notes were added

The report is saved to `.vscode/{repo-name}-audit-progress.md` and opens automatically.

### Panel Information

Each function shows:
- Function name
- Status (unread/read/reviewed)
- Line count
- Entrypoint indicator (if applicable)

Each file shows:
- Relative path
- Review progress (e.g., "3/10 reviewed")

## Commands

| Command | Description |
|---------|-------------|
| `AuditTracker: Add to Scope` | Add file/folder to audit scope |
| `AuditTracker: Remove from Scope` | Remove from scope |
| `AuditTracker: Load Scope File` | Load/reload scope from SCOPE.txt or SCOPE.md |
| `AuditTracker: Clear All Tracking State` | Reset all tracking data |
| `AuditTracker: Open Codebase Notes` | Open the codebase notes markdown file |
| `AuditTracker: Add Line Note` | Add a note to the current line |
| `AuditTracker: Show Progress Report` | Generate and open daily progress report |
| `Hide Function` | Hide a function from the panel (context menu) |
| `Show Hidden Functions` | Restore all hidden functions in a file (context menu) |
| `Refresh` | Re-extract symbols from all files |

## Requirements

- VSCode 1.85.0 or higher
- Language server for your target language (for symbol extraction)

## Extension Settings

This extension stores state in `.vscode/{repo-name}-audit-tracker.json` within your workspace, where `{repo-name}` is the name of your workspace folder.

Codebase notes are stored in `.vscode/{repo-name}-audit-tracker-notes.md`.

Progress reports are generated at `.vscode/{repo-name}-audit-progress.md`.

## Language Support

Works with any language that provides document symbols via VSCode's Language Server Protocol.

**Important**: Install only **one** language extension per language to avoid duplicate or conflicting symbols.

### Recommended Extensions

| Language | Recommended Extension |
|----------|----------------------|
| Solidity | [Solidity by Juan Blanco](https://marketplace.visualstudio.com/items?itemName=JuanBlanco.solidity) (`JuanBlanco.solidity`) |
| TypeScript/JavaScript | Built-in VSCode support |
| Rust | rust-analyzer |
| Go | gopls |

## Release Notes

### 0.2.0

- Daily progress tracking with detailed markdown reports
- Hide/unhide functions from panel
- Read-before-review workflow enforcement
- Faster navigation highlighting (500ms)
- Simplified symbol extraction (requires single language extension per language)

### 0.1.0

Initial release:
- Scope management via context menu
- Function tracking (unread/read/reviewed)
- Entrypoint marking
- SCOPE file auto-loading and manual loading command
- Function navigation with highlighting
- Codebase notes (markdown file)
- Line notes with gutter icons, hover, and navigation
- Per-workspace state persistence with dynamic naming

## License

MIT
