import * as vscode from "vscode";
import * as path from "path";
import {
  AuditrackerState,
  DailyProgress,
  FunctionState,
  ScopedFile,
  createDefaultState,
} from "../models/types";
import {
  fromStoredState,
  mergeFunctions,
  remapRenamedPath,
  toStoredState,
} from "./stateCore";

export class StateManager {
  private state: AuditrackerState;
  private stateFilePath: vscode.Uri | undefined;
  private saveChain: Promise<void> = Promise.resolve();

  constructor(private workspaceRoot: string | undefined) {
    this.state = createDefaultState();
    if (workspaceRoot) {
      const repoName = path.basename(workspaceRoot);
      const stateFileName = `${repoName}-auditracker.json`;
      this.stateFilePath = vscode.Uri.file(
        path.join(workspaceRoot, ".vscode", stateFileName)
      );
    }
  }

  async load(): Promise<void> {
    if (!this.stateFilePath) {
      return;
    }

    let content: Uint8Array;
    try {
      content = await vscode.workspace.fs.readFile(this.stateFilePath);
    } catch {
      // No state file yet — the expected case on first run.
      this.state = createDefaultState();
      return;
    }

    try {
      const parsed = JSON.parse(Buffer.from(content).toString("utf-8"));
      this.state = fromStoredState(parsed, this.workspaceRoot);
    } catch {
      // The file exists but cannot be parsed (e.g. a git merge conflict left
      // markers in it). Preserve it as a backup rather than overwriting real
      // audit history with an empty default state.
      await this.backupCorruptState(content);
      this.state = createDefaultState();
    }
  }

  private async backupCorruptState(content: Uint8Array): Promise<void> {
    if (!this.stateFilePath) {
      return;
    }
    const backupPath = this.stateFilePath.with({
      path: `${this.stateFilePath.path}.corrupt-${Date.now()}.json`,
    });
    try {
      await vscode.workspace.fs.writeFile(backupPath, content);
      vscode.window.showErrorMessage(
        "Auditracker: the tracking file could not be parsed and was reset. " +
          `Your previous data was preserved at ${path.basename(
            backupPath.fsPath
          )}.`
      );
    } catch {
      vscode.window.showErrorMessage(
        "Auditracker: the tracking file could not be parsed and was reset."
      );
    }
  }

  async save(): Promise<void> {
    if (!this.stateFilePath || !this.workspaceRoot) {
      return;
    }

    const runSave = async (): Promise<void> => {
      // Ensure .vscode directory exists
      const vscodeDir = vscode.Uri.file(
        path.join(this.workspaceRoot as string, ".vscode")
      );
      try {
        await vscode.workspace.fs.createDirectory(vscodeDir);
      } catch {
        // Directory might already exist
      }

      this.state.lastModified = Date.now();
      // Persist paths relative to the workspace so the file is portable across
      // machines/clones and never leaks absolute paths of the auditor's disk.
      const stored = toStoredState(this.state, this.workspaceRoot);
      const content = Buffer.from(JSON.stringify(stored, null, 2), "utf-8");
      await vscode.workspace.fs.writeFile(
        this.stateFilePath as vscode.Uri,
        content
      );
    };

    // Serialize writes to avoid out-of-order state file corruption.
    this.saveChain = this.saveChain.then(runSave, runSave);
    return this.saveChain;
  }

  getScopePaths(): string[] {
    return this.state.scopePaths;
  }

  getActiveFilePath(): string | null {
    return this.state.activeFilePath;
  }

  setActiveFilePath(filePath: string | null): void {
    this.state.activeFilePath = filePath;
  }

  addScopePath(filePath: string): void {
    if (!this.state.scopePaths.includes(filePath)) {
      this.state.scopePaths.push(filePath);
    }
  }

  addExcludedPath(filePath: string): void {
    if (!this.state.excludedPaths.includes(filePath)) {
      this.state.excludedPaths.push(filePath);
    }
  }

  removeExcludedPath(filePath: string): void {
    this.state.excludedPaths = this.state.excludedPaths.filter(
      (p) => p !== filePath
    );
  }

  isPathExcluded(filePath: string): boolean {
    return this.state.excludedPaths.includes(filePath);
  }

  removeScopePath(filePath: string): void {
    this.state.scopePaths = this.state.scopePaths.filter((p) => p !== filePath);

    // Drop tracked file entries that are no longer in scope after removal.
    for (const key of Object.keys(this.state.files)) {
      if (!this.isPathInScope(key)) {
        delete this.state.files[key];
      }
    }
  }

  isPathInScope(filePath: string): boolean {
    if (this.isPathExcluded(filePath)) {
      return false;
    }

    return this.state.scopePaths.some(
      (scopePath) =>
        filePath === scopePath || filePath.startsWith(scopePath + path.sep)
    );
  }

  setFileFunctions(
    filePath: string,
    relativePath: string,
    functions: FunctionState[]
  ): void {
    const existingFile = this.state.files[filePath];
    const merged = existingFile
      ? mergeFunctions(existingFile.functions, functions)
      : functions;

    this.state.files[filePath] = {
      filePath,
      relativePath,
      functions: merged,
    };
  }

  /**
   * Move audit state to a new path after a rename (file or folder). Returns true
   * when something moved, so the caller can skip an unnecessary save.
   */
  renamePath(oldPath: string, newPath: string): boolean {
    return remapRenamedPath(this.state, oldPath, newPath, this.workspaceRoot);
  }

  removeFile(filePath: string): void {
    delete this.state.files[filePath];
  }

  getFile(filePath: string): ScopedFile | undefined {
    return this.state.files[filePath];
  }

  getAllFiles(): ScopedFile[] {
    return Object.values(this.state.files);
  }

  setAudited(functionId: string, audited: boolean): void {
    for (const file of Object.values(this.state.files)) {
      for (const fn of file.functions) {
        if (fn.id === functionId) {
          fn.isAudited = audited;
          return;
        }
      }
    }
  }

  setHidden(functionId: string, isHidden: boolean): void {
    for (const file of Object.values(this.state.files)) {
      for (const fn of file.functions) {
        if (fn.id === functionId) {
          fn.isHidden = isHidden;
          return;
        }
      }
    }
  }

  clearAllState(): void {
    this.state = createDefaultState();
  }

  // Progress tracking methods

  private getOrCreateTodayProgress(): DailyProgress {
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    let entry = this.state.progressHistory.find((p) => p.date === today);
    if (!entry) {
      entry = {
        date: today,
        functionsAudited: 0,
        linesAudited: 0,
        filesAudited: 0,
        actions: [],
      };
      this.state.progressHistory.push(entry);
    }
    return entry;
  }

  recordFunctionAudited(
    filePath: string,
    functionName: string,
    lineCount: number
  ): void {
    const progress = this.getOrCreateTodayProgress();
    progress.functionsAudited++;
    progress.linesAudited += lineCount;
    progress.actions.push({
      type: "functionAudited",
      filePath,
      functionName,
      lineCount,
    });
  }

  recordFileAudited(filePath: string): void {
    const progress = this.getOrCreateTodayProgress();
    progress.filesAudited++;
    progress.actions.push({
      type: "fileAudited",
      filePath,
    });
  }

  getProgressHistory(): DailyProgress[] {
    return this.state.progressHistory;
  }
}
