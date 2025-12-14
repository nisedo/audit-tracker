import * as vscode from "vscode";
import * as path from "path";
import { StateManager } from "./services/StateManager";
import { ScopeManager } from "./services/ScopeManager";
import { SymbolExtractor } from "./services/SymbolExtractor";
import {
  AuditTreeProvider,
  FunctionTreeItem,
  FileTreeItem,
} from "./providers/AuditTreeProvider";
import { ScopeDecorationProvider } from "./providers/ScopeDecorationProvider";
import { NotesTreeProvider, NoteTreeItem } from "./providers/NotesTreeProvider";
import {
  NoteDecorationProvider,
  NoteHoverProvider,
} from "./providers/NoteDecorationProvider";
import { FunctionState, AuditNote } from "./models/types";

/**
 * Load scope from SCOPE.txt or SCOPE.md file if present
 */
async function loadScopeFile(
  workspaceRoot: string | undefined,
  scopeManager: ScopeManager,
  stateManager: StateManager
): Promise<number> {
  if (!workspaceRoot) {
    return 0;
  }

  const scopeFiles = ["SCOPE.txt", "SCOPE.md"];
  let scopeContent: string | undefined;

  for (const filename of scopeFiles) {
    const scopeUri = vscode.Uri.file(path.join(workspaceRoot, filename));
    try {
      const content = await vscode.workspace.fs.readFile(scopeUri);
      scopeContent = content.toString();
      break;
    } catch {
      // File doesn't exist, try next
    }
  }

  if (!scopeContent) {
    return 0;
  }

  // Parse the scope file - each line is a file/folder path
  const lines = scopeContent.split("\n");
  let addedFiles = 0;

  for (const line of lines) {
    // Clean the line and skip empty/comment lines
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) {
      continue;
    }

    // Resolve relative path to absolute
    const filePath = path.isAbsolute(trimmed)
      ? trimmed
      : path.join(workspaceRoot, trimmed);

    try {
      const uri = vscode.Uri.file(filePath);
      const files = await scopeManager.addToScope(uri);
      addedFiles += files.length;
    } catch {
      // Skip invalid paths
    }
  }

  if (addedFiles > 0) {
    await stateManager.save();
  }

  return addedFiles;
}

let stateManager: StateManager;
let scopeManager: ScopeManager;
let symbolExtractor: SymbolExtractor;
let treeProvider: AuditTreeProvider;
let decorationProvider: ScopeDecorationProvider;
let notesTreeProvider: NotesTreeProvider;
let noteDecorationProvider: NoteDecorationProvider;

export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  // Initialize services
  stateManager = new StateManager(workspaceRoot);
  await stateManager.load();

  symbolExtractor = new SymbolExtractor();
  scopeManager = new ScopeManager(stateManager, symbolExtractor, workspaceRoot);
  treeProvider = new AuditTreeProvider(stateManager);
  decorationProvider = new ScopeDecorationProvider(stateManager);

  // Register file decoration provider
  context.subscriptions.push(
    vscode.window.registerFileDecorationProvider(decorationProvider)
  );

  // Initialize notes providers
  notesTreeProvider = new NotesTreeProvider(stateManager, workspaceRoot);
  noteDecorationProvider = new NoteDecorationProvider(stateManager);

  // Register hover provider for line notes (all file types)
  const noteHoverProvider = new NoteHoverProvider(stateManager);
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { scheme: "file" },
      noteHoverProvider
    )
  );

  // Load scope from SCOPE.txt or SCOPE.md if present and state is empty
  if (stateManager.getScopePaths().length === 0) {
    const addedFiles = await loadScopeFile(
      workspaceRoot,
      scopeManager,
      stateManager
    );
    if (addedFiles > 0) {
      treeProvider.refresh();
      decorationProvider.refreshAll();
    }
  }

  // Register tree view
  const treeView = vscode.window.createTreeView("auditTracker.scopeView", {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });

  // Register notes tree view
  const notesTreeView = vscode.window.createTreeView("auditTracker.notesView", {
    treeDataProvider: notesTreeProvider,
    showCollapseAll: true,
  });

  // Update note decorations when active editor changes
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      noteDecorationProvider.setActiveEditor(editor);
    })
  );

  // Initial decoration update
  noteDecorationProvider.setActiveEditor(vscode.window.activeTextEditor);

  // Register commands
  context.subscriptions.push(
    // Add to scope
    vscode.commands.registerCommand(
      "auditTracker.addToScope",
      async (uri: vscode.Uri) => {
        if (!uri) {
          vscode.window.showErrorMessage("No file or folder selected");
          return;
        }

        const files = await scopeManager.addToScope(uri);
        await stateManager.save();
        treeProvider.refresh();
        decorationProvider.refresh(files.map((f) => vscode.Uri.file(f)));

        const functionCount = stateManager
          .getAllFiles()
          .reduce((sum, f) => sum + f.functions.length, 0);
        vscode.window.showInformationMessage(
          `Added ${files.length} file(s) to scope (${functionCount} functions)`
        );
      }
    ),

    // Remove from scope (from explorer context menu)
    vscode.commands.registerCommand(
      "auditTracker.removeFromScope",
      async (uriOrItem: vscode.Uri | FileTreeItem) => {
        let uri: vscode.Uri;

        if (uriOrItem instanceof FileTreeItem) {
          uri = vscode.Uri.file(uriOrItem.scopedFile.filePath);
          // Remove just this file from state
          stateManager.removeFile(uriOrItem.scopedFile.filePath);
        } else if (uriOrItem) {
          uri = uriOrItem;
          await scopeManager.removeFromScope(uri);
        } else {
          vscode.window.showErrorMessage("No file or folder selected");
          return;
        }

        await stateManager.save();
        treeProvider.refresh();
        decorationProvider.refresh([uri]);
        vscode.window.showInformationMessage("Removed from scope");
      }
    ),

    // Mark as read
    vscode.commands.registerCommand(
      "auditTracker.markRead",
      async (item: FunctionTreeItem) => {
        if (!item?.functionState) {
          return;
        }

        stateManager.setRead(item.functionState.id, true);
        await stateManager.save();
        treeProvider.refresh();
      }
    ),

    // Unmark read
    vscode.commands.registerCommand(
      "auditTracker.unmarkRead",
      async (item: FunctionTreeItem) => {
        if (!item?.functionState) {
          return;
        }

        stateManager.setRead(item.functionState.id, false);
        await stateManager.save();
        treeProvider.refresh();
      }
    ),

    // Mark as reviewed
    vscode.commands.registerCommand(
      "auditTracker.markReviewed",
      async (item: FunctionTreeItem) => {
        if (!item?.functionState) {
          return;
        }

        stateManager.setReviewed(item.functionState.id, true);
        await stateManager.save();
        treeProvider.refresh();
      }
    ),

    // Unmark reviewed
    vscode.commands.registerCommand(
      "auditTracker.unmarkReviewed",
      async (item: FunctionTreeItem) => {
        if (!item?.functionState) {
          return;
        }

        stateManager.setReviewed(item.functionState.id, false);
        await stateManager.save();
        treeProvider.refresh();
      }
    ),

    // Mark as entrypoint
    vscode.commands.registerCommand(
      "auditTracker.markEntrypoint",
      async (item: FunctionTreeItem) => {
        if (!item?.functionState) {
          return;
        }

        stateManager.setEntrypoint(item.functionState.id, true);
        await stateManager.save();
        treeProvider.refresh();
      }
    ),

    // Unmark entrypoint
    vscode.commands.registerCommand(
      "auditTracker.unmarkEntrypoint",
      async (item: FunctionTreeItem) => {
        if (!item?.functionState) {
          return;
        }

        stateManager.setEntrypoint(item.functionState.id, false);
        await stateManager.save();
        treeProvider.refresh();
      }
    ),

    // Refresh view
    vscode.commands.registerCommand("auditTracker.refresh", async () => {
      await scopeManager.refreshAllSymbols();
      await stateManager.save();
      treeProvider.refresh();
    }),

    // Load scope from SCOPE.txt or SCOPE.md file
    vscode.commands.registerCommand("auditTracker.loadScopeFile", async () => {
      const addedFiles = await loadScopeFile(
        workspaceRoot,
        scopeManager,
        stateManager
      );
      if (addedFiles > 0) {
        treeProvider.refresh();
        decorationProvider.refreshAll();
        vscode.window.showInformationMessage(
          `Loaded ${addedFiles} file(s) from SCOPE file`
        );
      } else {
        vscode.window.showWarningMessage(
          "No SCOPE.txt or SCOPE.md file found, or no new files to add"
        );
      }
    }),

    // Go to function
    vscode.commands.registerCommand(
      "auditTracker.goToFunction",
      async (func: FunctionState) => {
        if (!func) {
          return;
        }

        const uri = vscode.Uri.file(func.filePath);
        const document = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(document);

        const position = new vscode.Position(func.startLine, 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(
          new vscode.Range(position, position),
          vscode.TextEditorRevealType.InCenter
        );

        // Temporarily highlight the function
        const highlightDecoration =
          vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor(
              "editor.findMatchHighlightBackground"
            ),
            isWholeLine: true,
          });
        const range = new vscode.Range(func.startLine, 0, func.endLine, 0);
        editor.setDecorations(highlightDecoration, [range]);

        // Remove highlight after 1 second
        setTimeout(() => {
          highlightDecoration.dispose();
        }, 800);
      }
    ),

    // Clear all state
    vscode.commands.registerCommand("auditTracker.clearAllState", async () => {
      // Get all files before clearing to refresh their decorations
      const allFiles = stateManager
        .getAllFiles()
        .map((f) => vscode.Uri.file(f.filePath));

      const confirm = await vscode.window.showWarningMessage(
        "Clear all audit tracking state? This cannot be undone.",
        { modal: true },
        "Yes, Clear All"
      );

      if (confirm === "Yes, Clear All") {
        stateManager.clearAllState();
        await stateManager.save();
        treeProvider.refresh();
        notesTreeProvider.refresh();
        decorationProvider.refresh(allFiles);
        noteDecorationProvider.updateDecorations();
        vscode.window.showInformationMessage("AuditTracker state cleared");
      }
    }),

    // Open codebase notes file
    vscode.commands.registerCommand(
      "auditTracker.addCodebaseNote",
      async () => {
        if (!workspaceRoot) {
          vscode.window.showErrorMessage("No workspace folder open");
          return;
        }

        const repoName = path.basename(workspaceRoot);
        const notesFileName = `${repoName}-audittracker-notes.md`;
        const notesPath = path.join(workspaceRoot, ".vscode", notesFileName);
        const notesUri = vscode.Uri.file(notesPath);

        // Ensure .vscode directory exists
        const vscodeDir = vscode.Uri.file(path.join(workspaceRoot, ".vscode"));
        try {
          await vscode.workspace.fs.createDirectory(vscodeDir);
        } catch {
          // Directory may already exist
        }

        // Create file if it doesn't exist
        try {
          await vscode.workspace.fs.stat(notesUri);
        } catch {
          const header = `# ${repoName} - Audit Notes\n\n`;
          await vscode.workspace.fs.writeFile(notesUri, Buffer.from(header));
        }

        // Open the file
        const doc = await vscode.workspace.openTextDocument(notesUri);
        await vscode.window.showTextDocument(doc);
      }
    ),

    // Go to line note
    vscode.commands.registerCommand(
      "auditTracker.goToLineNote",
      async (note: AuditNote) => {
        if (!note || note.type !== "line") {
          return;
        }

        const uri = vscode.Uri.file(note.filePath);
        const document = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(document);

        const position = new vscode.Position(note.line, 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(
          new vscode.Range(position, position),
          vscode.TextEditorRevealType.InCenter
        );

        // Temporarily highlight the line
        const highlightDecoration =
          vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor(
              "editor.findMatchHighlightBackground"
            ),
            isWholeLine: true,
          });
        const range = new vscode.Range(note.line, 0, note.line, 0);
        editor.setDecorations(highlightDecoration, [range]);

        // Remove highlight after 800ms
        setTimeout(() => {
          highlightDecoration.dispose();
        }, 800);
      }
    ),

    // Add line note
    vscode.commands.registerCommand("auditTracker.addLineNote", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active editor");
        return;
      }

      const line = editor.selection.active.line;
      const filePath = editor.document.uri.fsPath;

      const content = await vscode.window.showInputBox({
        prompt: `Add note for line ${line + 1}`,
        placeHolder: "Your line note...",
      });

      if (content) {
        const note: AuditNote = {
          id: `line-${Date.now()}`,
          type: "line",
          filePath,
          line,
          content,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        stateManager.addNote(note);
        await stateManager.save();
        notesTreeProvider.refresh();
        noteDecorationProvider.updateDecorations();
      }
    }),

    // Edit note
    vscode.commands.registerCommand(
      "auditTracker.editNote",
      async (noteOrItem: AuditNote | NoteTreeItem) => {
        const note =
          noteOrItem instanceof NoteTreeItem ? noteOrItem.note : noteOrItem;
        if (!note) {
          return;
        }

        const content = await vscode.window.showInputBox({
          prompt: "Edit note",
          value: note.content,
        });

        if (content !== undefined) {
          stateManager.updateNote(note.id, content);
          await stateManager.save();
          notesTreeProvider.refresh();
          noteDecorationProvider.updateDecorations();
        }
      }
    ),

    // Delete note
    vscode.commands.registerCommand(
      "auditTracker.deleteNote",
      async (item: NoteTreeItem) => {
        if (!item?.note) {
          return;
        }

        const confirm = await vscode.window.showWarningMessage(
          "Delete this note?",
          "Yes",
          "No"
        );

        if (confirm === "Yes") {
          stateManager.deleteNote(item.note.id);
          await stateManager.save();
          notesTreeProvider.refresh();
          noteDecorationProvider.updateDecorations();
        }
      }
    ),

    // Refresh notes
    vscode.commands.registerCommand("auditTracker.refreshNotes", () => {
      notesTreeProvider.refresh();
      noteDecorationProvider.updateDecorations();
    }),

    treeView,
    notesTreeView
  );

  // Watch for file changes to update symbols
  const fileWatcher = vscode.workspace.createFileSystemWatcher("**/*");

  fileWatcher.onDidChange(async (uri) => {
    if (scopeManager.isInScope(uri.fsPath)) {
      await scopeManager.refreshFileSymbols(uri.fsPath);
      await stateManager.save();
      treeProvider.refresh();
    }
  });

  fileWatcher.onDidDelete(async (uri) => {
    if (scopeManager.isInScope(uri.fsPath)) {
      stateManager.removeFile(uri.fsPath);
      await stateManager.save();
      treeProvider.refresh();
    }
  });

  context.subscriptions.push(fileWatcher);
}

export function deactivate(): void {
  // Cleanup if needed
}
