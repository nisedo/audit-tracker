# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2025-12-14

### Added

- Daily progress tracking (automatic, always-on)
- Progress report generation command (`AuditTracker: Show Progress Report`)
- Overall progress summary with read/reviewed counts and percentages
- Daily activity summary table with function counts and **line counts** (LOC read/reviewed per day)
- Detailed activity log showing exactly which functions were read/reviewed and notes added
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
- Codebase notes stored in `.vscode/{repo-name}-audit-tracker-notes.md`
- Line notes with gutter decorations, hover display, and click-to-navigate
- File watcher for automatic symbol refresh on file changes
