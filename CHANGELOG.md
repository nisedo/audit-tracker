# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2024-12-14

### Added

- Scope management via Explorer context menu (Add/Remove from Scope)
- Function extraction using VSCode's Document Symbol Provider
- Three-state tracking: unread, read, reviewed
- Entrypoint marking with visual indicators (rocket icon, arrow prefix)
- Auto-load scope from `SCOPE.txt` or `SCOPE.md` files
- Function navigation with 1-second highlight effect
- Line count display for each function
- Per-workspace state persistence in `.vscode/audit-tracker.json`
- File watcher for automatic symbol refresh on file changes
- Solidity-specific cleanup for solidity-visual-auditor metadata
- Deduplication of symbols by line number
