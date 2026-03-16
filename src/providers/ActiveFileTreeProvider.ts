import * as vscode from "vscode";
import { StateManager } from "../services/StateManager";
import { FunctionState } from "../models/types";

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

    super(baseName, vscode.TreeItemCollapsibleState.None);

    const isAudited = functionState.isAudited;

    const lineCount = functionState.endLine - functionState.startLine + 1;
    this.description = `${lineCount} lines`;

    this.contextValue = isAudited ? "functionAudited" : "functionUnaudited";

    if (isAudited) {
      this.iconPath = new vscode.ThemeIcon(
        "check",
        new vscode.ThemeColor("testing.iconPassed")
      );
    } else {
      this.iconPath = new vscode.ThemeIcon("circle-outline");
    }

    this.command = {
      command: "auditracker.goToFunction",
      title: "Go to Function",
      arguments: [functionState],
    };

    const status = isAudited ? "audited" : "unaudited";
    this.tooltip = `${baseName}\nStatus: ${status}\nLines: ${lineCount}\nLine: ${functionState.startLine + 1}`;
  }
}

/**
 * Tree data provider for the active file panel (top).
 * Shows functions of a single selected file.
 */
export class ActiveFileTreeProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    vscode.TreeItem | undefined
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private activeFilePath: string | null = null;

  constructor(private stateManager: StateManager) {}

  setActiveFile(filePath: string | null): void {
    this.activeFilePath = filePath;
    this._onDidChangeTreeData.fire(undefined);
  }

  getActiveFilePath(): string | null {
    return this.activeFilePath;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<vscode.TreeItem[]> {
    if (!this.activeFilePath) {
      const placeholder = new vscode.TreeItem(
        "Click a file below to start",
        vscode.TreeItemCollapsibleState.None
      );
      placeholder.iconPath = new vscode.ThemeIcon(
        "info",
        new vscode.ThemeColor("descriptionForeground")
      );
      return [placeholder];
    }

    const file = this.stateManager.getFile(this.activeFilePath);
    if (!file) {
      // File was removed from scope
      this.activeFilePath = null;
      const placeholder = new vscode.TreeItem(
        "Click a file below to start",
        vscode.TreeItemCollapsibleState.None
      );
      placeholder.iconPath = new vscode.ThemeIcon(
        "info",
        new vscode.ThemeColor("descriptionForeground")
      );
      return [placeholder];
    }

    const visibleFunctions = file.functions.filter((f) => !f.isHidden);
    const sorted = [...visibleFunctions].sort((a, b) => {
      const priorityDiff = (a.isAudited ? 1 : 0) - (b.isAudited ? 1 : 0);
      if (priorityDiff !== 0) return priorityDiff;
      return a.startLine - b.startLine;
    });

    return sorted.map((f) => new FunctionTreeItem(f));
  }
}
