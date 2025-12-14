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
import { FunctionState } from "./models/types";

/**
 * Load scope from SCOPE.txt or SCOPE.md file if present
 */
async function loadScopeFile(
  workspaceRoot: string | undefined,
  scopeManager: ScopeManager,
  stateManager: StateManager
): Promise<number> {
  if (!workspaceRoot) {
    return 0;
  }

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
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) {
      continue;
    }

    // Resolve relative path to absolute
    const filePath = path.isAbsolute(trimmed)
      ? trimmed
      : path.join(workspaceRoot, trimmed);

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

export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  // Initialize services
  stateManager = new StateManager(workspaceRoot);
  await stateManager.load();

  symbolExtractor = new SymbolExtractor();
  scopeManager = new ScopeManager(stateManager, symbolExtractor, workspaceRoot);
  treeProvider = new AuditTreeProvider(stateManager);

  // Load scope from SCOPE.txt or SCOPE.md if present and state is empty
  if (stateManager.getScopePaths().length === 0) {
    const addedFiles = await loadScopeFile(workspaceRoot, scopeManager, stateManager);
    if (addedFiles > 0) {
      treeProvider.refresh();
    }
  }

  // Register tree view
  const treeView = vscode.window.createTreeView("auditTracker.scopeView", {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });

  // Register commands
  context.subscriptions.push(
    // Add to scope
    vscode.commands.registerCommand(
      "auditTracker.addToScope",
      async (uri: vscode.Uri) => {
        if (!uri) {
          vscode.window.showErrorMessage("No file or folder selected");
          return;
        }

        const files = await scopeManager.addToScope(uri);
        await stateManager.save();
        treeProvider.refresh();

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

        if (uriOrItem instanceof FileTreeItem) {
          uri = vscode.Uri.file(uriOrItem.scopedFile.filePath);
          // Remove just this file from state
          stateManager.removeFile(uriOrItem.scopedFile.filePath);
        } else if (uriOrItem) {
          uri = uriOrItem;
          await scopeManager.removeFromScope(uri);
        } else {
          vscode.window.showErrorMessage("No file or folder selected");
          return;
        }

        await stateManager.save();
        treeProvider.refresh();
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

        stateManager.setRead(item.functionState.id, true);
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

        stateManager.setReviewed(item.functionState.id, true);
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

    // Refresh view
    vscode.commands.registerCommand("auditTracker.refresh", async () => {
      await scopeManager.refreshAllSymbols();
      await stateManager.save();
      treeProvider.refresh();
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
        const highlightDecoration = vscode.window.createTextEditorDecorationType({
          backgroundColor: new vscode.ThemeColor("editor.findMatchHighlightBackground"),
          isWholeLine: true,
        });
        const range = new vscode.Range(func.startLine, 0, func.endLine, 0);
        editor.setDecorations(highlightDecoration, [range]);

        // Remove highlight after 1 second
        setTimeout(() => {
          highlightDecoration.dispose();
        }, 1000);
      }
    ),

    // Clear all state
    vscode.commands.registerCommand("auditTracker.clearAllState", async () => {
      const confirm = await vscode.window.showWarningMessage(
        "Clear all audit tracking state? This cannot be undone.",
        { modal: true },
        "Yes, Clear All"
      );

      if (confirm === "Yes, Clear All") {
        stateManager.clearAllState();
        await stateManager.save();
        treeProvider.refresh();
        vscode.window.showInformationMessage("Audit tracking state cleared");
      }
    }),

    treeView
  );

  // Watch for file changes to update symbols
  const fileWatcher = vscode.workspace.createFileSystemWatcher("**/*");

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
