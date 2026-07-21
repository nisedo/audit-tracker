/**
 * Pure state logic for Auditracker, with no dependency on the `vscode` API.
 *
 * Keeping this module free of `vscode` imports lets the trickiest parts of the
 * extension — audit-state preservation across re-extraction, schema migration,
 * and the absolute/relative path conversion used for persistence — be unit
 * tested with the plain Node test runner. `StateManager` is a thin IO wrapper
 * over these functions.
 */
import * as path from "path";
import {
  AuditrackerState,
  DailyProgress,
  FunctionState,
  ScopedFile,
  STATE_VERSION,
  createDefaultState,
} from "../models/types";

/** Root of the workspace stored on disk as "." so it survives path filters. */
const ROOT_SENTINEL = ".";

/**
 * A function's identity is fully derived from its file, name, and start line,
 * so it is recomputed rather than trusted from disk. This keeps the id in sync
 * with `filePath` when paths are converted between absolute and relative forms.
 */
export function makeFunctionId(
  filePath: string,
  name: string,
  startLine: number
): string {
  return `${filePath}#${name}#${startLine}`;
}

function toRelative(root: string, p: string): string {
  if (path.isAbsolute(p) && (p === root || p.startsWith(root + path.sep))) {
    const rel = path.relative(root, p);
    return rel === "" ? ROOT_SENTINEL : rel;
  }
  return p;
}

function toAbsolute(root: string, p: string): string {
  if (p === ROOT_SENTINEL) {
    return root;
  }
  return path.isAbsolute(p) ? p : path.join(root, p);
}

/**
 * Preserve `isAudited`/`isHidden` from previously tracked functions when a file
 * is re-extracted (line numbers shift as code is edited).
 *
 * Each existing entry is consumed at most once, so Solidity overloads that share
 * a display name — `deposit(uint256)` and `deposit(uint256,address)` both named
 * `Vault.deposit` — cannot both inherit the same audit flag. Exact id matches are
 * paired first; remaining functions match positionally among same-named entries.
 */
export function mergeFunctions(
  existing: FunctionState[],
  incoming: FunctionState[]
): FunctionState[] {
  const byId = new Map<string, FunctionState>();
  const byName = new Map<string, FunctionState[]>();
  for (const fn of existing) {
    byId.set(fn.id, fn);
    const sameName = byName.get(fn.name);
    if (sameName) {
      sameName.push(fn);
    } else {
      byName.set(fn.name, [fn]);
    }
  }

  const consumed = new Set<FunctionState>();
  const inherit = (fn: FunctionState, from: FunctionState): FunctionState => {
    consumed.add(from);
    return { ...fn, isAudited: from.isAudited, isHidden: from.isHidden };
  };

  return incoming.map((fn) => {
    const byExactId = byId.get(fn.id);
    if (byExactId && !consumed.has(byExactId)) {
      return inherit(fn, byExactId);
    }

    const sameName = byName.get(fn.name);
    const byPosition = sameName?.find((candidate) => !consumed.has(candidate));
    if (byPosition) {
      return inherit(fn, byPosition);
    }

    return fn;
  });
}

/**
 * Validate and migrate a parsed state object into the current schema. Defensive
 * against arbitrary JSON: every field is type-checked and defaulted, and unknown
 * shapes collapse to empty rather than throwing.
 */
export function normalizeState(input: unknown): AuditrackerState {
  const state = (input && typeof input === "object" ? input : {}) as Record<
    string,
    unknown
  >;

  const unique = (values: string[]): string[] => [...new Set(values)];
  const stringList = (value: unknown): string[] =>
    Array.isArray(value)
      ? unique(
          value.filter((p): p is string => typeof p === "string" && p.length > 0)
        )
      : [];

  const scopePaths = stringList(state.scopePaths);
  const excludedPaths = stringList(state.excludedPaths);

  const files: Record<string, ScopedFile> = {};
  if (state.files && typeof state.files === "object") {
    for (const [filePath, rawFile] of Object.entries(
      state.files as Record<string, unknown>
    )) {
      if (!rawFile || typeof rawFile !== "object") {
        continue;
      }
      const file = rawFile as Record<string, unknown>;

      const relativePath =
        typeof file.relativePath === "string" && file.relativePath.length > 0
          ? file.relativePath
          : path.basename(filePath);

      const functions: FunctionState[] = Array.isArray(file.functions)
        ? file.functions
            .filter((fn): fn is Record<string, unknown> =>
              Boolean(fn) && typeof fn === "object"
            )
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

              // Migrate old schema: isReviewed or readCount > 0 mean audited.
              const isAudited =
                Boolean(fn.isAudited) ||
                Boolean(fn.isReviewed) ||
                (typeof fn.readCount === "number" && fn.readCount > 0);

              return {
                id: makeFunctionId(filePath, name, startLine),
                name,
                filePath,
                startLine,
                endLine: Math.max(endLine, startLine),
                isAudited,
                isHidden: Boolean(fn.isHidden),
              };
            })
        : [];

      files[filePath] = { filePath, relativePath, functions };
    }
  }

  const migrateActionType = (type: string): string => {
    if (type === "functionRead" || type === "functionReviewed")
      return "functionAudited";
    if (type === "fileRead" || type === "fileReviewed") return "fileAudited";
    return type;
  };

  const progressHistory: DailyProgress[] = Array.isArray(state.progressHistory)
    ? state.progressHistory
        .filter((entry): entry is Record<string, unknown> =>
          Boolean(entry) && typeof entry === "object"
        )
        .map((entry) => {
          const date = typeof entry.date === "string" ? entry.date : "unknown";

          const actions = Array.isArray(entry.actions)
            ? entry.actions
                .filter((a): a is Record<string, unknown> =>
                  Boolean(a) && typeof a === "object"
                )
                .filter(
                  (a) =>
                    a.type === "functionAudited" ||
                    a.type === "fileAudited" ||
                    a.type === "functionRead" ||
                    a.type === "functionReviewed" ||
                    a.type === "fileRead" ||
                    a.type === "fileReviewed"
                )
                .map((a) => ({
                  type: migrateActionType(a.type as string) as
                    | "functionAudited"
                    | "fileAudited",
                  filePath:
                    typeof a.filePath === "string" ? a.filePath : "unknown",
                  functionName:
                    typeof a.functionName === "string"
                      ? a.functionName
                      : undefined,
                  lineCount:
                    typeof a.lineCount === "number" &&
                    Number.isFinite(a.lineCount)
                      ? a.lineCount
                      : undefined,
                }))
            : [];

          const toNum = (key: string): number =>
            typeof entry[key] === "number" && Number.isFinite(entry[key])
              ? (entry[key] as number)
              : 0;

          return {
            date,
            functionsAudited:
              toNum("functionsAudited") +
              toNum("functionsRead") +
              toNum("functionsReviewed"),
            linesAudited:
              toNum("linesAudited") +
              toNum("linesRead") +
              toNum("linesReviewed"),
            filesAudited:
              toNum("filesAudited") +
              toNum("filesRead") +
              toNum("filesReviewed"),
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
      typeof state.lastModified === "number"
        ? state.lastModified
        : createDefaultState().lastModified,
  };
}

function remapFileEntry(
  file: ScopedFile,
  newFilePath: string,
  newRelativePath: string
): ScopedFile {
  return {
    filePath: newFilePath,
    relativePath: newRelativePath,
    functions: file.functions.map((fn) => ({
      ...fn,
      filePath: newFilePath,
      id: makeFunctionId(newFilePath, fn.name, fn.startLine),
    })),
  };
}

/** Convert a fully-absolute in-memory state into the relative form stored on disk. */
export function toStoredState(
  state: AuditrackerState,
  root: string | undefined
): AuditrackerState {
  if (!root) {
    return state;
  }
  const rel = (p: string): string => toRelative(root, p);

  const files: Record<string, ScopedFile> = {};
  for (const [key, file] of Object.entries(state.files)) {
    const relPath = rel(key);
    files[relPath] = remapFileEntry(file, relPath, file.relativePath);
  }

  return {
    ...state,
    scopePaths: state.scopePaths.map(rel),
    excludedPaths: state.excludedPaths.map(rel),
    activeFilePath: state.activeFilePath ? rel(state.activeFilePath) : null,
    files,
  };
}

/** Parse-time: normalize a raw object and resolve all stored paths to absolute. */
export function fromStoredState(
  input: unknown,
  root: string | undefined
): AuditrackerState {
  const normalized = normalizeState(input);
  if (!root) {
    return normalized;
  }
  const abs = (p: string): string => toAbsolute(root, p);

  const files: Record<string, ScopedFile> = {};
  for (const [key, file] of Object.entries(normalized.files)) {
    const absPath = abs(key);
    files[absPath] = remapFileEntry(file, absPath, file.relativePath);
  }

  return {
    ...normalized,
    scopePaths: normalized.scopePaths.map(abs),
    excludedPaths: normalized.excludedPaths.map(abs),
    activeFilePath: normalized.activeFilePath
      ? abs(normalized.activeFilePath)
      : null,
    files,
  };
}

/**
 * Move audit state from `oldPath` to `newPath` after a rename, covering both a
 * single file and a renamed directory (any path under `oldPath` is re-rooted).
 * Returns true if anything matched, so callers can skip a needless save.
 */
export function remapRenamedPath(
  state: AuditrackerState,
  oldPath: string,
  newPath: string,
  root: string | undefined
): boolean {
  const remap = (p: string): string | null => {
    if (p === oldPath) return newPath;
    if (p.startsWith(oldPath + path.sep)) {
      return newPath + p.slice(oldPath.length);
    }
    return null;
  };
  const relativeTo = (p: string): string =>
    root && (p === root || p.startsWith(root + path.sep))
      ? path.relative(root, p)
      : path.basename(p);

  let changed = false;

  const files: Record<string, ScopedFile> = {};
  for (const [key, file] of Object.entries(state.files)) {
    const mapped = remap(key);
    if (mapped) {
      changed = true;
      files[mapped] = remapFileEntry(file, mapped, relativeTo(mapped));
    } else {
      files[key] = file;
    }
  }
  state.files = files;

  const remapList = (list: string[]): string[] =>
    list.map((p) => {
      const mapped = remap(p);
      if (mapped) {
        changed = true;
        return mapped;
      }
      return p;
    });
  state.scopePaths = remapList(state.scopePaths);
  state.excludedPaths = remapList(state.excludedPaths);

  if (state.activeFilePath) {
    const mapped = remap(state.activeFilePath);
    if (mapped) {
      changed = true;
      state.activeFilePath = mapped;
    }
  }

  return changed;
}
