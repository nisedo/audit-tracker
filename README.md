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

Right-click or use inline buttons to change status.

### Marking Entrypoints

Right-click any function and select **Mark as Entrypoint** to highlight critical entry points. Entrypoints display with:
- Arrow prefix (`→`)
- "entrypoint" label in the description

### Taking Notes

AuditTracker provides two types of notes:

**Codebase Notes**: A markdown file (`.vscode/{repo-name}-audittracker-notes.md`) for free-form notes about the entire codebase. Click "Codebase Notes" in the Notes panel to open it.

**Line Notes**: Attach notes to specific lines of code:
1. Right-click on a line and select **AuditTracker: Add Line Note**
2. Lines with notes show a gutter icon
3. Hover over annotated lines to see the note content
4. Click notes in the Notes panel to navigate to them

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
| `Refresh` | Re-extract symbols from all files |

## Requirements

- VSCode 1.85.0 or higher
- Language server for your target language (for symbol extraction)

## Extension Settings

This extension stores state in `.vscode/{repo-name}-audit-tracker.json` within your workspace, where `{repo-name}` is the name of your workspace folder.

Codebase notes are stored in `.vscode/{repo-name}-audittracker-notes.md`.

## Language Support

Works with any language that provides document symbols via VSCode's Language Server Protocol. Includes special handling for:
- **Solidity**: Cleans up metadata from solidity-visual-auditor extension

## Known Issues

- Duplicate symbols may appear if multiple language servers provide overlapping results (mitigated by line-based deduplication)

## Release Notes

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
