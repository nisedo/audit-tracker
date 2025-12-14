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
 * Base note interface
 */
export interface BaseNote {
  /** Unique identifier */
  id: string;
  /** Note content (markdown) */
  content: string;
  /** Creation timestamp */
  createdAt: number;
  /** Last update timestamp */
  updatedAt: number;
}

/**
 * Note attached to the entire codebase
 */
export interface CodebaseNote extends BaseNote {
  type: "codebase";
}

/**
 * Note attached to a specific file
 */
export interface FileNote extends BaseNote {
  type: "file";
  filePath: string;
}

/**
 * Note attached to a specific function
 */
export interface FunctionNote extends BaseNote {
  type: "function";
  filePath: string;
  functionId: string;
}

/**
 * Note attached to a specific line
 */
export interface LineNote extends BaseNote {
  type: "line";
  filePath: string;
  line: number;
}

/**
 * Union type for all note types
 */
export type AuditNote = CodebaseNote | FileNote | FunctionNote | LineNote;

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
  /** All notes */
  notes: AuditNote[];
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
  notes: [],
  lastModified: Date.now(),
};
