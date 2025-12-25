import * as vscode from "vscode";
import * as path from "path";
import { StateManager } from "./StateManager";
import { SymbolExtractor } from "./SymbolExtractor";

export class ScopeManager {
  constructor(
    private stateManager: StateManager,
    private symbolExtractor: SymbolExtractor,
    private workspaceRoot: string | undefined
  ) {}

  /**
   * Add file or folder to scope and extract symbols
   * Returns list of file paths added
   */
  async addToScope(uri: vscode.Uri): Promise<string[]> {
    const filePath = uri.fsPath;
    this.stateManager.addScopePath(filePath);
    this.stateManager.removeExcludedPath(filePath);

    // Expand to individual files and extract symbols
    const files = await this.expandToFiles(filePath);
    const filteredFiles = files.filter((f) => !this.stateManager.isPathExcluded(f));
    await this.extractSymbolsForFiles(filteredFiles);

    return filteredFiles;
  }

  /**
   * Remove file or folder from scope
   */
  async removeFromScope(uri: vscode.Uri): Promise<void> {
    this.stateManager.removeScopePath(uri.fsPath);
  }

  /**
   * Get all files currently in scope
   */
  async getInScopeFiles(): Promise<string[]> {
    const scopePaths = this.stateManager.getScopePaths();
    const allFiles: string[] = [];

    for (const scopePath of scopePaths) {
      const files = await this.expandToFiles(scopePath);
      allFiles.push(...files);
    }

    // Remove duplicates
    const uniqueFiles = [...new Set(allFiles)];
    return uniqueFiles.filter((f) => !this.stateManager.isPathExcluded(f));
  }

  /**
   * Check if a specific file is within any scope path
   */
  isInScope(filePath: string): boolean {
    return this.stateManager.isPathInScope(filePath);
  }

  /**
   * Re-extract symbols for all in-scope files
   */
  async refreshAllSymbols(): Promise<void> {
    const files = await this.getInScopeFiles();
    await this.extractSymbolsForFiles(files);
  }

  /**
   * Re-extract symbols for a single file
   */
  async refreshFileSymbols(filePath: string): Promise<void> {
    if (this.isInScope(filePath)) {
      await this.extractSymbolsForFiles([filePath]);
    }
  }

  /**
   * Expand a path to individual files
   * If path is a file, returns [path]
   * If path is a folder, returns all files in folder recursively
   */
  private async expandToFiles(filePath: string): Promise<string[]> {
    try {
      const stat = await vscode.workspace.fs.stat(vscode.Uri.file(filePath));

      if (stat.type === vscode.FileType.File) {
        return [filePath];
      }

      if (stat.type === vscode.FileType.Directory) {
        return this.getFilesInDirectory(filePath);
      }

      return [];
    } catch {
      return [];
    }
  }

  /**
   * Recursively get all files in a directory
   */
  private async getFilesInDirectory(dirPath: string): Promise<string[]> {
    const files: string[] = [];
    const uri = vscode.Uri.file(dirPath);

    try {
      const entries = await vscode.workspace.fs.readDirectory(uri);

      for (const [name, type] of entries) {
        const entryPath = path.join(dirPath, name);

        // Skip hidden files/folders and node_modules
        if (name.startsWith(".") || name === "node_modules") {
          continue;
        }

        if (type === vscode.FileType.File) {
          files.push(entryPath);
        } else if (type === vscode.FileType.Directory) {
          const subFiles = await this.getFilesInDirectory(entryPath);
          files.push(...subFiles);
        }
      }
    } catch (error) {
      console.error(`Failed to read directory ${dirPath}:`, error);
    }

    return files;
  }

  /**
   * Extract symbols for multiple files and update state
   */
  private async extractSymbolsForFiles(files: string[]): Promise<void> {
    for (const filePath of files) {
      const symbols = await this.symbolExtractor.extractSymbols(filePath);
      const relativePath = this.getRelativePath(filePath);
      this.stateManager.setFileFunctions(filePath, relativePath, symbols);
    }
  }

  /**
   * Get path relative to workspace root
   */
  private getRelativePath(filePath: string): string {
    if (this.workspaceRoot && filePath.startsWith(this.workspaceRoot)) {
      return path.relative(this.workspaceRoot, filePath);
    }
    return path.basename(filePath);
  }
}
