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
  /** Number of times the function has been read */
  readCount: number;
  /** Whether the function has been marked as fully reviewed */
  isReviewed: boolean;
  /** Whether this function is marked as an entrypoint */
  isEntrypoint: boolean;
  /** Whether this function is marked as important/high-priority */
  isImportant: boolean;
  /** Whether this function is hidden from the panel */
  isHidden: boolean;
  /** Symbol kind from VSCode (Function, Method, etc.) */
  symbolKind: number;
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
  /** Last time symbols were extracted */
  lastUpdated: number;
}

/**
 * Represents a single tracked action for daily progress
 */
export interface DailyProgressAction {
  /** Type of action performed */
  type: "functionRead" | "functionReviewed" | "fileRead" | "fileReviewed";
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
  /** Functions marked read this day */
  functionsRead: number;
  /** Functions marked reviewed this day */
  functionsReviewed: number;
  /** Total lines of code read this day */
  linesRead: number;
  /** Total lines of code reviewed this day */
  linesReviewed: number;
  /** Files fully read this day */
  filesRead: number;
  /** Files fully reviewed this day */
  filesReviewed: number;
  /** Detailed log of actions */
  actions: DailyProgressAction[];
}

/**
 * Root state object persisted to JSON
 */
export interface AuditTrackerState {
  /** Version for future migrations */
  version: number;
  /** List of paths (files/folders) marked as in-scope */
  scopePaths: string[];
  /** Map of file path to its scoped data */
  files: Record<string, ScopedFile>;
  /** Daily progress history */
  progressHistory: DailyProgress[];
  /** Timestamp of last state change */
  lastModified: number;
}

/**
 * Default empty state
 */
export const DEFAULT_STATE: AuditTrackerState = {
  version: 1,
  scopePaths: [],
  files: {},
  progressHistory: [],
  lastModified: Date.now(),
};
