import * as vscode from "vscode";
import { StateManager } from "../services/StateManager";
import { FunctionState, ScopedFile } from "../models/types";

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

    // Show count of functions and reviewed status
    const total = scopedFile.functions.length;
    const reviewed = scopedFile.functions.filter((f) => f.isReviewed).length;
    this.description = `${reviewed}/${total} reviewed`;
  }
}

/**
 * Tree item representing a function/method
 */
export class FunctionTreeItem extends vscode.TreeItem {
  constructor(public readonly functionState: FunctionState) {
    // Add arrow marker for entrypoints
    const displayName = functionState.isEntrypoint
      ? `→ ${functionState.name}`
      : functionState.name;
    super(displayName, vscode.TreeItemCollapsibleState.None);

    // Determine status: unread, read, or reviewed
    const isRead = functionState.readCount > 0;
    const isReviewed = functionState.isReviewed;
    const isEntrypoint = functionState.isEntrypoint;

    // Set description based on status
    const statusParts: string[] = [];
    if (isEntrypoint) {
      statusParts.push("entrypoint");
    }
    if (isReviewed) {
      statusParts.push("reviewed");
    } else if (isRead) {
      statusParts.push("read");
    } else {
      statusParts.push("unread");
    }
    const lineCount = functionState.endLine - functionState.startLine + 1;
    statusParts.push(`${lineCount} lines`);
    this.description = statusParts.join(" · ");

    // Set context value for menu visibility (includes entrypoint state)
    const entrypointSuffix = isEntrypoint ? "Entrypoint" : "";
    if (isReviewed) {
      this.contextValue = `functionReviewed${entrypointSuffix}`;
    } else if (isRead) {
      this.contextValue = `functionRead${entrypointSuffix}`;
    } else {
      this.contextValue = `functionUnread${entrypointSuffix}`;
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
      command: "auditTracker.goToFunction",
      title: "Go to Function",
      arguments: [functionState],
    };

    this.tooltip = `${functionState.name}\nStatus: ${this.description}\nLine: ${functionState.startLine + 1}`;
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
      // File level: return functions sorted by status
      const sortedFunctions = [...element.scopedFile.functions].sort((a, b) => {
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

  private getFileItems(): FileTreeItem[] {
    const files = this.stateManager.getAllFiles();
    const items: FileTreeItem[] = [];

    for (const file of files) {
      if (file.functions.length > 0) {
        items.push(new FileTreeItem(file));
      }
    }

    // Sort by relative path
    return items.sort((a, b) =>
      a.scopedFile.relativePath.localeCompare(b.scopedFile.relativePath)
    );
  }
}
