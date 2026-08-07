import { readFileSync } from "node:fs";

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`invalid pull request event: ${label}`);
  }
  return value as Record<string, unknown>;
}

function requireString(record: Record<string, unknown>, key: string, label: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`invalid pull request event: ${label}.${key}`);
  }
  return value;
}

/**
 * @tested-by: tst_ci_main_promotion_001, tst_ci_main_promotion_002, tst_ci_main_promotion_003, tst_ci_main_promotion_004, tst_ci_main_promotion_005
 * @invariant: main accepts changes only from this repository's staging branch
 */
export function assertMainPromotion(event: unknown, expectedRepository: string): void {
  if (expectedRepository.length === 0) {
    throw new Error("expected repository is required");
  }

  const root = requireRecord(event, "root");
  const pullRequest = requireRecord(root.pull_request, "pull_request");
  const base = requireRecord(pullRequest.base, "pull_request.base");
  const head = requireRecord(pullRequest.head, "pull_request.head");
  const headRepository = requireRecord(head.repo, "pull_request.head.repo");

  if (requireString(base, "ref", "pull_request.base") !== "main") {
    throw new Error("promotion policy must run only for pull requests targeting main");
  }
  if (requireString(head, "ref", "pull_request.head") !== "staging") {
    throw new Error("main accepts pull requests only from staging");
  }
  if (requireString(headRepository, "full_name", "pull_request.head.repo") !== expectedRepository) {
    throw new Error(`staging must belong to ${expectedRepository}`);
  }
}

function main(): void {
  const eventPath = Bun.argv[2];
  const expectedRepository = Bun.argv[3];
  if (eventPath === undefined || expectedRepository === undefined || Bun.argv.length !== 4) {
    throw new Error("usage: bun scripts/main-promotion-policy.ts <event-path> <owner/repository>");
  }

  const event: unknown = JSON.parse(readFileSync(eventPath, "utf8")) as unknown;
  assertMainPromotion(event, expectedRepository);
  console.log(`main promotion accepted: ${expectedRepository}:staging -> main`);
}

if (import.meta.main) {
  main();
}
