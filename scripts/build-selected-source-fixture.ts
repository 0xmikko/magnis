#!/usr/bin/env bun

import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { gzipSync } from "node:zlib";

const SOURCE_IDS = [
  "anysite",
  "google",
  "local",
  "mock-gmail",
  "mock-linkedin",
  "mock-telegram",
  "mock-x",
  "telegram",
  "x",
] as const;

interface FixtureFile {
  path: string;
  base64: string;
}

interface FixturePackage {
  id: string;
  files: readonly FixtureFile[];
}

function sortedFiles(root: string): readonly string[] {
  const files: string[] = [];
  const visit = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
    )) {
      const path = join(current, entry.name);
      const metadata = lstatSync(path);
      if (metadata.isSymbolicLink()) throw new Error(`fixture input contains symlink '${path}'`);
      if (metadata.isDirectory()) visit(path);
      else if (metadata.isFile()) files.push(path);
      else throw new Error(`fixture input contains unsupported entry '${path}'`);
    }
  };
  visit(root);
  return files;
}

export function buildSelectedSourceFixture(sourceRoot: string, outputPath: string): string {
  const packages: FixturePackage[] = SOURCE_IDS.map((id) => {
    const root = join(sourceRoot, id);
    return {
      id,
      files: sortedFiles(root).map((path) => ({
        path: relative(root, path).replaceAll("\\", "/"),
        base64: readFileSync(path).toString("base64"),
      })),
    };
  });
  const bytes = Buffer.from(JSON.stringify({ schemaVersion: 1, packages }), "utf8");
  const compressed = gzipSync(bytes, { level: 9 });
  const temporaryPath = `${outputPath}.tmp`;
  mkdirSync(dirname(outputPath), { recursive: true });
  rmSync(temporaryPath, { force: true });
  writeFileSync(temporaryPath, compressed);
  renameSync(temporaryPath, outputPath);
  return `sha256:${createHash("sha256").update(compressed).digest("hex")}`;
}

if (import.meta.main) {
  const sourceRoot = process.argv[2];
  if (sourceRoot === undefined) {
    throw new Error("usage: bun scripts/build-selected-source-fixture.ts <selected-source-root> [output]");
  }
  const outputPath = process.argv[3] ?? join(
    import.meta.dir,
    "..",
    "packages",
    "testkit",
    "fixtures",
    "selected-channel-sources-v1.json.gz",
  );
  console.log(buildSelectedSourceFixture(sourceRoot, outputPath));
}
