import * as vscode from "vscode";
import { StateManager } from "../services/StateManager";
import { ScopedFile } from "../models/types";

/**
 * Tree item representing a file in the files list (bottom panel).
 * Clicking selects it into the active file panel.
 */
export class FileListItem extends vscode.TreeItem {
  constructor(public readonly scopedFile: ScopedFile) {
    const fileName =
      scopedFile.relativePath.split("/").pop() || scopedFile.relativePath;
    super(fileName, vscode.TreeItemCollapsibleState.None);

    this.tooltip = scopedFile.relativePath;
    this.contextValue = "file";
    this.iconPath = vscode.ThemeIcon.File;

    const visibleFunctions = scopedFile.functions.filter((f) => !f.isHidden);
    const total = visibleFunctions.length;
    const audited = visibleFunctions.filter((f) => f.isAudited).length;
    const hidden = scopedFile.functions.filter((f) => f.isHidden).length;
    this.description =
      hidden > 0
        ? `${audited}/${total} audited (${hidden} hidden)`
        : `${audited}/${total} audited`;

    this.command = {
      command: "auditracker.selectFile",
      title: "Select File",
      arguments: [scopedFile.filePath],
    };
  }
}

/**
 * Tree data provider for the files panel (bottom).
 * Flat list of all in-scope files.
 */
export class FilesTreeProvider
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

  async getChildren(): Promise<vscode.TreeItem[]> {
    const files = this.stateManager.getAllFiles();
    const items: FileListItem[] = [];

    for (const file of files) {
      const hasVisibleFunctions = file.functions.some((f) => !f.isHidden);
      if (hasVisibleFunctions) {
        items.push(new FileListItem(file));
      }
    }

    return items.sort((a, b) => {
      const aVisible = a.scopedFile.functions.filter((f) => !f.isHidden);
      const bVisible = b.scopedFile.functions.filter((f) => !f.isHidden);
      const aFullyAudited = aVisible.length > 0 && aVisible.every((f) => f.isAudited);
      const bFullyAudited = bVisible.length > 0 && bVisible.every((f) => f.isAudited);
      if (aFullyAudited !== bFullyAudited) return aFullyAudited ? 1 : -1;
      return a.scopedFile.relativePath.localeCompare(b.scopedFile.relativePath);
    });
  }
}
