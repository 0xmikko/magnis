import { expect, test } from "bun:test";
import { candidatePlatform } from "./candidate-platform";

// @test-id: tst_desktop_candidate_platform_001
// @scenario: scn_desktop_artifact_005
// @invariant: INV-DTR-29
// @covers: candidatePlatform target-to-runner and bundle mapping
// @deterministic: yes
test("tst_desktop_candidate_platform_001 maps every supported runtime target to its exact public runner and bundle set", () => {
  expect(candidatePlatform("x86_64-unknown-linux-gnu")).toEqual({
    runner: "ubuntu-latest",
    bundleTargets: "appimage,deb",
  });
  expect(candidatePlatform("aarch64-unknown-linux-gnu")).toEqual({
    runner: "ubuntu-24.04-arm",
    bundleTargets: "appimage,deb",
  });
  expect(candidatePlatform("x86_64-apple-darwin")).toEqual({
    runner: "macos-13",
    bundleTargets: "app",
  });
  expect(candidatePlatform("aarch64-apple-darwin")).toEqual({
    runner: "macos-14",
    bundleTargets: "app",
  });
});
