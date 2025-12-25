<p align="center">
  <img src="icon.png" alt="AuditTracker Logo" width="128" height="128">
</p>

# AuditTracker

A VSCode extension for tracking code audit progress. Mark files as in-scope, track function review status, and identify entrypoints.

## Features

- **Scope Management**: Right-click files or folders in the Explorer to add/remove from audit scope
- **File Decorations**: In-scope files display a 📌 badge in the Explorer
- **Function Tracking**: Automatically extracts all functions from in-scope files
- **Review Status**: Track functions as unread, read, or reviewed
- **Filtering**: Filter the panel by status and tags (unread/read/reviewed/entrypoint/important)
- **Entrypoints**: Mark critical functions as entrypoints for special visibility
- **Important Functions**: Mark high-priority functions that need extra auditor attention
- **SCOPE File Support**: Auto-load scope from `SCOPE.txt` or `SCOPE.md` at workspace root
- **Navigation**: Click any function to jump to it with temporary highlighting
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

### Removing from Scope

Use **AuditTracker: Remove from Scope** on a file or folder.

If a folder is in scope and you remove a single file, AuditTracker remembers that file as **excluded**. To include it again, run **AuditTracker: Add to Scope** on that file.

### Tracking Progress

Functions display with three states:

| Icon | Status | Description |
|:----:|--------|-------------|
| ○ | **Unread** | Not yet reviewed |
| 👁 | **Read** | Read but not fully reviewed (yellow) |
| ✓ | **Reviewed** | Fully reviewed (green) |

**Workflow**: Functions must be marked as "read" before they can be marked as "reviewed". Click the inline button or right-click to change status.

### Filtering Functions

Use **AuditTracker: Filter Functions** (or the filter icon in the panel title) to control which functions are shown.

- Status filters: unread/read/reviewed (you can select any combination)
- Tag filters: entrypoint/important

Filters are combined as: **(status matches) AND (tag matches)**. If you select multiple tags, a function matches if it has **any** selected tag.

Use **AuditTracker: Clear Function Filter** to reset back to showing everything.

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

### Marking Important Functions

Right-click any function and select **Mark as Important** to highlight high-priority functions that need extra attention. Important functions display with:
- Exclamation prefix (`❗`)
- "important" label in the description

Functions can be both entrypoints and important: `→ ❗ transfer()`

### Progress Tracking

AuditTracker automatically tracks your daily audit activity. Use **AuditTracker: Show Progress Report** to generate a markdown report showing:

- **Overall Progress**: Current status of functions and files (read/reviewed counts and percentages)
- **Daily Activity Summary**: Table of daily counts for functions read/reviewed, lines of code read/reviewed, and files completed
- **Detailed Activity Log**: For each day, lists exactly which functions were read/reviewed and which files were completed

The report is saved to `.vscode/{repo-name}-audit-progress.md` and opens automatically.

### Panel Information

Each function shows:
- Status icon (○ unread, 👁 read, ✓ reviewed)
- Function name (with → prefix for entrypoints, ❗ prefix for important)
- Line count

Each file shows:
- Relative path
- Review progress (e.g., "3/10 reviewed")

## Commands

| Command | Description |
|---------|-------------|
| `AuditTracker: Add to Scope` | Add file/folder to audit scope |
| `AuditTracker: Remove from Scope` | Remove from scope |
| `Mark as Read` | Mark function as read (inline/context menu) |
| `Mark as Unread` | Mark function as unread (context menu) |
| `Mark as Reviewed` | Mark function as reviewed (inline/context menu) |
| `Unmark Reviewed` | Unmark reviewed (context menu) |
| `AuditTracker: Filter Functions` | Filter which functions are shown in the panel |
| `AuditTracker: Clear Function Filter` | Clear the function filter |
| `AuditTracker: Load Scope File` | Load/reload scope from SCOPE.txt or SCOPE.md |
| `AuditTracker: Clear All Tracking State` | Reset all tracking data |
| `AuditTracker: Show Progress Report` | Generate and open daily progress report |
| `Mark as Entrypoint` | Mark function as an entrypoint (context menu) |
| `Unmark Entrypoint` | Remove entrypoint marking (context menu) |
| `Mark as Important` | Mark function as high-priority (context menu) |
| `Unmark Important` | Remove important marking (context menu) |
| `Hide Function` | Hide a function from the panel (context menu) |
| `Show Hidden Functions` | Restore all hidden functions in a file (context menu) |
| `Refresh` | Re-extract symbols from all files |

## Requirements

- VSCode 1.85.0 or higher
- Trusted workspace (AuditTracker writes tracking files under `.vscode/`)
- Local file system workspace only (no remote/virtual workspaces)
- Single-folder workspace only (multi-root workspaces are not supported)
- Language server for your target language (for symbol extraction)

## Extension Settings

This extension stores state in `.vscode/{repo-name}-audit-tracker.json` within your workspace, where `{repo-name}` is the name of your workspace folder.

Progress reports are generated at `.vscode/{repo-name}-audit-progress.md`.

If you don’t want to commit these files, add them to your repo’s `.gitignore`:

```
.vscode/*-audit-tracker.json
.vscode/*-audit-progress.md
```

## Language Support

Works with any language that provides document symbols via VSCode's Language Server Protocol.

**Important**: Install only **one** language extension per language to avoid duplicate or conflicting symbols.

### Recommended Extensions

| Language | Recommended Extension |
|----------|----------------------|
| Solidity | [Solidity by Ackee Blockchain](https://marketplace.visualstudio.com/items?itemName=AckeeBlockchain.tools-for-solidity) (`AckeeBlockchain.tools-for-solidity`) |
| Rust | rust-analyzer |

## Release Notes

See `CHANGELOG.md`.

## License

MIT
