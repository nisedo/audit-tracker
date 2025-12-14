import * as vscode from "vscode";
import { FunctionState } from "../models/types";

export class SymbolExtractor {
  /**
   * Extract all function-like symbols from a file
   * Uses vscode.executeDocumentSymbolProvider command for language-agnostic extraction
   */
  async extractSymbols(filePath: string): Promise<FunctionState[]> {
    const uri = vscode.Uri.file(filePath);

    try {
      // Open the document first to ensure language server is active
      await vscode.workspace.openTextDocument(uri);

      // Execute the built-in document symbol provider
      const symbols = await vscode.commands.executeCommand<
        vscode.DocumentSymbol[]
      >("vscode.executeDocumentSymbolProvider", uri);

      if (!symbols || symbols.length === 0) {
        return [];
      }

      const result = this.flattenSymbols(symbols, filePath);

      // Deduplicate symbols (multiple providers may return the same symbols)
      return this.deduplicateSymbols(result);
    } catch {
      return [];
    }
  }

  /**
   * Deduplicate symbols by line number
   * Keeps the first symbol found at each line (handles multiple providers)
   */
  private deduplicateSymbols(symbols: FunctionState[]): FunctionState[] {
    const seen = new Set<number>();
    const unique: FunctionState[] = [];

    for (const symbol of symbols) {
      if (!seen.has(symbol.startLine)) {
        seen.add(symbol.startLine);
        unique.push(symbol);
      }
    }

    return unique;
  }

  /**
   * Clean up symbol name for Solidity files
   * Removes metadata like " (  complex: 4 state: ☑ )" appended by solidity-visual-auditor
   */
  private cleanSymbolName(name: string, filePath: string): string {
    if (filePath.endsWith(".sol")) {
      // Remove " (  complex: X state: ☑/☐ )" pattern from Solidity symbols
      // Pattern: " ( " + " complex: " + number + " state: " + checkbox + " )"
      return name.replace(/\s*\(\s*complex:\s*\d+\s*state:\s*[☑☐]\s*\)\s*$/u, "").trim();
    }
    return name;
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
      const cleanName = this.cleanSymbolName(symbol.name, filePath);
      const displayName = parentName
        ? `${parentName}.${cleanName}`
        : cleanName;

      // Include Functions, Methods, Constructors
      if (this.isFunctionLike(symbol.kind)) {
        results.push({
          id: `${filePath}#${displayName}#${symbol.range.start.line}`,
          name: displayName,
          filePath,
          startLine: symbol.range.start.line,
          endLine: symbol.range.end.line,
          readCount: 0,
          isReviewed: false,
          isEntrypoint: false,
          symbolKind: symbol.kind,
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

  /**
   * Check if symbol kind represents a function-like construct
   * Includes various kinds that different languages might use for functions/methods
   */
  private isFunctionLike(kind: vscode.SymbolKind): boolean {
    return [
      vscode.SymbolKind.Function,
      vscode.SymbolKind.Method,
      vscode.SymbolKind.Constructor,
      vscode.SymbolKind.Event,      // Solidity events/modifiers might use this
      vscode.SymbolKind.Operator,   // Some languages use this for operators
      vscode.SymbolKind.Property,   // Getters/setters in some languages
    ].includes(kind);
  }

  /**
   * Check if symbol kind represents a container (class, interface, etc.)
   */
  private isContainerLike(kind: vscode.SymbolKind): boolean {
    return [
      vscode.SymbolKind.Class,
      vscode.SymbolKind.Interface,
      vscode.SymbolKind.Module,
      vscode.SymbolKind.Namespace,
      vscode.SymbolKind.Struct,
      vscode.SymbolKind.Enum,
      vscode.SymbolKind.Object,
    ].includes(kind);
  }
}
