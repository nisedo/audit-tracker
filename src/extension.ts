import * as vscode from "vscode";
import * as path from "path";
import { StateManager } from "./services/StateManager";
import { ScopeManager } from "./services/ScopeManager";
import { SymbolExtractor } from "./services/SymbolExtractor";
import {
  ActiveFileTreeProvider,
  FunctionTreeItem,
} from "./providers/ActiveFileTreeProvider";
import {
  FilesTreeProvider,
  FileListItem,
} from "./providers/FilesTreeProvider";
import type { FunctionState, DailyProgress } from "./models/types";

interface ProgressTotals {
  totalFunctions: number;
  totalAudited: number;
  totalFiles: number;
  filesFullyAudited: number;
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

  const auditedPct = totals.totalFunctions > 0
    ? ((totals.totalAudited / totals.totalFunctions) * 100).toFixed(1)
    : "0.0";
  const filesAuditedPct = totals.totalFiles > 0
    ? ((totals.filesFullyAudited / totals.totalFiles) * 100).toFixed(1)
    : "0.0";

  let report = `# Audit Progress Report - ${repoName}\n\n`;
  report += `Generated: ${timestamp}\n\n`;

  report += "## Overall Progress\n\n";
  report += "| Metric | Progress | Percentage |\n";
  report += "|--------|----------|------------|\n";
  report += `| Functions Audited | ${totals.totalAudited}/${totals.totalFunctions} | ${auditedPct}% |\n`;
  report += `| Files Audited | ${totals.filesFullyAudited}/${totals.totalFiles} | ${filesAuditedPct}% |\n\n`;

  if (history.length === 0) {
    report += "## Daily Activity\n\n";
    report += "*No activity recorded yet.*\n";
    return report;
  }

  const sortedHistory = [...history].sort((a, b) => b.date.localeCompare(a.date));

  report += "## Daily Activity Summary\n\n";
  report += "| Date | Funcs Audited | Lines Audited | Files Audited |\n";
  report += "|------|---------------|---------------|---------------|\n";

  for (const day of sortedHistory) {
    report += `| ${day.date} | ${day.functionsAudited} | ${day.linesAudited} | ${day.filesAudited} |\n`;
  }

  report += "\n---\n\n";
  report += "## Detailed Activity Log\n\n";

  for (const day of sortedHistory) {
    if (day.actions.length === 0) {
      continue;
    }

    report += `### ${day.date}\n\n`;

    const functionsAudited = day.actions.filter((a) => a.type === "functionAudited");
    const filesAudited = day.actions.filter((a) => a.type === "fileAudited");

    if (functionsAudited.length > 0) {
      report += `**Functions Audited (${functionsAudited.length}):**\n`;
      for (const action of functionsAudited) {
        report += `- \`${action.filePath}\` → \`${action.functionName}\`\n`;
      }
      report += "\n";
    }

    if (filesAudited.length > 0) {
      report += "**Files Completed:**\n";
      for (const action of filesAudited) {
        report += `- \`${action.filePath}\`\n`;
      }
      report += "\n";
    }
  }

  return report;
}

const NO_WORKSPACE_MESSAGE = "Auditracker requires an open folder workspace.";

const MULTI_ROOT_UNSUPPORTED_MESSAGE =
  "Auditracker does not support multi-root workspaces. Open a single folder workspace to use this extension.";

const DISABLED_COMMANDS = [
  "auditracker.addToScope",
  "auditracker.removeFromScope",
  "auditracker.markAudited",
  "auditracker.unmarkAudited",
  "auditracker.refresh",
  "auditracker.goToFunction",
  "auditracker.clearAllState",
  "auditracker.loadScopeFile",
  "auditracker.hideFunction",
  "auditracker.showHiddenFunctions",
  "auditracker.showProgressReport",
  "auditracker.selectFile",
] as const;

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
  const disabledProvider = new DisabledTreeProvider(treeTitle, treeDescription, message);

  const activeFileView = vscode.window.createTreeView("auditracker.activeFileView", {
    treeDataProvider: disabledProvider,
    showCollapseAll: false,
  });

  const filesView = vscode.window.createTreeView("auditracker.filesView", {
    treeDataProvider: disabledProvider,
    showCollapseAll: false,
  });

  context.subscriptions.push(
    activeFileView,
    filesView,
    ...DISABLED_COMMANDS.map((command) =>
      vscode.commands.registerCommand(command, async () => {
        vscode.window.showErrorMessage(message);
      })
    )
  );
}

function isWithinWorkspace(workspaceRoot: string, filePath: string): boolean {
  const rel = path.relative(workspaceRoot, filePath);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

const SOURCE_FOLDER_CANDIDATES = [
  "contracts",
  "src",
  "lib",
  "sources",
];

async function autoDiscoverSourceFolder(
  workspaceRoot: string,
  scopeManager: ScopeManager,
  stateManager: StateManager
): Promise<number> {
  for (const folderName of SOURCE_FOLDER_CANDIDATES) {
    const folderPath = path.join(workspaceRoot, folderName);
    const folderUri = vscode.Uri.file(folderPath);

    try {
      const stat = await vscode.workspace.fs.stat(folderUri);
      if (stat.type === vscode.FileType.Directory) {
        const files = await scopeManager.addToScope(folderUri);
        if (files.length > 0) {
          await stateManager.save();
          return files.length;
        }
      }
    } catch {
      // Folder doesn't exist, try next
    }
  }

  return 0;
}

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

  const lines = scopeContent.split("\n");
  let addedFiles = 0;

  for (const line of lines) {
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
let activeFileProvider: ActiveFileTreeProvider;
let filesProvider: FilesTreeProvider;

function refreshAll(): void {
  activeFileProvider.refresh();
  filesProvider.refresh();
}

export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  const workspaceFolderCount = vscode.workspace.workspaceFolders?.length ?? 0;
  if (workspaceFolderCount === 0) {
    vscode.window.showWarningMessage(NO_WORKSPACE_MESSAGE);
    registerDisabledMode(
      context,
      NO_WORKSPACE_MESSAGE,
      "Open a folder to use Auditracker",
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
  activeFileProvider = new ActiveFileTreeProvider(stateManager);
  filesProvider = new FilesTreeProvider(stateManager);

  // Load scope from SCOPE.txt or SCOPE.md if present and state is empty
  if (stateManager.getScopePaths().length === 0) {
    let addedFiles = await loadScopeFile(
      workspaceRoot,
      scopeManager,
      stateManager
    );

    if (addedFiles === 0) {
      addedFiles = await autoDiscoverSourceFolder(
        workspaceRoot,
        scopeManager,
        stateManager
      );
    }

    if (addedFiles > 0) {
      refreshAll();
    }
  }

  // Register tree views
  const activeFileView = vscode.window.createTreeView("auditracker.activeFileView", {
    treeDataProvider: activeFileProvider,
    showCollapseAll: false,
  });

  const filesView = vscode.window.createTreeView("auditracker.filesView", {
    treeDataProvider: filesProvider,
    showCollapseAll: false,
  });

  function selectActiveFile(filePath: string | null): void {
    activeFileProvider.setActiveFile(filePath);
    stateManager.setActiveFilePath(filePath);
    if (filePath) {
      const fileName = filePath.split("/").pop() || filePath;
      activeFileView.description = fileName;
    } else {
      activeFileView.description = undefined;
    }
  }

  // Restore previously active file
  const savedActiveFile = stateManager.getActiveFilePath();
  if (savedActiveFile && stateManager.getFile(savedActiveFile)) {
    selectActiveFile(savedActiveFile);
  }

  // Register commands
  context.subscriptions.push(
    // Select file (click in files panel)
    vscode.commands.registerCommand(
      "auditracker.selectFile",
      async (filePath: string) => {
        if (!filePath) {
          return;
        }

        selectActiveFile(filePath);

        const uri = vscode.Uri.file(filePath);
        const document = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(document);
      }
    ),

    // Add to scope
    vscode.commands.registerCommand(
      "auditracker.addToScope",
      async (uri?: vscode.Uri) => {
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
        refreshAll();

        const functionCount = stateManager
          .getAllFiles()
          .reduce((sum, f) => sum + f.functions.length, 0);
        vscode.window.showInformationMessage(
          `Added ${files.length} file(s) to scope (${functionCount} functions)`
        );
      }
    ),

    // Remove from scope
    vscode.commands.registerCommand(
      "auditracker.removeFromScope",
      async (uriOrItem: vscode.Uri | FileListItem) => {
        let uri: vscode.Uri;

        if (uriOrItem instanceof FileListItem) {
          const filePath = uriOrItem.scopedFile.filePath;
          uri = vscode.Uri.file(filePath);

          if (stateManager.getScopePaths().includes(filePath)) {
            stateManager.removeScopePath(filePath);
          }
          stateManager.addExcludedPath(filePath);
          stateManager.removeFile(filePath);

          // Reset active file if it was the removed one
          if (activeFileProvider.getActiveFilePath() === filePath) {
            selectActiveFile(null);
          }
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

            if (activeFileProvider.getActiveFilePath() === filePath) {
              selectActiveFile(null);
            }
          } else if (stat.type === vscode.FileType.Directory) {
            // Reset active file if it was inside the removed folder
            const activeFile = activeFileProvider.getActiveFilePath();
            if (activeFile && activeFile.startsWith(uri.fsPath + path.sep)) {
              selectActiveFile(null);
            }
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
        refreshAll();
        vscode.window.showInformationMessage("Removed from scope");
      }
    ),

    // Mark as audited
    vscode.commands.registerCommand(
      "auditracker.markAudited",
      async (item: FunctionTreeItem) => {
        if (!item?.functionState) {
          return;
        }

        const func = item.functionState;
        const wasAlreadyAudited = func.isAudited;

        stateManager.setAudited(func.id, true);

        if (!wasAlreadyAudited) {
          const file = stateManager.getFile(func.filePath);
          const relativePath = file?.relativePath || path.basename(func.filePath);
          const lineCount = func.endLine - func.startLine + 1;
          stateManager.recordFunctionAudited(relativePath, func.name, lineCount);

          if (file) {
            const visibleFunctions = file.functions.filter((f) => !f.isHidden);
            const allAudited =
              visibleFunctions.length > 0 &&
              visibleFunctions.every((f) => f.isAudited);
            if (allAudited) {
              stateManager.recordFileAudited(relativePath);
            }
          }
        }

        await stateManager.save();
        refreshAll();
      }
    ),

    // Unmark audited
    vscode.commands.registerCommand(
      "auditracker.unmarkAudited",
      async (item: FunctionTreeItem) => {
        if (!item?.functionState) {
          return;
        }

        stateManager.setAudited(item.functionState.id, false);
        await stateManager.save();
        refreshAll();
      }
    ),

    // Hide function
    vscode.commands.registerCommand(
      "auditracker.hideFunction",
      async (item: FunctionTreeItem) => {
        if (!item?.functionState) {
          return;
        }

        stateManager.setHidden(item.functionState.id, true);
        await stateManager.save();
        refreshAll();
      }
    ),

    // Show hidden functions (unhide all in file)
    vscode.commands.registerCommand(
      "auditracker.showHiddenFunctions",
      async (item: FileListItem) => {
        if (!item?.scopedFile) {
          return;
        }

        for (const func of item.scopedFile.functions) {
          if (func.isHidden) {
            stateManager.setHidden(func.id, false);
          }
        }
        await stateManager.save();
        refreshAll();
      }
    ),

    // Refresh view
    vscode.commands.registerCommand("auditracker.refresh", async () => {
      await scopeManager.refreshAllSymbols();
      await stateManager.save();
      refreshAll();
    }),

    // Load scope from SCOPE.txt or SCOPE.md file
    vscode.commands.registerCommand("auditracker.loadScopeFile", async () => {
      const addedFiles = await loadScopeFile(
        workspaceRoot,
        scopeManager,
        stateManager
      );
      if (addedFiles > 0) {
        refreshAll();
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
      "auditracker.goToFunction",
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

        const highlightDecoration =
          vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor(
              "editor.findMatchHighlightBackground"
            ),
            isWholeLine: true,
          });
        const range = new vscode.Range(func.startLine, 0, func.endLine, 0);
        editor.setDecorations(highlightDecoration, [range]);

        setTimeout(() => {
          highlightDecoration.dispose();
        }, 500);
      }
    ),

    // Clear all state
    vscode.commands.registerCommand("auditracker.clearAllState", async () => {
      const confirm = await vscode.window.showWarningMessage(
        "Clear all audit tracking state? This cannot be undone.",
        { modal: true },
        "Yes, Clear All"
      );

      if (confirm === "Yes, Clear All") {
        stateManager.clearAllState();
        selectActiveFile(null);
        await stateManager.save();
        refreshAll();
        vscode.window.showInformationMessage("Auditracker state cleared");
      }
    }),

    // Show progress report
    vscode.commands.registerCommand(
      "auditracker.showProgressReport",
      async () => {
        const repoName = path.basename(workspaceRoot);
        const history = stateManager.getProgressHistory();
        const allFiles = stateManager.getAllFiles();

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
        const totalAudited = visibleFunctions.filter((f) => f.isAudited).length;
        const totalFiles = filesWithVisibleFunctions.length;
        const filesFullyAudited = filesWithVisibleFunctions.filter((f) =>
          f.visibleFunctions.every((fn) => fn.isAudited)
        ).length;

        const report = generateProgressReport(
          repoName,
          history,
          {
            totalFunctions,
            totalAudited,
            totalFiles,
            filesFullyAudited,
          }
        );

        const reportFileName = `${repoName}-audit-progress.md`;
        const reportPath = path.join(workspaceRoot, ".vscode", reportFileName);
        const reportUri = vscode.Uri.file(reportPath);

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

    activeFileView,
    filesView
  );

  // Watch for file changes to update symbols
  const fileWatcher = vscode.workspace.createFileSystemWatcher("**/*", true);

  fileWatcher.onDidChange(async (uri) => {
    if (scopeManager.isInScope(uri.fsPath)) {
      await scopeManager.refreshFileSymbols(uri.fsPath);
      await stateManager.save();
      refreshAll();
    }
  });

  fileWatcher.onDidDelete(async (uri) => {
    if (scopeManager.isInScope(uri.fsPath)) {
      stateManager.removeFile(uri.fsPath);
      if (activeFileProvider.getActiveFilePath() === uri.fsPath) {
        selectActiveFile(null);
      }
      await stateManager.save();
      refreshAll();
    }
  });

  context.subscriptions.push(fileWatcher);
}

export function deactivate(): void {
  // Cleanup if needed
}
