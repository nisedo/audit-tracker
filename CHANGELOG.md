# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2024-12-14

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
- Codebase notes stored in `.vscode/{repo-name}-audittracker-notes.md`
- Line notes with gutter decorations, hover display, and click-to-navigate
- File watcher for automatic symbol refresh on file changes
- Solidity-specific cleanup for solidity-visual-auditor metadata
- Deduplication of symbols by line number
