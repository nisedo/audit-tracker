import * as vscode from "vscode";
import { StateManager } from "../services/StateManager";

/**
 * Provides hover content for lines with notes
 */
export class NoteHoverProvider implements vscode.HoverProvider {
  constructor(private stateManager: StateManager) {}

  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.Hover | undefined {
    const filePath = document.uri.fsPath;
    const notes = this.stateManager.getNotesForLine(filePath, position.line);

    if (notes.length === 0) {
      return undefined;
    }

    const markdown = new vscode.MarkdownString();
    markdown.appendMarkdown(`**📝 Notes:**\n\n`);
    for (const note of notes) {
      markdown.appendMarkdown(`${note.content}\n\n---\n\n`);
    }
    markdown.isTrusted = true;

    return new vscode.Hover(markdown);
  }
}

/**
 * Provides gutter decorations for lines with notes
 */
export class NoteDecorationProvider {
  private decorationType: vscode.TextEditorDecorationType;
  private activeEditor: vscode.TextEditor | undefined;

  constructor(private stateManager: StateManager) {
    // Create decoration type for notes
    this.decorationType = vscode.window.createTextEditorDecorationType({
      gutterIconPath: this.createNoteIcon(),
      gutterIconSize: "contain",
    });

    this.activeEditor = vscode.window.activeTextEditor;
  }

  private createNoteIcon(): vscode.Uri {
    // Create a simple SVG icon for the gutter
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="#f59e0b">
      <path d="M3 2h10a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1zm1 2v8h8V4H4zm1 1h6v1H5V5zm0 2h6v1H5V7zm0 2h4v1H5V9z"/>
    </svg>`;
    return vscode.Uri.parse(
      `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`
    );
  }

  /**
   * Update decorations for the active editor
   */
  updateDecorations(): void {
    if (!this.activeEditor) {
      return;
    }

    const filePath = this.activeEditor.document.uri.fsPath;
    const lineNotes = this.stateManager.getLineNotesForFile(filePath);

    if (lineNotes.length === 0) {
      this.activeEditor.setDecorations(this.decorationType, []);
      return;
    }

    // Group notes by line and create decorations
    const lineToNotes = new Map<number, string[]>();
    for (const note of lineNotes) {
      if (note.type === "line") {
        const existing = lineToNotes.get(note.line) || [];
        existing.push(note.content);
        lineToNotes.set(note.line, existing);
      }
    }

    const decorations: vscode.DecorationOptions[] = [];
    for (const [line, contents] of lineToNotes) {
      const range = new vscode.Range(line, 0, line, 0);
      const hoverMessage = new vscode.MarkdownString();
      hoverMessage.appendMarkdown(`**Notes:**\n\n`);
      for (const content of contents) {
        hoverMessage.appendMarkdown(`- ${content.split("\n")[0]}\n`);
      }

      decorations.push({
        range,
        hoverMessage,
      });
    }

    this.activeEditor.setDecorations(this.decorationType, decorations);
  }

  /**
   * Set the active editor and update decorations
   */
  setActiveEditor(editor: vscode.TextEditor | undefined): void {
    this.activeEditor = editor;
    this.updateDecorations();
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.decorationType.dispose();
  }
}
