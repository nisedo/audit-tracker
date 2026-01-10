import * as vscode from "vscode";
import * as path from "path";
import {
  AudiotrackerState,
  DailyProgress,
  DEFAULT_FUNCTION_FILTERS,
  FunctionState,
  FunctionFilters,
  FunctionStatus,
  FunctionTag,
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
    const isFunctionStatus = (value: string): value is FunctionStatus =>
      value === "unread" || value === "read" || value === "reviewed";
    const isFunctionTag = (value: string): value is FunctionTag =>
      value === "entrypoint" || value === "admin";

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

    const rawFilters = state.functionFilters as unknown as {
      statuses?: unknown;
      tags?: unknown;
    };

    const statuses = unique(
      rawFilters && Array.isArray(rawFilters.statuses)
        ? rawFilters.statuses
            .filter((s): s is string => typeof s === "string")
            .filter(isFunctionStatus)
        : []
    ) as FunctionStatus[];

    const tags = unique(
      rawFilters && Array.isArray(rawFilters.tags)
        ? rawFilters.tags
            .filter((t): t is string => typeof t === "string")
            .filter(isFunctionTag)
        : []
    ) as FunctionTag[];

    const functionFilters: FunctionFilters = {
      statuses: statuses.length > 0 ? statuses : [...DEFAULT_FUNCTION_FILTERS.statuses],
      tags,
    };

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

                return {
                  id,
                  name,
                  filePath,
                  startLine,
                  endLine: Math.max(endLine, startLine),
                  readCount:
                    typeof fn.readCount === "number" && fn.readCount > 0 ? 1 : 0,
                  isReviewed: Boolean(fn.isReviewed),
                  isEntrypoint: Boolean(fn.isEntrypoint),
                  isAdmin: Boolean(fn.isAdmin),
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

    const progressHistory: DailyProgress[] = Array.isArray(state.progressHistory)
      ? state.progressHistory
          .filter((entry) => Boolean(entry) && typeof entry === "object")
          .map((entry) => {
            const date = typeof entry.date === "string" ? entry.date : "unknown";

            const actions = Array.isArray(entry.actions)
              ? entry.actions
                  .filter((a) => Boolean(a) && typeof a === "object")
                  .filter((a) =>
                    a.type === "functionRead" ||
                    a.type === "functionReviewed" ||
                    a.type === "fileRead" ||
                    a.type === "fileReviewed"
                  )
                  .map((a) => ({
                    type: a.type,
                    filePath: typeof a.filePath === "string" ? a.filePath : "unknown",
                    functionName:
                      typeof a.functionName === "string" ? a.functionName : undefined,
                    lineCount:
                      typeof a.lineCount === "number" && Number.isFinite(a.lineCount)
                        ? a.lineCount
                        : undefined,
                  }))
              : [];

            return {
              date,
              functionsRead:
                typeof entry.functionsRead === "number" && Number.isFinite(entry.functionsRead)
                  ? entry.functionsRead
                  : 0,
              functionsReviewed:
                typeof entry.functionsReviewed === "number" &&
                Number.isFinite(entry.functionsReviewed)
                  ? entry.functionsReviewed
                  : 0,
              linesRead:
                typeof entry.linesRead === "number" && Number.isFinite(entry.linesRead)
                  ? entry.linesRead
                  : 0,
              linesReviewed:
                typeof entry.linesReviewed === "number" &&
                Number.isFinite(entry.linesReviewed)
                  ? entry.linesReviewed
                  : 0,
              filesRead:
                typeof entry.filesRead === "number" && Number.isFinite(entry.filesRead)
                  ? entry.filesRead
                  : 0,
              filesReviewed:
                typeof entry.filesReviewed === "number" &&
                Number.isFinite(entry.filesReviewed)
                  ? entry.filesReviewed
                  : 0,
              actions,
            };
          })
      : [];

    return {
      version: typeof state.version === "number" ? state.version : STATE_VERSION,
      scopePaths,
      excludedPaths,
      functionFilters,
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

  getFunctionFilters(): FunctionFilters {
    return this.state.functionFilters;
  }

  setFunctionFilters(filters: FunctionFilters): void {
    const unique = <T extends string>(values: T[]): T[] => [...new Set(values)];
    const statuses = unique(filters.statuses).filter(
      (s) => s === "unread" || s === "read" || s === "reviewed"
    );
    const tags = unique(filters.tags).filter(
      (t) => t === "entrypoint" || t === "admin"
    );

    this.state.functionFilters = {
      statuses: statuses.length > 0 ? statuses : [...DEFAULT_FUNCTION_FILTERS.statuses],
      tags,
    };
  }

  clearFunctionFilters(): void {
    this.state.functionFilters = {
      statuses: [...DEFAULT_FUNCTION_FILTERS.statuses],
      tags: [],
    };
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
            readCount: existing.readCount,
            isReviewed: existing.isReviewed,
            isEntrypoint: existing.isEntrypoint,
            isAdmin: existing.isAdmin,
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

  setAdmin(functionId: string, isAdmin: boolean): void {
    for (const file of Object.values(this.state.files)) {
      for (const fn of file.functions) {
        if (fn.id === functionId) {
          fn.isAdmin = isAdmin;
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
        functionsRead: 0,
        functionsReviewed: 0,
        linesRead: 0,
        linesReviewed: 0,
        filesRead: 0,
        filesReviewed: 0,
        actions: [],
      };
      this.state.progressHistory.push(entry);
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

  getProgressHistory(): DailyProgress[] {
    return this.state.progressHistory;
  }
}
