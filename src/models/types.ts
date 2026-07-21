/**
 * Represents the tracking state for a single function/symbol
 */
export interface FunctionState {
  /** Unique identifier: filePath#symbolName#lineNumber */
  id: string;
  /** Display name of the function/modifier */
  name: string;
  /** Absolute file path */
  filePath: string;
  /** Line number where function starts (0-indexed) */
  startLine: number;
  /** Line number where function ends (0-indexed) */
  endLine: number;
  /** Whether the function has been marked as audited */
  isAudited: boolean;
  /** Whether this function is hidden from the panel */
  isHidden: boolean;
}

/**
 * Represents a file in scope with its functions
 */
export interface ScopedFile {
  /** Absolute file path */
  filePath: string;
  /** Relative path for display */
  relativePath: string;
  /** Functions extracted from this file */
  functions: FunctionState[];
}

/**
 * Represents a single tracked action for daily progress
 */
export interface DailyProgressAction {
  /** Type of action performed */
  type: "functionAudited" | "fileAudited";
  /** Relative path to file */
  filePath: string;
  /** Function name (for function actions) */
  functionName?: string;
  /** Line count of the function (for function actions) */
  lineCount?: number;
}

/**
 * Represents daily progress tracking
 */
export interface DailyProgress {
  /** Date in YYYY-MM-DD format */
  date: string;
  /** Functions marked audited this day */
  functionsAudited: number;
  /** Total lines of code audited this day */
  linesAudited: number;
  /** Files fully audited this day */
  filesAudited: number;
  /** Detailed log of actions */
  actions: DailyProgressAction[];
}

/**
 * Root state object persisted to JSON
 */
export interface AuditrackerState {
  /** Version for future migrations */
  version: number;
  /** List of paths (files/folders) marked as in-scope */
  scopePaths: string[];
  /** List of explicit file paths excluded from scope */
  excludedPaths: string[];
  /** Currently selected file in the Active File panel */
  activeFilePath: string | null;
  /** Map of file path to its scoped data */
  files: Record<string, ScopedFile>;
  /** Daily progress history */
  progressHistory: DailyProgress[];
  /** Timestamp of last state change */
  lastModified: number;
}

export const STATE_VERSION = 1;

export function createDefaultState(): AuditrackerState {
  return {
    version: STATE_VERSION,
    scopePaths: [],
    excludedPaths: [],
    activeFilePath: null,
    files: {},
    progressHistory: [],
    lastModified: Date.now(),
  };
}
