import * as vscode from "vscode";
import * as path from "path";
import {
  AudiotrackerState,
  DailyProgress,
  FunctionState,
  ScopedFile,
  STATE_VERSION,
  createDefaultState,
} from "../models/types";

export class StateManager {
  private state: AudiotrackerState;
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

    try {
      const content = await vscode.workspace.fs.readFile(this.stateFilePath);
      const parsed = JSON.parse(content.toString()) as AudiotrackerState;

      // Merge with defaults + normalize to handle schema evolution.
      this.state = this.normalizeState({
        ...createDefaultState(),
        ...parsed,
      });
    } catch {
      // File doesn't exist or is invalid, use defaults
      this.state = createDefaultState();
    }
  }

  private normalizeState(state: AudiotrackerState): AudiotrackerState {
    const unique = (values: string[]): string[] => [...new Set(values)];

    const scopePaths = unique(
      Array.isArray(state.scopePaths)
        ? state.scopePaths.filter((p): p is string => typeof p === "string" && p.length > 0)
        : []
    );

    const excludedPaths = unique(
      Array.isArray(state.excludedPaths)
        ? state.excludedPaths.filter((p): p is string => typeof p === "string" && p.length > 0)
        : []
    );

    const files: Record<string, ScopedFile> = {};
    if (state.files && typeof state.files === "object") {
      for (const [filePath, file] of Object.entries(state.files)) {
        if (!file || typeof file !== "object") {
          continue;
        }

        const relativePath =
          typeof file.relativePath === "string" && file.relativePath.length > 0
            ? file.relativePath
            : path.basename(filePath);

        const functions: FunctionState[] = Array.isArray(file.functions)
          ? file.functions
              .filter((fn) => Boolean(fn) && typeof fn === "object")
              .map((fn) => {
                const startLine =
                  typeof fn.startLine === "number" && Number.isFinite(fn.startLine)
                    ? fn.startLine
                    : 0;
                const endLine =
                  typeof fn.endLine === "number" && Number.isFinite(fn.endLine)
                    ? fn.endLine
                    : startLine;

                const name = typeof fn.name === "string" ? fn.name : "unknown";
                const id =
                  typeof fn.id === "string" && fn.id.length > 0
                    ? fn.id
                    : `${filePath}#${name}#${startLine}`;

                // Migrate from old schema: isReviewed or readCount > 0 both map to isAudited
                const raw = fn as unknown as Record<string, unknown>;
                const isAudited = Boolean(fn.isAudited) || Boolean(raw.isReviewed) ||
                  (typeof raw.readCount === "number" && raw.readCount > 0);

                return {
                  id,
                  name,
                  filePath,
                  startLine,
                  endLine: Math.max(endLine, startLine),
                  isAudited,
                  isHidden: Boolean(fn.isHidden),
                };
              })
          : [];

        files[filePath] = {
          filePath,
          relativePath,
          functions,
        };
      }
    }

    // Migrate old progress history fields
    const migrateActionType = (type: string): string => {
      if (type === "functionRead" || type === "functionReviewed") return "functionAudited";
      if (type === "fileRead" || type === "fileReviewed") return "fileAudited";
      return type;
    };

    const progressHistory: DailyProgress[] = Array.isArray(state.progressHistory)
      ? state.progressHistory
          .filter((entry) => Boolean(entry) && typeof entry === "object")
          .map((entry) => {
            const raw = entry as unknown as Record<string, unknown>;
            const date = typeof entry.date === "string" ? entry.date : "unknown";

            const actions = Array.isArray(entry.actions)
              ? entry.actions
                  .filter((a) => Boolean(a) && typeof a === "object")
                  .filter((a) =>
                    a.type === "functionAudited" ||
                    a.type === "fileAudited" ||
                    a.type === "functionRead" ||
                    a.type === "functionReviewed" ||
                    a.type === "fileRead" ||
                    a.type === "fileReviewed"
                  )
                  .map((a) => ({
                    type: migrateActionType(a.type) as "functionAudited" | "fileAudited",
                    filePath: typeof a.filePath === "string" ? a.filePath : "unknown",
                    functionName:
                      typeof a.functionName === "string" ? a.functionName : undefined,
                    lineCount:
                      typeof a.lineCount === "number" && Number.isFinite(a.lineCount)
                        ? a.lineCount
                        : undefined,
                  }))
              : [];

            const toNum = (key: string): number =>
              typeof raw[key] === "number" && Number.isFinite(raw[key] as number)
                ? raw[key] as number
                : 0;

            const functionsAudited = toNum("functionsAudited") + toNum("functionsRead") + toNum("functionsReviewed");
            const linesAudited = toNum("linesAudited") + toNum("linesRead") + toNum("linesReviewed");
            const filesAudited = toNum("filesAudited") + toNum("filesRead") + toNum("filesReviewed");

            return {
              date,
              functionsAudited,
              linesAudited,
              filesAudited,
              actions,
            };
          })
      : [];

    const activeFilePath =
      typeof state.activeFilePath === "string" && state.activeFilePath.length > 0
        ? state.activeFilePath
        : null;

    return {
      version: typeof state.version === "number" ? state.version : STATE_VERSION,
      scopePaths,
      excludedPaths,
      activeFilePath,
      files,
      progressHistory,
      lastModified:
        typeof state.lastModified === "number" ? state.lastModified : Date.now(),
    };
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
      const content = Buffer.from(JSON.stringify(this.state, null, 2), "utf-8");
      await vscode.workspace.fs.writeFile(this.stateFilePath as vscode.Uri, content);
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
    this.state.excludedPaths = this.state.excludedPaths.filter((p) => p !== filePath);
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

    if (existingFile) {
      // Preserve existing state when line numbers change by matching on name.
      const existingByName = new Map<string, FunctionState>();
      const existingById = new Map<string, FunctionState>();
      for (const fn of existingFile.functions) {
        existingByName.set(fn.name, fn);
        existingById.set(fn.id, fn);
      }

      // Merge new functions with existing state
      const mergedFunctions = functions.map((fn) => {
        // First try exact ID match (fastest, handles unchanged functions)
        let existing = existingById.get(fn.id);

        // If no ID match, try matching by name (handles line number changes)
        if (!existing) {
          existing = existingByName.get(fn.name);
        }

        if (existing) {
          return {
            ...fn,
            isAudited: existing.isAudited,
            isHidden: existing.isHidden,
          };
        }
        return fn;
      });

      this.state.files[filePath] = {
        filePath,
        relativePath,
        functions: mergedFunctions,
      };
    } else {
      this.state.files[filePath] = {
        filePath,
        relativePath,
        functions,
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

  recordFunctionAudited(filePath: string, functionName: string, lineCount: number): void {
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
