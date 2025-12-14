import * as vscode from "vscode";
import * as path from "path";
import {
  AuditTrackerState,
  AuditNote,
  DailyProgress,
  DEFAULT_STATE,
  FunctionState,
  ScopedFile,
} from "../models/types";

export class StateManager {
  private state: AuditTrackerState;
  private stateFilePath: vscode.Uri | undefined;

  constructor(private workspaceRoot: string | undefined) {
    this.state = { ...DEFAULT_STATE };
    if (workspaceRoot) {
      const repoName = path.basename(workspaceRoot);
      const stateFileName = `${repoName}-audit-tracker.json`;
      this.stateFilePath = vscode.Uri.file(
        path.join(workspaceRoot, ".vscode", stateFileName)
      );
    }
  }

  async load(): Promise<void> {
    if (!this.stateFilePath) {
      return;
    }

    try {
      const content = await vscode.workspace.fs.readFile(this.stateFilePath);
      const parsed = JSON.parse(content.toString()) as AuditTrackerState;

      // Merge with defaults to handle missing fields
      this.state = {
        ...DEFAULT_STATE,
        ...parsed,
      };
    } catch {
      // File doesn't exist or is invalid, use defaults
      this.state = { ...DEFAULT_STATE };
    }
  }

  async save(): Promise<void> {
    if (!this.stateFilePath || !this.workspaceRoot) {
      return;
    }

    // Ensure .vscode directory exists
    const vscodeDir = vscode.Uri.file(path.join(this.workspaceRoot, ".vscode"));
    try {
      await vscode.workspace.fs.createDirectory(vscodeDir);
    } catch {
      // Directory might already exist
    }

    this.state.lastModified = Date.now();
    const content = Buffer.from(JSON.stringify(this.state, null, 2), "utf-8");
    await vscode.workspace.fs.writeFile(this.stateFilePath, content);
  }

  getState(): AuditTrackerState {
    return this.state;
  }

  getScopePaths(): string[] {
    return this.state.scopePaths;
  }

  addScopePath(filePath: string): void {
    if (!this.state.scopePaths.includes(filePath)) {
      this.state.scopePaths.push(filePath);
    }
  }

  removeScopePath(filePath: string): void {
    this.state.scopePaths = this.state.scopePaths.filter((p) => p !== filePath);
    // Also remove any files that were under this scope path
    for (const key of Object.keys(this.state.files)) {
      if (key === filePath || key.startsWith(filePath + path.sep)) {
        delete this.state.files[key];
      }
    }
  }

  isPathInScope(filePath: string): boolean {
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

    if (existingFile) {
      // Preserve existing read counts and reviewed status
      const existingFunctionsMap = new Map<string, FunctionState>();
      for (const fn of existingFile.functions) {
        existingFunctionsMap.set(fn.id, fn);
      }

      // Merge new functions with existing state
      const mergedFunctions = functions.map((fn) => {
        const existing = existingFunctionsMap.get(fn.id);
        if (existing) {
          return {
            ...fn,
            readCount: existing.readCount,
            isReviewed: existing.isReviewed,
            isEntrypoint: existing.isEntrypoint,
            isHidden: existing.isHidden,
          };
        }
        return fn;
      });

      this.state.files[filePath] = {
        filePath,
        relativePath,
        functions: mergedFunctions,
        lastUpdated: Date.now(),
      };
    } else {
      this.state.files[filePath] = {
        filePath,
        relativePath,
        functions,
        lastUpdated: Date.now(),
      };
    }
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

  getAllFunctions(): FunctionState[] {
    const functions: FunctionState[] = [];
    for (const file of Object.values(this.state.files)) {
      functions.push(...file.functions);
    }
    return functions;
  }

  setRead(functionId: string, read: boolean): void {
    for (const file of Object.values(this.state.files)) {
      for (const fn of file.functions) {
        if (fn.id === functionId) {
          fn.readCount = read ? 1 : 0;
          return;
        }
      }
    }
  }

  setReviewed(functionId: string, reviewed: boolean): void {
    for (const file of Object.values(this.state.files)) {
      for (const fn of file.functions) {
        if (fn.id === functionId) {
          fn.isReviewed = reviewed;
          return;
        }
      }
    }
  }

  setEntrypoint(functionId: string, isEntrypoint: boolean): void {
    for (const file of Object.values(this.state.files)) {
      for (const fn of file.functions) {
        if (fn.id === functionId) {
          fn.isEntrypoint = isEntrypoint;
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
    this.state = { ...DEFAULT_STATE };
  }

  // Note management methods

  addNote(note: AuditNote): void {
    if (!this.state.notes) {
      this.state.notes = [];
    }
    this.state.notes.push(note);
  }

  updateNote(id: string, content: string): void {
    const note = this.state.notes?.find((n) => n.id === id);
    if (note) {
      note.content = content;
      note.updatedAt = Date.now();
    }
  }

  deleteNote(id: string): void {
    if (this.state.notes) {
      this.state.notes = this.state.notes.filter((n) => n.id !== id);
    }
  }

  getNotes(): AuditNote[] {
    return this.state.notes || [];
  }

  getNote(id: string): AuditNote | undefined {
    return this.state.notes?.find((n) => n.id === id);
  }

  getNotesForLine(filePath: string, line: number): AuditNote[] {
    return (this.state.notes || []).filter(
      (n) => n.type === "line" && n.filePath === filePath && n.line === line
    );
  }

  getLineNotesForFile(filePath: string): AuditNote[] {
    return (this.state.notes || []).filter(
      (n) => n.type === "line" && n.filePath === filePath
    );
  }

  // Progress tracking methods

  private getOrCreateTodayProgress(): DailyProgress {
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    if (!this.state.progressHistory) {
      this.state.progressHistory = [];
    }
    let entry = this.state.progressHistory.find((p) => p.date === today);
    if (!entry) {
      entry = {
        date: today,
        functionsRead: 0,
        functionsReviewed: 0,
        linesRead: 0,
        linesReviewed: 0,
        filesRead: 0,
        filesReviewed: 0,
        notesAdded: 0,
        actions: [],
      };
      this.state.progressHistory.push(entry);
    }
    // Handle migration for existing entries without line counts
    if (entry.linesRead === undefined) {
      entry.linesRead = 0;
    }
    if (entry.linesReviewed === undefined) {
      entry.linesReviewed = 0;
    }
    return entry;
  }

  recordFunctionRead(filePath: string, functionName: string, lineCount: number): void {
    const progress = this.getOrCreateTodayProgress();
    progress.functionsRead++;
    progress.linesRead += lineCount;
    progress.actions.push({
      type: "functionRead",
      filePath,
      functionName,
      lineCount,
    });
  }

  recordFunctionReviewed(filePath: string, functionName: string, lineCount: number): void {
    const progress = this.getOrCreateTodayProgress();
    progress.functionsReviewed++;
    progress.linesReviewed += lineCount;
    progress.actions.push({
      type: "functionReviewed",
      filePath,
      functionName,
      lineCount,
    });
  }

  recordFileRead(filePath: string): void {
    const progress = this.getOrCreateTodayProgress();
    progress.filesRead++;
    progress.actions.push({
      type: "fileRead",
      filePath,
    });
  }

  recordFileReviewed(filePath: string): void {
    const progress = this.getOrCreateTodayProgress();
    progress.filesReviewed++;
    progress.actions.push({
      type: "fileReviewed",
      filePath,
    });
  }

  recordNoteAdded(filePath: string, line: number, noteText: string): void {
    const progress = this.getOrCreateTodayProgress();
    progress.notesAdded++;
    progress.actions.push({
      type: "noteAdded",
      filePath,
      noteLine: line,
      notePreview: noteText.substring(0, 50) + (noteText.length > 50 ? "..." : ""),
    });
  }

  getProgressHistory(): DailyProgress[] {
    return this.state.progressHistory || [];
  }
}
