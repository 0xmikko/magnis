import { RUNTIME_TARGETS, type RuntimeTarget } from "../../../packages/runtime-contracts/src/artifact";

export interface CandidatePlatform {
  readonly runner: string;
  readonly bundleTargets: string;
}

const PLATFORMS: Readonly<Record<RuntimeTarget, CandidatePlatform>> = {
  "x86_64-unknown-linux-gnu": { runner: "ubuntu-latest", bundleTargets: "appimage,deb" },
  "aarch64-unknown-linux-gnu": { runner: "ubuntu-24.04-arm", bundleTargets: "appimage,deb" },
  "x86_64-apple-darwin": { runner: "macos-13", bundleTargets: "app" },
  "aarch64-apple-darwin": { runner: "macos-14", bundleTargets: "app" },
};

/** One checked target-to-runner mapping used by the candidate workflow. */
export function candidatePlatform(target: RuntimeTarget): CandidatePlatform {
  return PLATFORMS[target];
}

function main(): void {
  const target = Bun.argv[2];
  if (!RUNTIME_TARGETS.includes(target as RuntimeTarget)) {
    throw new Error(`unsupported runtime target: ${target ?? "<missing>"}`);
  }
  const platform = candidatePlatform(target as RuntimeTarget);
  process.stdout.write(`runner=${platform.runner}\nbundle_targets=${platform.bundleTargets}\n`);
}

if (import.meta.main) main();
