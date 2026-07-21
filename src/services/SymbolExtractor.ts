import * as vscode from "vscode";
import { FunctionState } from "../models/types";
import { makeFunctionId } from "./stateCore";

export class SymbolExtractor {
  /**
   * Extract all function-like symbols from a file, using
   * vscode.executeDocumentSymbolProvider for language-agnostic extraction.
   *
   * Returns `null` when the symbol provider is unavailable — the language server
   * is not ready, crashed, or absent — so callers can keep the file's existing
   * audit state instead of mistaking a transient failure for "no functions".
   * Returns `[]` only when the provider genuinely reports no symbols.
   */
  async extractSymbols(filePath: string): Promise<FunctionState[] | null> {
    const uri = vscode.Uri.file(filePath);

    try {
      // Open the document first to ensure the language server is active.
      await vscode.workspace.openTextDocument(uri);

      const symbols = await vscode.commands.executeCommand<
        vscode.DocumentSymbol[] | undefined
      >("vscode.executeDocumentSymbolProvider", uri);

      if (!Array.isArray(symbols)) {
        return null;
      }

      return this.flattenSymbols(symbols, filePath);
    } catch {
      return null;
    }
  }

  /**
   * Recursively flatten nested symbols (e.g., methods inside classes)
   * Filter to only function-like symbols
   */
  private flattenSymbols(
    symbols: vscode.DocumentSymbol[],
    filePath: string,
    parentName?: string
  ): FunctionState[] {
    const results: FunctionState[] = [];

    for (const symbol of symbols) {
      // Prefix with parent name (e.g., "ClassName.methodName")
      const displayName = parentName
        ? `${parentName}.${symbol.name}`
        : symbol.name;

      // Include Functions, Methods, Constructors only
      if (this.isFunctionLike(symbol.kind)) {
        results.push({
          id: makeFunctionId(filePath, displayName, symbol.range.start.line),
          name: displayName,
          filePath,
          startLine: symbol.range.start.line,
          endLine: symbol.range.end.line,
          isAudited: false,
          isHidden: false,
        });
      }

      // Recurse into children (e.g., class methods)
      if (symbol.children && symbol.children.length > 0) {
        const childParentName = this.isContainerLike(symbol.kind)
          ? displayName
          : parentName;
        results.push(
          ...this.flattenSymbols(symbol.children, filePath, childParentName)
        );
      }
    }

    return results;
  }

  private static readonly FUNCTION_KINDS = new Set([
    vscode.SymbolKind.Function,
    vscode.SymbolKind.Method,
    vscode.SymbolKind.Constructor,
  ]);

  private static readonly CONTAINER_KINDS = new Set([
    vscode.SymbolKind.Class,
    vscode.SymbolKind.Interface,
    vscode.SymbolKind.Module,
    vscode.SymbolKind.Namespace,
    vscode.SymbolKind.Struct,
    vscode.SymbolKind.Enum,
    vscode.SymbolKind.Object,
  ]);

  private isFunctionLike(kind: vscode.SymbolKind): boolean {
    return SymbolExtractor.FUNCTION_KINDS.has(kind);
  }

  private isContainerLike(kind: vscode.SymbolKind): boolean {
    return SymbolExtractor.CONTAINER_KINDS.has(kind);
  }
}
