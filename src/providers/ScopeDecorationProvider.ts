import * as vscode from "vscode";
import { StateManager } from "../services/StateManager";

export class ScopeDecorationProvider implements vscode.FileDecorationProvider {
  private readonly _onDidChangeFileDecorations =
    new vscode.EventEmitter<vscode.Uri | vscode.Uri[]>();
  readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

  constructor(private stateManager: StateManager) {}

  provideFileDecoration(
    uri: vscode.Uri,
    token: vscode.CancellationToken
  ): vscode.FileDecoration | undefined {
    if (token.isCancellationRequested) {
      return undefined;
    }

    // Check if file is in scope
    if (!this.stateManager.isPathInScope(uri.fsPath)) {
      return undefined;
    }

    return {
      propagate: true,
      badge: "📌",
      tooltip: "In audit scope",
    };
  }

  // Refresh decorations for specific URIs
  refresh(uris?: vscode.Uri[]): void {
    if (uris) {
      this._onDidChangeFileDecorations.fire(uris);
    } else {
      // Fire undefined to refresh all
      this._onDidChangeFileDecorations.fire(
        this.stateManager
          .getAllFiles()
          .map((f) => vscode.Uri.file(f.filePath))
      );
    }
  }

  // Refresh all decorations
  refreshAll(): void {
    const allFiles = this.stateManager.getAllFiles();
    const uris = allFiles.map((f) => vscode.Uri.file(f.filePath));
    this._onDidChangeFileDecorations.fire(uris);
  }
}
