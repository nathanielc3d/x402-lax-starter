import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

// The Python starter has its own pytest suite (python/tests). Here we check it mirrors A1 to A4 by name.
const dir = new URL("../../python/", import.meta.url);

test("A6 Python starter files exist with pinned requirements and pytest tests named A1 to A4", () => {
  for (const f of ["app.py", "list_offer.py", "requirements.txt", "lax-offer.json", "tests/test_starter.py"]) assert.ok(existsSync(new URL(f, dir)), f);
  const reqs = readFileSync(new URL("requirements.txt", dir), "utf8").split("\n").filter((l) => l.trim() && !l.startsWith("#"));
  for (const r of reqs) assert.match(r, /==/, `pinned: ${r}`);
  const tests = readFileSync(new URL("tests/test_starter.py", dir), "utf8");
  for (const a of ["A1", "A2", "A3", "A4"]) assert.match(tests, new RegExp(`def test_${a}_`), a);
});
