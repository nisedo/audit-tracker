# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Solidity: Function names no longer show contract prefix (e.g., `getTransactionCount()` instead of `MultiSigTimelock.getTransactionCount()`) since the file is already displayed above
- "Mark as Unread" and "Unmark Reviewed" moved from inline buttons to right-click context menu only

## [0.3.0] - 2025-12-21

### Removed

- Notes feature (codebase notes and line notes) for a cleaner, more focused experience
- Notes panel from the sidebar
- All note-related commands and context menus
- Note gutter icons and hover providers

## [0.2.0] - 2025-12-14

### Added

- Daily progress tracking (automatic, always-on)
- Progress report generation command (`AuditTracker: Show Progress Report`)
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
- Per-workspace state persistence in `.vscode/{repo-name}-audit-tracker.json`
- File watcher for automatic symbol refresh on file changes
