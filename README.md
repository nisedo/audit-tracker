# Audit Tracker

A VSCode extension for tracking code audit progress. Mark files as in-scope, track function review status, and identify entrypoints.

## Features

- **Scope Management**: Right-click files or folders in the Explorer to add/remove from audit scope
- **Function Tracking**: Automatically extracts all functions from in-scope files
- **Review Status**: Track functions as unread, read, or reviewed
- **Entrypoints**: Mark critical functions as entrypoints for special visibility
- **SCOPE File Support**: Auto-load scope from `SCOPE.txt` or `SCOPE.md` at workspace root
- **Navigation**: Click any function to jump to it with temporary highlighting
- **Persistence**: State is saved per-workspace in `.vscode/audit-tracker.json`

## Usage

### Adding Files to Scope

1. Right-click a file or folder in the Explorer
2. Select **Audit: Add to Scope**
3. Functions will appear in the Audit Tracker panel

Or create a `SCOPE.txt` / `SCOPE.md` file at your workspace root with one path per line:

```
src/contracts/Token.sol
src/contracts/Vault.sol
lib/utils/
```

### Tracking Progress

Functions display with three states:
- **Unread** (circle icon): Not yet reviewed
- **Read** (eye icon, yellow): Read but not fully reviewed
- **Reviewed** (check icon, green): Fully reviewed

Right-click or use inline buttons to change status.

### Marking Entrypoints

Right-click any function and select **Mark as Entrypoint** to highlight critical entry points. Entrypoints display with:
- Arrow prefix (`->`)
- Rocket icon
- "entrypoint" label

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
| `Audit: Add to Scope` | Add file/folder to audit scope |
| `Audit: Remove from Scope` | Remove from scope |
| `Audit: Clear All Tracking State` | Reset all tracking data |
| `Refresh` | Re-extract symbols from all files |

## Requirements

- VSCode 1.85.0 or higher
- Language server for your target language (for symbol extraction)

## Extension Settings

This extension stores state in `.vscode/audit-tracker.json` within your workspace.

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
- SCOPE file auto-loading
- Function navigation with highlighting
- Per-workspace state persistence

## License

MIT
