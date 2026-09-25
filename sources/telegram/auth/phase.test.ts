/**
 * The sign-in screen reads the HOST's ceremony vocabulary.
 *
 * The connector answers `{state: "password"}` when 2FA is needed; the host
 * publishes that to the browser as `password_required`. The screen used to
 * compare against the connector's spelling, so it stayed on the code boxes
 * while the ceremony had already moved to the password step — and every
 * submit after that was answered `409: auth ceremony expected password`.
 * Reported from a live stand on 2026-09-14.
 */
import { describe, expect, it } from "vitest";

import { phaseAfterCode } from "./index.js";

describe("phaseAfterCode", () => {
  it("moves to the password field on the host's password_required", () => {
    expect(phaseAfterCode("password_required")).toBe("password");
  });

  it("finishes on connected", () => {
    expect(phaseAfterCode("connected")).toBe("connected");
  });

  it("refuses a status nobody planned, loudly", () => {
    // Including the CONNECTOR's own spelling: the browser never sees it, and
    // a screen that treats it as "stay where you are" is the defect above.
    expect(() => phaseAfterCode("password")).toThrow(/unexpected sign-in status: password/);
    expect(() => phaseAfterCode("code_sent")).toThrow(/unexpected sign-in status/);
  });
});
