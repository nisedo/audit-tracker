import { test } from "node:test";
import assert from "node:assert/strict";
import * as path from "path";
import { AuditrackerState, FunctionState, createDefaultState } from "../models/types";
import {
  fromStoredState,
  makeFunctionId,
  mergeFunctions,
  normalizeState,
  remapRenamedPath,
  toStoredState,
} from "../services/stateCore";

const ROOT = path.join(path.sep, "home", "auditor", "proj");
const VAULT = path.join(ROOT, "src", "Vault.sol");

function fn(
  filePath: string,
  name: string,
  startLine: number,
  over: Partial<FunctionState> = {}
): FunctionState {
  return {
    id: makeFunctionId(filePath, name, startLine),
    name,
    filePath,
    startLine,
    endLine: startLine + 3,
    isAudited: false,
    isHidden: false,
    ...over,
  };
}

test("mergeFunctions preserves audit state across a line shift", () => {
  const existing = [fn(VAULT, "Vault.deposit", 10, { isAudited: true, isHidden: true })];
  const incoming = [fn(VAULT, "Vault.deposit", 12)]; // same name, new line -> new id
  const merged = mergeFunctions(existing, incoming);
  assert.equal(merged[0].isAudited, true);
  assert.equal(merged[0].isHidden, true);
  assert.equal(merged[0].startLine, 12); // takes the fresh location
});

test("mergeFunctions does not let two overloads share one audit flag", () => {
  // The core Solidity failure mode: two functions named `Vault.deposit`.
  const existing = [
    fn(VAULT, "Vault.deposit", 10, { isAudited: true }),
    fn(VAULT, "Vault.deposit", 20, { isAudited: false }),
  ];
  // A comment added at the top shifts both down; both ids change.
  const incoming = [fn(VAULT, "Vault.deposit", 11), fn(VAULT, "Vault.deposit", 21)];
  const merged = mergeFunctions(existing, incoming);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].isAudited, true, "first overload stays audited");
  assert.equal(merged[1].isAudited, false, "second overload stays unaudited");
});

test("mergeFunctions keeps unchanged functions by exact id and defaults new ones", () => {
  const existing = [fn(VAULT, "a", 5, { isAudited: true })];
  const incoming = [fn(VAULT, "a", 5), fn(VAULT, "brandNew", 30)];
  const merged = mergeFunctions(existing, incoming);
  assert.equal(merged[0].isAudited, true);
  assert.equal(merged[1].isAudited, false);
});

test("normalizeState is defensive against arbitrary input", () => {
  for (const bad of [null, undefined, 42, "nope", [], {}]) {
    const s = normalizeState(bad);
    assert.deepEqual(s.scopePaths, []);
    assert.deepEqual(s.files, {});
    assert.equal(s.activeFilePath, null);
    assert.ok(Array.isArray(s.progressHistory));
  }
});

test("normalizeState migrates legacy audit fields and recomputes ids", () => {
  const raw = {
    files: {
      [VAULT]: {
        relativePath: "src/Vault.sol",
        functions: [
          { name: "f", startLine: 2, endLine: 5, isReviewed: true },
          { name: "g", startLine: 8, readCount: 3 },
          { name: "h", startLine: 9, isAudited: false },
          "garbage",
        ],
      },
    },
  };
  const s = normalizeState(raw);
  const fns = s.files[VAULT].functions;
  assert.equal(fns.length, 3, "the non-object function entry is dropped");
  assert.equal(fns[0].isAudited, true, "isReviewed maps to audited");
  assert.equal(fns[1].isAudited, true, "readCount > 0 maps to audited");
  assert.equal(fns[2].isAudited, false);
  assert.equal(fns[0].id, makeFunctionId(VAULT, "f", 2));
});

test("stored state is workspace-relative and round-trips to absolute", () => {
  const abs: AuditrackerState = {
    ...createDefaultState(),
    scopePaths: [path.join(ROOT, "src")],
    excludedPaths: [path.join(ROOT, "src", "mock")],
    activeFilePath: VAULT,
    files: {
      [VAULT]: {
        filePath: VAULT,
        relativePath: path.join("src", "Vault.sol"),
        functions: [fn(VAULT, "Vault.deposit", 10, { isAudited: true })],
      },
    },
  };

  const stored = toStoredState(abs, ROOT);
  assert.ok(
    !JSON.stringify(stored).includes(ROOT),
    "the persisted file must not contain the absolute workspace path"
  );
  assert.deepEqual(Object.keys(stored.files), [path.join("src", "Vault.sol")]);

  const back = fromStoredState(stored, ROOT);
  assert.deepEqual(back.scopePaths, abs.scopePaths);
  assert.deepEqual(back.excludedPaths, abs.excludedPaths);
  assert.equal(back.activeFilePath, VAULT);
  assert.deepEqual(Object.keys(back.files), [VAULT]);
  const restored = back.files[VAULT].functions[0];
  assert.equal(restored.isAudited, true);
  assert.equal(restored.id, makeFunctionId(VAULT, "Vault.deposit", 10));
});

test("fromStoredState still loads a legacy absolute-path file", () => {
  const legacy = {
    scopePaths: [path.join(ROOT, "src")],
    activeFilePath: VAULT,
    files: {
      [VAULT]: {
        relativePath: "src/Vault.sol",
        functions: [{ name: "f", startLine: 1, isAudited: true }],
      },
    },
  };
  const loaded = fromStoredState(legacy, ROOT);
  assert.deepEqual(Object.keys(loaded.files), [VAULT]);
  assert.equal(loaded.files[VAULT].functions[0].isAudited, true);
});

test("a workspace-root scope path survives the round-trip", () => {
  const st: AuditrackerState = { ...createDefaultState(), scopePaths: [ROOT] };
  const stored = toStoredState(st, ROOT);
  assert.deepEqual(stored.scopePaths, ["."]);
  assert.deepEqual(fromStoredState(stored, ROOT).scopePaths, [ROOT]);
});

test("remapRenamedPath moves a renamed file's audit state", () => {
  const st: AuditrackerState = {
    ...createDefaultState(),
    scopePaths: [path.join(ROOT, "src")],
    activeFilePath: VAULT,
    files: {
      [VAULT]: {
        filePath: VAULT,
        relativePath: path.join("src", "Vault.sol"),
        functions: [fn(VAULT, "f", 1, { isAudited: true })],
      },
    },
  };
  const newVault = path.join(ROOT, "src", "VaultV2.sol");
  assert.equal(remapRenamedPath(st, VAULT, newVault, ROOT), true);
  assert.deepEqual(Object.keys(st.files), [newVault]);
  assert.equal(st.files[newVault].relativePath, path.join("src", "VaultV2.sol"));
  assert.equal(st.files[newVault].functions[0].id, makeFunctionId(newVault, "f", 1));
  assert.equal(st.files[newVault].functions[0].isAudited, true);
  assert.equal(st.activeFilePath, newVault);
});

test("remapRenamedPath re-roots files under a renamed folder", () => {
  const st: AuditrackerState = {
    ...createDefaultState(),
    scopePaths: [path.join(ROOT, "src")],
    files: {
      [VAULT]: {
        filePath: VAULT,
        relativePath: path.join("src", "Vault.sol"),
        functions: [fn(VAULT, "f", 1)],
      },
    },
  };
  const changed = remapRenamedPath(
    st,
    path.join(ROOT, "src"),
    path.join(ROOT, "contracts"),
    ROOT
  );
  assert.equal(changed, true);
  const moved = path.join(ROOT, "contracts", "Vault.sol");
  assert.deepEqual(Object.keys(st.files), [moved]);
  assert.equal(st.files[moved].relativePath, path.join("contracts", "Vault.sol"));
  assert.deepEqual(st.scopePaths, [path.join(ROOT, "contracts")]);
});

test("remapRenamedPath returns false when nothing matches", () => {
  const st: AuditrackerState = {
    ...createDefaultState(),
    files: {
      [VAULT]: { filePath: VAULT, relativePath: "src/Vault.sol", functions: [] },
    },
  };
  assert.equal(
    remapRenamedPath(st, path.join(ROOT, "other.sol"), path.join(ROOT, "x.sol"), ROOT),
    false
  );
  assert.deepEqual(Object.keys(st.files), [VAULT]);
});
