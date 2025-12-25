import * as vscode from "vscode";
import * as path from "path";
import { StateManager } from "./services/StateManager";
import { ScopeManager } from "./services/ScopeManager";
import { SymbolExtractor } from "./services/SymbolExtractor";
import {
  AuditTreeProvider,
  FunctionTreeItem,
  FileTreeItem,
} from "./providers/AuditTreeProvider";
import { ScopeDecorationProvider } from "./providers/ScopeDecorationProvider";
import {
  DEFAULT_FUNCTION_FILTERS,
  FunctionFilters,
  FunctionStatus,
  FunctionTag,
  FunctionState,
  DailyProgress,
} from "./models/types";

interface ProgressTotals {
  totalFunctions: number;
  totalRead: number;
  totalReviewed: number;
  totalFiles: number;
  filesFullyRead: number;
  filesFullyReviewed: number;
}

/**
 * Generate markdown progress report
 */
function generateProgressReport(
  repoName: string,
  history: DailyProgress[],
  totals: ProgressTotals
): string {
  const now = new Date();
  const timestamp = now.toLocaleString();

  // Calculate percentages
  const readPct = totals.totalFunctions > 0
    ? ((totals.totalRead / totals.totalFunctions) * 100).toFixed(1)
    : "0.0";
  const reviewedPct = totals.totalFunctions > 0
    ? ((totals.totalReviewed / totals.totalFunctions) * 100).toFixed(1)
    : "0.0";
  const filesReadPct = totals.totalFiles > 0
    ? ((totals.filesFullyRead / totals.totalFiles) * 100).toFixed(1)
    : "0.0";
  const filesReviewedPct = totals.totalFiles > 0
    ? ((totals.filesFullyReviewed / totals.totalFiles) * 100).toFixed(1)
    : "0.0";

  let report = `# Audit Progress Report - ${repoName}\n\n`;
  report += `Generated: ${timestamp}\n\n`;

  // Overall Progress
  report += "## Overall Progress\n\n";
  report += "| Metric | Progress | Percentage |\n";
  report += "|--------|----------|------------|\n";
  report += `| Functions Read | ${totals.totalRead}/${totals.totalFunctions} | ${readPct}% |\n`;
  report += `| Functions Reviewed | ${totals.totalReviewed}/${totals.totalFunctions} | ${reviewedPct}% |\n`;
  report += `| Files Read | ${totals.filesFullyRead}/${totals.totalFiles} | ${filesReadPct}% |\n`;
  report += `| Files Reviewed | ${totals.filesFullyReviewed}/${totals.totalFiles} | ${filesReviewedPct}% |\n\n`;

  // Daily Activity Summary
  if (history.length === 0) {
    report += "## Daily Activity\n\n";
    report += "*No activity recorded yet.*\n";
    return report;
  }

  // Sort history by date descending
  const sortedHistory = [...history].sort((a, b) => b.date.localeCompare(a.date));

  report += "## Daily Activity Summary\n\n";
  report += "| Date | Funcs Read | Lines Read | Funcs Reviewed | Lines Reviewed | Files Read | Files Reviewed |\n";
  report += "|------|------------|------------|----------------|----------------|------------|----------------|\n";

  for (const day of sortedHistory) {
    report += `| ${day.date} | ${day.functionsRead} | ${day.linesRead} | ${day.functionsReviewed} | ${day.linesReviewed} | ${day.filesRead} | ${day.filesReviewed} |\n`;
  }

  report += "\n---\n\n";

  // Detailed Activity Log
  report += "## Detailed Activity Log\n\n";

  for (const day of sortedHistory) {
    if (day.actions.length === 0) {
      continue;
    }

    report += `### ${day.date}\n\n`;

    // Group actions by type
    const functionsRead = day.actions.filter((a) => a.type === "functionRead");
    const functionsReviewed = day.actions.filter((a) => a.type === "functionReviewed");
    const filesRead = day.actions.filter((a) => a.type === "fileRead");
    const filesReviewed = day.actions.filter((a) => a.type === "fileReviewed");

    if (functionsRead.length > 0) {
      report += `**Functions Read (${functionsRead.length}):**\n`;
      for (const action of functionsRead) {
        report += `- \`${action.filePath}\` → \`${action.functionName}\`\n`;
      }
      report += "\n";
    }

    if (functionsReviewed.length > 0) {
      report += `**Functions Reviewed (${functionsReviewed.length}):**\n`;
      for (const action of functionsReviewed) {
        report += `- \`${action.filePath}\` → \`${action.functionName}\`\n`;
      }
      report += "\n";
    }

    if (filesRead.length > 0 || filesReviewed.length > 0) {
      report += "**Files Completed:**\n";
      for (const action of filesRead) {
        report += `- \`${action.filePath}\` (read)\n`;
      }
      for (const action of filesReviewed) {
        report += `- \`${action.filePath}\` (reviewed)\n`;
      }
      report += "\n";
    }
  }

  return report;
}

const NO_WORKSPACE_MESSAGE = "AuditTracker requires an open folder workspace.";

const MULTI_ROOT_UNSUPPORTED_MESSAGE =
  "AuditTracker does not support multi-root workspaces. Open a single folder workspace to use this extension.";

const DISABLED_COMMANDS = [
  "auditTracker.addToScope",
  "auditTracker.removeFromScope",
  "auditTracker.markRead",
  "auditTracker.unmarkRead",
  "auditTracker.markReviewed",
  "auditTracker.unmarkReviewed",
  "auditTracker.filterFunctions",
  "auditTracker.clearFunctionFilter",
  "auditTracker.refresh",
  "auditTracker.goToFunction",
  "auditTracker.clearAllState",
  "auditTracker.loadScopeFile",
  "auditTracker.markEntrypoint",
  "auditTracker.unmarkEntrypoint",
  "auditTracker.markImportant",
  "auditTracker.unmarkImportant",
  "auditTracker.hideFunction",
  "auditTracker.showHiddenFunctions",
  "auditTracker.showProgressReport",
] as const;

interface FilterPickItem extends vscode.QuickPickItem {
  group?: "status" | "tag";
  value?: FunctionStatus | FunctionTag;
}

let treeView: vscode.TreeView<vscode.TreeItem> | undefined;

class DisabledTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  constructor(
    private readonly title: string,
    private readonly descriptionText: string,
    private readonly tooltipText: string
  ) {}

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<vscode.TreeItem[]> {
    const item = new vscode.TreeItem(
      this.title,
      vscode.TreeItemCollapsibleState.None
    );
    item.description = this.descriptionText;
    item.tooltip = this.tooltipText;
    item.iconPath = new vscode.ThemeIcon(
      "warning",
      new vscode.ThemeColor("problemsWarningIcon.foreground")
    );
    return [item];
  }
}

function registerDisabledMode(
  context: vscode.ExtensionContext,
  message: string,
  treeTitle: string,
  treeDescription: string
): void {
  const treeView = vscode.window.createTreeView("auditTracker.scopeView", {
    treeDataProvider: new DisabledTreeProvider(treeTitle, treeDescription, message),
    showCollapseAll: false,
  });

  context.subscriptions.push(
    treeView,
    ...DISABLED_COMMANDS.map((command) =>
      vscode.commands.registerCommand(command, async () => {
        vscode.window.showErrorMessage(message);
      })
    )
  );
}

function isFilterActive(filters: FunctionFilters): boolean {
  const allStatuses = DEFAULT_FUNCTION_FILTERS.statuses;
  const statusesAreDefault =
    filters.statuses.length === allStatuses.length &&
    allStatuses.every((s) => filters.statuses.includes(s));
  return !statusesAreDefault || filters.tags.length > 0;
}

function formatFilterMessage(filters: FunctionFilters): string | undefined {
  if (!isFilterActive(filters)) {
    return undefined;
  }

  const labelForStatus: Record<FunctionStatus, string> = {
    unread: "Unread",
    read: "Read",
    reviewed: "Reviewed",
  };
  const labelForTag: Record<FunctionTag, string> = {
    entrypoint: "Entrypoint",
    important: "Important",
  };

  const parts: string[] = [];

  if (
    filters.statuses.length !== DEFAULT_FUNCTION_FILTERS.statuses.length ||
    !DEFAULT_FUNCTION_FILTERS.statuses.every((s) => filters.statuses.includes(s))
  ) {
    parts.push(`Status: ${filters.statuses.map((s) => labelForStatus[s]).join(", ")}`);
  }

  if (filters.tags.length > 0) {
    parts.push(`Tags: ${filters.tags.map((t) => labelForTag[t]).join(", ")}`);
  }

  return parts.length > 0 ? `Filtered (${parts.join(" · ")})` : undefined;
}

function updateFilterUi(filters: FunctionFilters): void {
  void vscode.commands.executeCommand(
    "setContext",
    "auditTracker.filtersActive",
    isFilterActive(filters)
  );

  if (treeView) {
    treeView.message = formatFilterMessage(filters);
  }
}

function isWithinWorkspace(workspaceRoot: string, filePath: string): boolean {
  const rel = path.relative(workspaceRoot, filePath);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * Load scope from SCOPE.txt or SCOPE.md file if present
 */
async function loadScopeFile(
  workspaceRoot: string,
  scopeManager: ScopeManager,
  stateManager: StateManager
): Promise<number> {
  const scopeFiles = ["SCOPE.txt", "SCOPE.md"];
  let scopeContent: string | undefined;

  for (const filename of scopeFiles) {
    const scopeUri = vscode.Uri.file(path.join(workspaceRoot, filename));
    try {
      const content = await vscode.workspace.fs.readFile(scopeUri);
      scopeContent = content.toString();
      break;
    } catch {
      // File doesn't exist, try next
    }
  }

  if (!scopeContent) {
    return 0;
  }

  // Parse the scope file - each line is a file/folder path
  const lines = scopeContent.split("\n");
  let addedFiles = 0;

  for (const line of lines) {
    // Clean the line and skip empty/comment lines
    let trimmed = line.trim();
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      trimmed = trimmed.slice(2).trim();
    }
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) {
      continue;
    }

    const filePath = path.resolve(workspaceRoot, trimmed);
    if (!isWithinWorkspace(workspaceRoot, filePath)) {
      continue;
    }

    try {
      const uri = vscode.Uri.file(filePath);
      const files = await scopeManager.addToScope(uri);
      addedFiles += files.length;
    } catch {
      // Skip invalid paths
    }
  }

  if (addedFiles > 0) {
    await stateManager.save();
  }

  return addedFiles;
}

let stateManager: StateManager;
let scopeManager: ScopeManager;
let symbolExtractor: SymbolExtractor;
let treeProvider: AuditTreeProvider;
let decorationProvider: ScopeDecorationProvider;

export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  const workspaceFolderCount = vscode.workspace.workspaceFolders?.length ?? 0;
  if (workspaceFolderCount === 0) {
    vscode.window.showWarningMessage(NO_WORKSPACE_MESSAGE);
    registerDisabledMode(
      context,
      NO_WORKSPACE_MESSAGE,
      "Open a folder to use AuditTracker",
      "No workspace folder open"
    );
    return;
  }

  if (workspaceFolderCount > 1) {
    vscode.window.showWarningMessage(MULTI_ROOT_UNSUPPORTED_MESSAGE);
    registerDisabledMode(
      context,
      MULTI_ROOT_UNSUPPORTED_MESSAGE,
      "Multi-root workspaces are not supported",
      "Open a single folder workspace"
    );
    return;
  }

  const workspaceRoot = vscode.workspace.workspaceFolders![0].uri.fsPath;

  // Initialize services
  stateManager = new StateManager(workspaceRoot);
  await stateManager.load();

  symbolExtractor = new SymbolExtractor();
  scopeManager = new ScopeManager(stateManager, symbolExtractor, workspaceRoot);
  treeProvider = new AuditTreeProvider(stateManager);
  decorationProvider = new ScopeDecorationProvider(stateManager);

  // Register file decoration provider
  context.subscriptions.push(
    vscode.window.registerFileDecorationProvider(decorationProvider)
  );

  // Load scope from SCOPE.txt or SCOPE.md if present and state is empty
  if (stateManager.getScopePaths().length === 0) {
    const addedFiles = await loadScopeFile(
      workspaceRoot,
      scopeManager,
      stateManager
    );
    if (addedFiles > 0) {
      treeProvider.refresh();
      decorationProvider.refresh();
    }
  }

  // Register tree view
  const auditTreeView = vscode.window.createTreeView("auditTracker.scopeView", {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });
  treeView = auditTreeView;
  updateFilterUi(stateManager.getFunctionFilters());

  // Register commands
  context.subscriptions.push(
    // Add to scope
    vscode.commands.registerCommand(
      "auditTracker.addToScope",
      async (uri?: vscode.Uri) => {
        // Use active editor's file if no URI provided (e.g., from command palette)
        if (!uri) {
          const activeEditor = vscode.window.activeTextEditor;
          if (activeEditor) {
            uri = activeEditor.document.uri;
          } else {
            vscode.window.showErrorMessage("No file or folder selected");
            return;
          }
        }

        if (uri.scheme !== "file") {
          vscode.window.showErrorMessage("Only local files and folders are supported");
          return;
        }

        if (!isWithinWorkspace(workspaceRoot, uri.fsPath)) {
          vscode.window.showErrorMessage("Path must be inside the workspace folder");
          return;
        }

        const files = await scopeManager.addToScope(uri);
        await stateManager.save();
        treeProvider.refresh();
        decorationProvider.refresh([uri, ...files.map((f) => vscode.Uri.file(f))]);

        const functionCount = stateManager
          .getAllFiles()
          .reduce((sum, f) => sum + f.functions.length, 0);
        vscode.window.showInformationMessage(
          `Added ${files.length} file(s) to scope (${functionCount} functions)`
        );
      }
    ),

    // Remove from scope (from explorer context menu)
    vscode.commands.registerCommand(
      "auditTracker.removeFromScope",
      async (uriOrItem: vscode.Uri | FileTreeItem) => {
        let uri: vscode.Uri;
        let decorationUris: vscode.Uri[] = [];

        if (uriOrItem instanceof FileTreeItem) {
          const filePath = uriOrItem.scopedFile.filePath;
          uri = vscode.Uri.file(filePath);

          // Remove file from tracking even if it was included via a folder scope
          if (stateManager.getScopePaths().includes(filePath)) {
            stateManager.removeScopePath(filePath);
          }
          stateManager.addExcludedPath(filePath);
          stateManager.removeFile(filePath);
          decorationUris = [uri];
        } else if (uriOrItem) {
          uri = uriOrItem;

          if (uri.scheme !== "file") {
            vscode.window.showErrorMessage("Only local files and folders are supported");
            return;
          }

          if (!isWithinWorkspace(workspaceRoot, uri.fsPath)) {
            vscode.window.showErrorMessage("Path must be inside the workspace folder");
            return;
          }

          let stat: vscode.FileStat;
          try {
            stat = await vscode.workspace.fs.stat(uri);
          } catch {
            vscode.window.showErrorMessage("Selected path does not exist");
            return;
          }

          if (stat.type === vscode.FileType.File) {
            const filePath = uri.fsPath;
            if (stateManager.getScopePaths().includes(filePath)) {
              stateManager.removeScopePath(filePath);
            }
            stateManager.addExcludedPath(filePath);
            stateManager.removeFile(filePath);
            decorationUris = [uri];
          } else if (stat.type === vscode.FileType.Directory) {
            const folderPath = uri.fsPath;
            const trackedInFolder = stateManager
              .getAllFiles()
              .filter(
                (f) =>
                  f.filePath === folderPath ||
                  f.filePath.startsWith(folderPath + path.sep)
              )
              .map((f) => vscode.Uri.file(f.filePath));
            decorationUris = [uri, ...trackedInFolder];
            await scopeManager.removeFromScope(uri);
          } else {
            vscode.window.showErrorMessage("Unsupported file type");
            return;
          }
        } else {
          vscode.window.showErrorMessage("No file or folder selected");
          return;
        }

        await stateManager.save();
        treeProvider.refresh();
        decorationProvider.refresh(decorationUris.length > 0 ? decorationUris : [uri]);
        vscode.window.showInformationMessage("Removed from scope");
      }
    ),

    // Mark as read
    vscode.commands.registerCommand(
      "auditTracker.markRead",
      async (item: FunctionTreeItem) => {
        if (!item?.functionState) {
          return;
        }

        const func = item.functionState;
        const wasAlreadyRead = func.readCount > 0;

        stateManager.setRead(func.id, true);

        // Record progress if this is a new read
        if (!wasAlreadyRead) {
          const file = stateManager.getFile(func.filePath);
          const relativePath = file?.relativePath || path.basename(func.filePath);
          const lineCount = func.endLine - func.startLine + 1;
          stateManager.recordFunctionRead(relativePath, func.name, lineCount);

          // Check if file is now fully read
          if (file) {
            const visibleFunctions = file.functions.filter((f) => !f.isHidden);
            const allRead =
              visibleFunctions.length > 0 &&
              visibleFunctions.every((f) => f.readCount > 0);
            if (allRead) {
              stateManager.recordFileRead(relativePath);
            }
          }
        }

        await stateManager.save();
        treeProvider.refresh();
      }
    ),

    // Unmark read
    vscode.commands.registerCommand(
      "auditTracker.unmarkRead",
      async (item: FunctionTreeItem) => {
        if (!item?.functionState) {
          return;
        }

        stateManager.setRead(item.functionState.id, false);
        await stateManager.save();
        treeProvider.refresh();
      }
    ),

    // Mark as reviewed
    vscode.commands.registerCommand(
      "auditTracker.markReviewed",
      async (item: FunctionTreeItem) => {
        if (!item?.functionState) {
          return;
        }

        const func = item.functionState;

        // Can't review a function that hasn't been read
        if (func.readCount === 0) {
          vscode.window.showWarningMessage("Function must be read before it can be reviewed");
          return;
        }

        const wasAlreadyReviewed = func.isReviewed;

        stateManager.setReviewed(func.id, true);

        // Record progress if this is a new review
        if (!wasAlreadyReviewed) {
          const file = stateManager.getFile(func.filePath);
          const relativePath = file?.relativePath || path.basename(func.filePath);
          const lineCount = func.endLine - func.startLine + 1;
          stateManager.recordFunctionReviewed(relativePath, func.name, lineCount);

          // Check if file is now fully reviewed
          if (file) {
            const visibleFunctions = file.functions.filter((f) => !f.isHidden);
            const allReviewed =
              visibleFunctions.length > 0 &&
              visibleFunctions.every((f) => f.isReviewed);
            if (allReviewed) {
              stateManager.recordFileReviewed(relativePath);
            }
          }
        }

        await stateManager.save();
        treeProvider.refresh();
      }
    ),

    // Unmark reviewed
    vscode.commands.registerCommand(
      "auditTracker.unmarkReviewed",
      async (item: FunctionTreeItem) => {
        if (!item?.functionState) {
          return;
        }

        stateManager.setReviewed(item.functionState.id, false);
        await stateManager.save();
        treeProvider.refresh();
      }
    ),

    // Mark as entrypoint
    vscode.commands.registerCommand(
      "auditTracker.markEntrypoint",
      async (item: FunctionTreeItem) => {
        if (!item?.functionState) {
          return;
        }

        stateManager.setEntrypoint(item.functionState.id, true);
        await stateManager.save();
        treeProvider.refresh();
      }
    ),

    // Unmark entrypoint
    vscode.commands.registerCommand(
      "auditTracker.unmarkEntrypoint",
      async (item: FunctionTreeItem) => {
        if (!item?.functionState) {
          return;
        }

        stateManager.setEntrypoint(item.functionState.id, false);
        await stateManager.save();
        treeProvider.refresh();
      }
    ),

    // Mark as important
    vscode.commands.registerCommand(
      "auditTracker.markImportant",
      async (item: FunctionTreeItem) => {
        if (!item?.functionState) {
          return;
        }

        stateManager.setImportant(item.functionState.id, true);
        await stateManager.save();
        treeProvider.refresh();
      }
    ),

    // Unmark important
    vscode.commands.registerCommand(
      "auditTracker.unmarkImportant",
      async (item: FunctionTreeItem) => {
        if (!item?.functionState) {
          return;
        }

        stateManager.setImportant(item.functionState.id, false);
        await stateManager.save();
        treeProvider.refresh();
      }
    ),

    // Hide function
    vscode.commands.registerCommand(
      "auditTracker.hideFunction",
      async (item: FunctionTreeItem) => {
        if (!item?.functionState) {
          return;
        }

        stateManager.setHidden(item.functionState.id, true);
        await stateManager.save();
        treeProvider.refresh();
      }
    ),

    // Show hidden functions (unhide all in file)
    vscode.commands.registerCommand(
      "auditTracker.showHiddenFunctions",
      async (item: FileTreeItem) => {
        if (!item?.scopedFile) {
          return;
        }

        for (const func of item.scopedFile.functions) {
          if (func.isHidden) {
            stateManager.setHidden(func.id, false);
          }
        }
        await stateManager.save();
        treeProvider.refresh();
      }
    ),

    // Refresh view
    vscode.commands.registerCommand("auditTracker.refresh", async () => {
      await scopeManager.refreshAllSymbols();
      await stateManager.save();
      treeProvider.refresh();
    }),

    // Filter functions shown in the panel
    vscode.commands.registerCommand("auditTracker.filterFunctions", async () => {
      const currentFilters = stateManager.getFunctionFilters();

      const picks: FilterPickItem[] = [
        { label: "Status", kind: vscode.QuickPickItemKind.Separator },
        {
          label: "Unread",
          group: "status",
          value: "unread",
          picked: currentFilters.statuses.includes("unread"),
        },
        {
          label: "Read",
          group: "status",
          value: "read",
          picked: currentFilters.statuses.includes("read"),
        },
        {
          label: "Reviewed",
          group: "status",
          value: "reviewed",
          picked: currentFilters.statuses.includes("reviewed"),
        },
        { label: "Tags", kind: vscode.QuickPickItemKind.Separator },
        {
          label: "Entrypoint",
          group: "tag",
          value: "entrypoint",
          picked: currentFilters.tags.includes("entrypoint"),
        },
        {
          label: "Important",
          group: "tag",
          value: "important",
          picked: currentFilters.tags.includes("important"),
        },
      ];

      const selected = await vscode.window.showQuickPick(picks, {
        canPickMany: true,
        title: "AuditTracker: Filter Functions",
        placeHolder: "Select which functions to show in the panel",
        ignoreFocusOut: true,
      });

      if (!selected) {
        return;
      }

      const statuses = selected
        .filter((item): item is FilterPickItem => item.group === "status")
        .map((item) => item.value as FunctionStatus);

      const tags = selected
        .filter((item): item is FilterPickItem => item.group === "tag")
        .map((item) => item.value as FunctionTag);

      stateManager.setFunctionFilters({
        statuses: statuses.length > 0 ? statuses : [...DEFAULT_FUNCTION_FILTERS.statuses],
        tags,
      });
      await stateManager.save();
      updateFilterUi(stateManager.getFunctionFilters());
      treeProvider.refresh();
    }),

    // Clear function filters
    vscode.commands.registerCommand(
      "auditTracker.clearFunctionFilter",
      async () => {
        stateManager.clearFunctionFilters();
        await stateManager.save();
        updateFilterUi(stateManager.getFunctionFilters());
        treeProvider.refresh();
      }
    ),

    // Load scope from SCOPE.txt or SCOPE.md file
    vscode.commands.registerCommand("auditTracker.loadScopeFile", async () => {
      const addedFiles = await loadScopeFile(
        workspaceRoot,
        scopeManager,
        stateManager
      );
      if (addedFiles > 0) {
        treeProvider.refresh();
        decorationProvider.refresh();
        vscode.window.showInformationMessage(
          `Loaded ${addedFiles} file(s) from SCOPE file`
        );
      } else {
        vscode.window.showWarningMessage(
          "No SCOPE.txt or SCOPE.md file found, or no new files to add"
        );
      }
    }),

    // Go to function
    vscode.commands.registerCommand(
      "auditTracker.goToFunction",
      async (func: FunctionState) => {
        if (!func) {
          return;
        }

        const uri = vscode.Uri.file(func.filePath);
        const document = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(document);

        const position = new vscode.Position(func.startLine, 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(
          new vscode.Range(position, position),
          vscode.TextEditorRevealType.InCenter
        );

        // Temporarily highlight the function
        const highlightDecoration =
          vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor(
              "editor.findMatchHighlightBackground"
            ),
            isWholeLine: true,
          });
        const range = new vscode.Range(func.startLine, 0, func.endLine, 0);
        editor.setDecorations(highlightDecoration, [range]);

        // Remove highlight after 500ms
        setTimeout(() => {
          highlightDecoration.dispose();
        }, 500);
      }
    ),

    // Clear all state
    vscode.commands.registerCommand("auditTracker.clearAllState", async () => {
      // Get all files before clearing to refresh their decorations
      const allFiles = stateManager
        .getAllFiles()
        .map((f) => vscode.Uri.file(f.filePath));

      const confirm = await vscode.window.showWarningMessage(
        "Clear all audit tracking state? This cannot be undone.",
        { modal: true },
        "Yes, Clear All"
      );

      if (confirm === "Yes, Clear All") {
        stateManager.clearAllState();
        await stateManager.save();
        updateFilterUi(stateManager.getFunctionFilters());
        treeProvider.refresh();
        decorationProvider.refresh(allFiles);
        vscode.window.showInformationMessage("AuditTracker state cleared");
      }
    }),

    // Show progress report
    vscode.commands.registerCommand(
      "auditTracker.showProgressReport",
      async () => {
        if (!workspaceRoot) {
          vscode.window.showErrorMessage("No workspace folder open");
          return;
        }

        const repoName = path.basename(workspaceRoot);
        const history = stateManager.getProgressHistory();
        const allFiles = stateManager.getAllFiles();

        // Calculate current totals
        const filesWithVisibleFunctions = allFiles
          .map((f) => ({
            file: f,
            visibleFunctions: f.functions.filter((fn) => !fn.isHidden),
          }))
          .filter((f) => f.visibleFunctions.length > 0);

        const visibleFunctions = filesWithVisibleFunctions.flatMap(
          (f) => f.visibleFunctions
        );

        const totalFunctions = visibleFunctions.length;
        const totalRead = visibleFunctions.filter((f) => f.readCount > 0).length;
        const totalReviewed = visibleFunctions.filter((f) => f.isReviewed).length;
        const totalFiles = filesWithVisibleFunctions.length;
        const filesFullyRead = filesWithVisibleFunctions.filter((f) =>
          f.visibleFunctions.every((fn) => fn.readCount > 0)
        ).length;
        const filesFullyReviewed = filesWithVisibleFunctions.filter((f) =>
          f.visibleFunctions.every((fn) => fn.isReviewed)
        ).length;

        // Generate report
        const report = generateProgressReport(
          repoName,
          history,
          {
            totalFunctions,
            totalRead,
            totalReviewed,
            totalFiles,
            filesFullyRead,
            filesFullyReviewed,
          }
        );

        // Write to file and open
        const reportFileName = `${repoName}-audit-progress.md`;
        const reportPath = path.join(workspaceRoot, ".vscode", reportFileName);
        const reportUri = vscode.Uri.file(reportPath);

        // Ensure .vscode directory exists
        const vscodeDir = vscode.Uri.file(path.join(workspaceRoot, ".vscode"));
        try {
          await vscode.workspace.fs.createDirectory(vscodeDir);
        } catch {
          // Directory may already exist
        }

        await vscode.workspace.fs.writeFile(reportUri, Buffer.from(report));
        const doc = await vscode.workspace.openTextDocument(reportUri);
        await vscode.window.showTextDocument(doc);
      }
    ),

    auditTreeView
  );

  // Watch for file changes to update symbols
  const fileWatcher = vscode.workspace.createFileSystemWatcher("**/*", true);

  fileWatcher.onDidChange(async (uri) => {
    if (scopeManager.isInScope(uri.fsPath)) {
      await scopeManager.refreshFileSymbols(uri.fsPath);
      await stateManager.save();
      treeProvider.refresh();
    }
  });

  fileWatcher.onDidDelete(async (uri) => {
    if (scopeManager.isInScope(uri.fsPath)) {
      stateManager.removeFile(uri.fsPath);
      await stateManager.save();
      treeProvider.refresh();
    }
  });

  context.subscriptions.push(fileWatcher);
}

export function deactivate(): void {
  // Cleanup if needed
}
