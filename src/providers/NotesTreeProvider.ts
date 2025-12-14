import * as vscode from "vscode";
import * as path from "path";
import { StateManager } from "../services/StateManager";
import { AuditNote } from "../models/types";

/**
 * Tree item for opening the codebase notes markdown file
 */
export class CodebaseNotesItem extends vscode.TreeItem {
  constructor(workspaceRoot: string | undefined) {
    super("Codebase Notes", vscode.TreeItemCollapsibleState.None);

    this.iconPath = new vscode.ThemeIcon("notebook");
    this.contextValue = "codebaseNotes";

    // Show dynamic filename based on repo name
    const repoName = workspaceRoot ? path.basename(workspaceRoot) : "workspace";
    this.description = `${repoName}-audittracker-notes.md`;

    // Click to open the notes file
    this.command = {
      command: "auditTracker.addCodebaseNote",
      title: "Open Codebase Notes",
    };
  }
}

/**
 * Tree item representing the Line Notes category
 */
export class LineNotesCategoryItem extends vscode.TreeItem {
  constructor(public readonly noteCount: number) {
    super(
      `Line Notes (${noteCount})`,
      noteCount > 0
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None
    );

    this.iconPath = new vscode.ThemeIcon("location");
    this.contextValue = "lineNotesCategory";
  }
}

/**
 * Tree item representing a line location with notes
 */
export class LineNoteGroupItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly noteCount: number,
    public readonly filePath: string,
    public readonly line: number
  ) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);

    this.description = `${noteCount} note${noteCount > 1 ? "s" : ""}`;
    this.iconPath = new vscode.ThemeIcon("location");
    this.contextValue = "lineNoteGroup";
  }
}

/**
 * Tree item representing a single note
 */
export class NoteTreeItem extends vscode.TreeItem {
  constructor(public readonly note: AuditNote) {
    // Show first line of content as label, truncated
    const preview = note.content.split("\n")[0].substring(0, 50);
    const truncated = preview.length < note.content.split("\n")[0].length;
    super(truncated ? `${preview}...` : preview, vscode.TreeItemCollapsibleState.None);

    this.tooltip = note.content;
    this.description = new Date(note.updatedAt).toLocaleDateString();
    this.iconPath = new vscode.ThemeIcon("note");
    this.contextValue = "note";

    // Click to go to the line
    if (note.type === "line") {
      this.command = {
        command: "auditTracker.goToLineNote",
        title: "Go to Line",
        arguments: [note],
      };
    }
  }
}

/**
 * Tree data provider for the notes sidebar
 */
export class NotesTreeProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    vscode.TreeItem | undefined
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(
    private stateManager: StateManager,
    private workspaceRoot: string | undefined
  ) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (!element) {
      // Root level: return codebase notes and line notes category
      const lineNotes = this.stateManager.getNotes().filter((n) => n.type === "line");
      return [
        new CodebaseNotesItem(this.workspaceRoot),
        new LineNotesCategoryItem(lineNotes.length),
      ];
    }

    if (element instanceof LineNotesCategoryItem) {
      return this.getLineNoteGroups();
    }

    if (element instanceof LineNoteGroupItem) {
      return this.getNotesForLine(element.filePath, element.line);
    }

    return [];
  }

  private getLineNoteGroups(): LineNoteGroupItem[] {
    const notes = this.stateManager.getNotes().filter((n) => n.type === "line");

    // Group by file:line
    const byLine = new Map<string, AuditNote[]>();
    for (const note of notes) {
      if (note.type === "line") {
        const key = `${note.filePath}:${note.line}`;
        const existing = byLine.get(key) || [];
        existing.push(note);
        byLine.set(key, existing);
      }
    }

    return Array.from(byLine.entries()).map(([, lineNotes]) => {
      const note = lineNotes[0] as AuditNote & { type: "line" };
      const relativePath = this.getRelativePath(note.filePath);
      return new LineNoteGroupItem(
        `${relativePath}:${note.line + 1}`,
        lineNotes.length,
        note.filePath,
        note.line
      );
    });
  }

  private getNotesForLine(filePath: string, line: number): NoteTreeItem[] {
    const notes = this.stateManager.getNotesForLine(filePath, line);
    return notes.map((n) => new NoteTreeItem(n));
  }

  private getRelativePath(filePath: string): string {
    if (this.workspaceRoot && filePath.startsWith(this.workspaceRoot)) {
      return path.relative(this.workspaceRoot, filePath);
    }
    return path.basename(filePath);
  }
}
