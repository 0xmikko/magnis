import { rmSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { collectSourceHostEvidence } from "../../../../packages/testkit/host-driver";
import {
  sourceArtifactPackageHash,
} from "../../../../packages/testkit/receipt";
import { stageBundledSourcePackage } from "../../../../scripts/build-catalog-index";
import { discoverSourceReleaseManifests, discoverStagedCatalog, mintSourceCertificationReceipt } from "../../../../scripts/certify-sources";

import type { SourceHostEvidenceOptions } from "../../../../packages/testkit/host-driver";

const repoRoot = join(import.meta.dir, "../../../..");

export interface CertifiedFixtureArtifact {
  readonly root: string;
  readonly packageHash: string;
  readonly receipt: Awaited<ReturnType<typeof mintSourceCertificationReceipt>>;
  readonly evidence: Awaited<ReturnType<typeof collectSourceHostEvidence>>;
}

/** Stage and execute the exact dependency-closed artifact used by catalog
 * publication. This helper stays inside the C5 fixture write zone so provider
 * scenarios remain authored locally instead of growing a shared registry. */
export async function withCertifiedFixtureArtifact<T>(
  sourceId: string,
  options: SourceHostEvidenceOptions,
  inspect: (artifact: CertifiedFixtureArtifact) => Promise<T> | T,
): Promise<T> {
  const release = discoverSourceReleaseManifests(join(repoRoot, "plugins", "sources"))
    .find((candidate) => candidate.id === sourceId);
  if (release?.disposition !== "admissible") {
    throw new Error(`${sourceId} must be an admissible Source release`);
  }
  const temporaryRoot = mkdtempSync(join(tmpdir(), `magnis-${sourceId}-cert-`));
  const artifactRoot = join(temporaryRoot, "packages", "source", sourceId);
  try {
    stageBundledSourcePackage(release, artifactRoot);
    const packageHash = sourceArtifactPackageHash(artifactRoot);
    const staged = discoverStagedCatalog(temporaryRoot).find((candidate) => candidate.id === sourceId);
    if (staged === undefined) throw new Error(`staged ${sourceId} artifact is missing`);
    const receipt = await mintSourceCertificationReceipt(staged);
    const evidence = await collectSourceHostEvidence(
      artifactRoot,
      release.declaration.callableOperations,
      options,
    );
    return await inspect({ root: artifactRoot, packageHash, receipt, evidence });
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

export function successfulOperation(
  evidence: Awaited<ReturnType<typeof collectSourceHostEvidence>>,
  operation: string,
): Record<string, unknown> {
  const reply = evidence.operationProbes[operation];
  if (reply?.error !== undefined || reply?.result === null || typeof reply?.result !== "object") {
    throw new Error(`${operation} did not return a successful object result`);
  }
  return reply.result as Record<string, unknown>;
}
