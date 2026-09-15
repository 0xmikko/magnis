import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const runtime = ".agents/code-production/runtime";
const prepTest = "scripts/tst_scripts_agent_stack_001.test.ts";

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

function run(...args: string[]): void {
  console.log(`verify: bun ${args.join(" ")}`);
  execFileSync(process.execPath, args, { cwd: root, stdio: "inherit" });
}

function docs(): void {
  const plans = git("ls-files", "docs/plans/*.md").trim().split("\n").filter(Boolean);
  for (const plan of plans) {
    if (plan === "docs/plans/README.md") continue;
    run(`${runtime}/plan-gate.ts`, plan, "--no-exec");
    if (readFileSync(join(root, plan), "utf8").includes("<!-- plan:spec:start -->")) {
      run(`${runtime}/planctl.ts`, "verify", plan);
    }
  }
}

function typeConfig(path: string): string {
  let dir = dirname(path);
  while (dir !== ".") {
    const config = join(dir, "tsconfig.json");
    if (existsSync(join(root, config))) return config;
    dir = dirname(dir);
  }
  throw new Error(`No TypeScript owner for ${path}; declare its scoped check before committing.`);
}

function commit(): void {
  // @tested-by: tst_scripts_agent_stack_001
  const branch = git("rev-parse", "--abbrev-ref", "HEAD").trim();
  if (branch === "main" || branch === "staging") {
    throw new Error(`direct commits to '${branch}' are not allowed; use a feature worktree.`);
  }
  const paths = git("diff", "--cached", "--name-only", "-z", "--diff-filter=ACMRD").split("\0").filter(Boolean);
  const configs = new Set<string>();
  const tests = new Set<string>();
  const lint: string[] = [];
  for (const path of paths) {
    if (/^(\.githooks\/|\.agents\/code-production\/)/.test(path) || path === "package.json") {
      tests.add(prepTest);
    }
    if (path.startsWith(`${runtime}/`)) continue; // Generated, version-pinned upstream runtime.
    if (!/\.(ts|tsx)$/.test(path)) continue;
    configs.add(typeConfig(path));
    if (!existsSync(join(root, path))) continue;
    const isTest = /\.test\.tsx?$/.test(path);
    if (isTest) tests.add(path);
    else {
      const neighbor = path.replace(/\.(ts|tsx)$/, ".test.$1");
      if (existsSync(join(root, neighbor))) tests.add(neighbor);
      if (!path.endsWith(".d.ts") && !path.includes("/__tests__/")) lint.push(path);
    }
  }
  const productChanged = paths.some((path) => /^(plugins|packages)\/.*\.(ts|tsx)$/.test(path));
  if (productChanged && ![...tests].some((path) => /^(plugins|packages)\//.test(path))) {
    throw new Error("Product change has no scoped behavior target; stage its regression test before committing.");
  }
  const rootConfigChange = paths.some((path) => path === "tsconfig.base.json" || path === "bun.lock");
  if (rootConfigChange) run("run", "typecheck");
  else for (const config of configs) run("x", "tsc", "-p", config);
  if (lint.length) run("x", "eslint", "--max-warnings", "0", ...lint);
  // Reuse the public test adapters; runner ownership lives in test-connectors.sh.
  const frontend = [...tests].filter((path) => path.includes("/ui/") && !path.endsWith("sourceStatusAdapter.test.ts"));
  const backend = [...tests].filter((path) => !frontend.includes(path));
  if (backend.length) run("run", "agent:test:backend", "--", ...backend);
  if (frontend.length) run("run", "agent:test:frontend", "--", ...frontend);
  console.log(`Scoped verification passed (${String(paths.length)} staged paths). Complete coverage remains agent:verify:pr.`);
}

switch (process.argv[2]) {
  case "docs": docs(); break;
  case "commit": commit(); break;
  default: throw new Error("Expected commit or docs verification mode.");
}
