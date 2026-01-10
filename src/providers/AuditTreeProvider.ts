import * as vscode from "vscode";
import { StateManager } from "../services/StateManager";
import { FunctionFilters, FunctionState, FunctionStatus, ScopedFile } from "../models/types";

/**
 * Tree item representing a file in scope
 */
export class FileTreeItem extends vscode.TreeItem {
  constructor(
    public readonly scopedFile: ScopedFile
  ) {
    super(scopedFile.relativePath, vscode.TreeItemCollapsibleState.Expanded);

    this.tooltip = scopedFile.filePath;
    this.contextValue = "file";
    this.iconPath = vscode.ThemeIcon.File;

    // Show count of functions, read and reviewed status (excluding hidden)
    const visibleFunctions = scopedFile.functions.filter((f) => !f.isHidden);
    const total = visibleFunctions.length;
    const read = visibleFunctions.filter((f) => f.readCount > 0).length;
    const reviewed = visibleFunctions.filter((f) => f.isReviewed).length;
    const hidden = scopedFile.functions.filter((f) => f.isHidden).length;
    this.description = hidden > 0
      ? `${read}/${total} read · ${reviewed}/${total} reviewed (${hidden} hidden)`
      : `${read}/${total} read · ${reviewed}/${total} reviewed`;
  }
}

/**
 * Tree item representing a function/method
 */
export class FunctionTreeItem extends vscode.TreeItem {
  constructor(public readonly functionState: FunctionState) {
    // For Solidity files, strip the contract prefix (e.g., "Contract.func" -> "func")
    // since the contract name is redundant with the file shown above
    let baseName = functionState.name;
    if (functionState.filePath.endsWith(".sol") && baseName.includes(".")) {
      baseName = baseName.substring(baseName.indexOf(".") + 1);
    }

    // Build display name with markers: ❗️ for entrypoint, 🔐 for admin
    let displayName = baseName;
    if (functionState.isAdmin) {
      displayName = `🔐 ${displayName}`;
    }
    if (functionState.isEntrypoint) {
      displayName = `❗️ ${displayName}`;
    }
    super(displayName, vscode.TreeItemCollapsibleState.None);

    // Determine status: unread, read, or reviewed
    const isRead = functionState.readCount > 0;
    const isReviewed = functionState.isReviewed;
    const isEntrypoint = functionState.isEntrypoint;
    const isAdmin = functionState.isAdmin;

    // Set description (line count, entrypoint/admin indicators)
    const lineCount = functionState.endLine - functionState.startLine + 1;
    const labels: string[] = [];
    if (isEntrypoint) labels.push("entrypoint");
    if (isAdmin) labels.push("admin");
    labels.push(`${lineCount} lines`);
    this.description = labels.join(" · ");

    // Set context value for menu visibility (includes entrypoint and admin state)
    const entrypointSuffix = isEntrypoint ? "Entrypoint" : "";
    const adminSuffix = isAdmin ? "Admin" : "";
    if (isReviewed) {
      this.contextValue = `functionReviewed${entrypointSuffix}${adminSuffix}`;
    } else if (isRead) {
      this.contextValue = `functionRead${entrypointSuffix}${adminSuffix}`;
    } else {
      this.contextValue = `functionUnread${entrypointSuffix}${adminSuffix}`;
    }

    // Icon based on status
    if (isReviewed) {
      this.iconPath = new vscode.ThemeIcon(
        "check",
        new vscode.ThemeColor("testing.iconPassed")
      );
    } else if (isRead) {
      this.iconPath = new vscode.ThemeIcon(
        "eye",
        new vscode.ThemeColor("charts.yellow")
      );
    } else {
      this.iconPath = new vscode.ThemeIcon("circle-outline");
    }

    // Command to navigate to function
    this.command = {
      command: "auditracker.goToFunction",
      title: "Go to Function",
      arguments: [functionState],
    };

    const status = isReviewed ? "reviewed" : isRead ? "read" : "unread";
    this.tooltip = `${baseName}\nStatus: ${status}\nLines: ${lineCount}\nLine: ${functionState.startLine + 1}`;
  }
}

/**
 * Tree data provider for the audit tracker sidebar
 */
export class AuditTreeProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    vscode.TreeItem | undefined
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private stateManager: StateManager) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (!element) {
      // Root level: return files
      return this.getFileItems();
    }

    if (element instanceof FileTreeItem) {
      // File level: return visible functions matching the current filters
      const functionFilters = this.stateManager.getFunctionFilters();
      const visibleFunctions = element.scopedFile.functions.filter(
        (f) => !f.isHidden && this.matchesFunctionFilters(f, functionFilters)
      );
      const sortedFunctions = [...visibleFunctions].sort((a, b) => {
        // Priority: 0 = unread, 1 = read, 2 = reviewed
        const getPriority = (f: FunctionState): number => {
          if (f.isReviewed) return 2;
          if (f.readCount > 0) return 1;
          return 0;
        };
        const priorityDiff = getPriority(a) - getPriority(b);
        if (priorityDiff !== 0) return priorityDiff;
        // Same priority: sort by line number
        return a.startLine - b.startLine;
      });
      return sortedFunctions.map((f) => new FunctionTreeItem(f));
    }

    return [];
  }

  private matchesFunctionFilters(
    func: FunctionState,
    filters: FunctionFilters
  ): boolean {
    const status: FunctionStatus = func.isReviewed
      ? "reviewed"
      : func.readCount > 0
        ? "read"
        : "unread";

    const statusMatches =
      filters.statuses.length === 0 || filters.statuses.includes(status);

    const tagMatches =
      filters.tags.length === 0 ||
      (filters.tags.includes("entrypoint") && func.isEntrypoint) ||
      (filters.tags.includes("admin") && func.isAdmin);

    return statusMatches && tagMatches;
  }

  private getFileItems(): FileTreeItem[] {
    const files = this.stateManager.getAllFiles();
    const items: FileTreeItem[] = [];
    const functionFilters = this.stateManager.getFunctionFilters();

    for (const file of files) {
      const hasMatchingFunctions = file.functions.some(
        (f) => !f.isHidden && this.matchesFunctionFilters(f, functionFilters)
      );
      if (hasMatchingFunctions) {
        items.push(new FileTreeItem(file));
      }
    }

    // Sort by relative path
    return items.sort((a, b) =>
      a.scopedFile.relativePath.localeCompare(b.scopedFile.relativePath)
    );
  }
}
