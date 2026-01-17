# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Filter functions in the panel by status and tags (unread/read/reviewed/entrypoint/admin)
- Admin function marking (🔐) for admin/privileged functions that need security-focused review
- Auto-discover source folder (`contracts/`, `src/`, `lib/`, `sources/`) when no SCOPE file exists
- Exclude `interfaces/` folders from scope (tracking interface functions isn't useful)

### Changed

- File description now shows both read and reviewed counts (e.g., "12/23 read · 1/23 reviewed")
- Renamed extension from "AuditTracker" / "audit-tracker" to "Auditracker" / "auditracker"
- State file renamed from `{repo-name}-audit-tracker.json` to `{repo-name}-auditracker.json`
- Replaced "Important" feature with "Admin" feature (more specific to security auditing use case)
- Entrypoint indicator changed from arrow (`→`) to exclamation (`❗️`) for better visibility
- Functions can now be marked as both entrypoint and admin: `❗️ 🔐 onlyOwner()`

### Removed

- "Important" function marking (replaced by "Admin")

### Fixed

- Default state is now created fresh (prevents accidental shared state between sessions)

## [0.4.0] - 2025-12-25

### Added

- Mark functions as "Important" (❗) for high-priority items that need extra auditor attention
  - Right-click → "Mark as Important" / "Unmark Important"
  - Visual indicator: ❗ prefix on function name
  - Functions can be both entrypoints and important: `→ ❗ transfer()`

### Fixed

- Function state (read/reviewed) no longer resets when code is edited and line numbers shift
  - Now matches functions by name (stable) instead of only by ID (includes line number)
  - Preserves user's review progress even when file is modified
- Removing a file from Auditracker now fully removes it from scope (even if it was included via a folder scope)
- Hidden functions no longer count toward progress metrics (panel + progress report)
- Prevented rare state loss by serializing concurrent writes to the workspace state JSON file
- Progress history is normalized on load to handle older state files

### Changed

- Solidity: Function names no longer show contract prefix (e.g., `getTransactionCount()` instead of `MultiSigTimelock.getTransactionCount()`) since the file is already displayed above
- "Mark as Unread" and "Unmark Reviewed" moved from inline buttons to right-click context menu only
- Removed status text (unread/read/reviewed) from function description - icon already shows status
- Activation is now lazy (view/command/workspaceContains) instead of always on startup
- Multi-root workspaces are explicitly unsupported (extension warns and disables itself)
- The extension disables itself when no workspace folder is open

## [0.3.0] - 2025-12-21

### Removed

- Notes feature (codebase notes and line notes) for a cleaner, more focused experience
- Notes panel from the sidebar
- All note-related commands and context menus
- Note gutter icons and hover providers

## [0.2.0] - 2025-12-14

### Added

- Daily progress tracking (automatic, always-on)
- Progress report generation command (`Auditracker: Show Progress Report`)
- Overall progress summary with read/reviewed counts and percentages
- Daily activity summary table with function counts and **line counts** (LOC read/reviewed per day)
- Detailed activity log showing exactly which functions were read/reviewed
- Progress reports saved to `.vscode/{repo-name}-audit-progress.md`
- Hide functions feature: right-click to hide functions from panel (useful for abstract declarations, trivial getters)
- Show Hidden Functions: right-click file to restore all hidden functions
- Hidden function count displayed in file description (e.g., "3/10 reviewed (2 hidden)")

### Changed

- Functions must now be marked as "read" before they can be marked as "reviewed"
- Navigation highlight duration reduced from 800ms to 500ms
- Simplified symbol extraction (requires single language extension per language to avoid conflicts)

## [0.1.0] - 2025-12-14

### Added

- Scope management via Explorer context menu (Add/Remove from Scope)
- File decorations in Explorer (📌 badge for in-scope files)
- Function extraction using VSCode's Document Symbol Provider
- Three-state tracking: unread, read, reviewed
- Entrypoint marking with visual indicators (arrow prefix, "entrypoint" label)
- Auto-load scope from `SCOPE.txt` or `SCOPE.md` files (when no config exists)
- Manual "Load Scope File" command to reload scope anytime
- Function navigation with temporary highlight effect
- Line count display for each function
- Per-workspace state persistence in `.vscode/{repo-name}-auditracker.json`
- File watcher for automatic symbol refresh on file changes
