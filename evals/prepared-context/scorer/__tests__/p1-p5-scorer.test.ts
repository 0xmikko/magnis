/**
 * @test-id: tst_eval_score_002, tst_eval_score_003, tst_eval_score_005
 * @scenario: scn_eval_p2_account_cost_001, scn_eval_p3_unanswered_humans_001, scn_eval_p5_warm_intro_001
 * @covers: exact deterministic component scoring for P2, P3, and P5 tasks
 * @deterministic: yes
 *
 * Test environment: pure scorer contracts; no backend or model process.
 * Clients: direct function calls.
 * Mocks: none.
 * Data: inline fixed gold and answer fixtures.
 */

import { describe, expect, it } from "vitest";

import {
  scoreP2,
  scoreP3,
  scoreP5,
  type P2Gold,
  type P3Gold,
  type P5Gold,
} from "../p1-p5-scorer.ts";

describe("P1-P5 deterministic scorers", () => {
  it("tst_eval_score_002 reports P2 recall, over-inclusion, arithmetic, and evidence separately", () => {
    const gold: P2Gold = {
      currency: "EUR",
      total: 900,
      rows: [
        { ref: "email:card-rail", amount: 186 },
        { ref: "email:card-hotel", amount: 294 },
        { ref: "email:card-venue", amount: 420 },
      ],
      required_evidence_refs: [
        "x:post:helio-rename",
        "email:forge-invite",
      ],
    };

    expect(
      scoreP2(
        {
          task: "p2",
          currency: "EUR",
          total: 900,
          rows: [
            { ref: "email:card-venue", amount: 420 },
            { ref: "email:card-rail", amount: 186 },
            { ref: "email:card-hotel", amount: 294 },
          ],
          evidence_refs: ["email:forge-invite", "x:post:helio-rename"],
        },
        gold,
      ),
    ).toEqual({
      passed: true,
      row_recall: 1,
      row_precision: 1,
      exact_rows: true,
      exact_total: true,
      arithmetic_consistent: true,
      exact_currency: true,
      evidence_recall: 1,
      missing_rows: [],
      unexpected_rows: [],
      wrong_amount_rows: [],
      missing_evidence: [],
    });

    expect(
      scoreP2(
        {
          task: "p2",
          currency: "EUR",
          total: 910,
          rows: [
            { ref: "email:card-venue", amount: 420 },
            { ref: "email:card-hotel", amount: 294 },
            { ref: "email:unrelated", amount: 196 },
          ],
          evidence_refs: ["email:forge-invite"],
        },
        gold,
      ),
    ).toMatchObject({
      passed: false,
      row_recall: 2 / 3,
      row_precision: 2 / 3,
      exact_rows: false,
      exact_total: false,
      arithmetic_consistent: true,
      missing_rows: ["email:card-rail"],
      unexpected_rows: ["email:unrelated"],
      missing_evidence: ["x:post:helio-rename"],
    });
  });

  it("tst_eval_score_003 compares P3 at human level, independent of account order", () => {
    const gold: P3Gold = {
      humans: [
        {
          name: "Nora Venn",
          accounts: ["nora@north.example", "tg:41001"],
          required_evidence_refs: ["email:nora-ask", "telegram:nora-identity"],
        },
        {
          name: "Pavel Rook",
          accounts: ["tg:41002"],
          required_evidence_refs: ["telegram:pavel-ask"],
        },
      ],
    };

    expect(
      scoreP3(
        {
          task: "p3",
          humans: [
            {
              name: "Pavel Rook",
              accounts: ["tg:41002"],
              evidence_refs: ["telegram:pavel-ask"],
            },
            {
              name: "Nora Venn",
              accounts: ["tg:41001", "nora@north.example"],
              evidence_refs: ["telegram:nora-identity", "email:nora-ask"],
            },
          ],
        },
        gold,
      ),
    ).toMatchObject({
      passed: true,
      human_recall: 1,
      human_precision: 1,
      duplicate_accounts: [],
      missing_humans: [],
      unexpected_humans: [],
    });

    expect(
      scoreP3(
        {
          task: "p3",
          humans: [
            {
              name: "Nora Venn email",
              accounts: ["nora@north.example"],
              evidence_refs: ["email:nora-ask"],
            },
            {
              name: "Nora Venn Telegram",
              accounts: ["tg:41001"],
              evidence_refs: ["telegram:nora-identity"],
            },
          ],
        },
        gold,
      ),
    ).toMatchObject({
      passed: false,
      human_recall: 0,
      human_precision: 0,
      missing_humans: [
        "nora@north.example|tg:41001",
        "tg:41002",
      ],
    });
  });

  it("tst_eval_score_005 requires the exact P5 relationship, owner, and evidence", () => {
    const gold: P5Gold = {
      person: "Celia Ortiz",
      company: "Asteria Grid",
      relationship: "former design partner and recent personal catch-up",
      relationship_owner: "Hana Ward",
      required_evidence_refs: [
        "email:celia-catchup",
        "email:hana-reply",
        "x:post:celia-asteria",
      ],
    };

    expect(
      scoreP5(
        {
          task: "p5",
          person: "Celia Ortiz",
          company: "Asteria Grid",
          relationship:
            "They were design partners for years, remain friends, and recently had a personal catch-up.",
          relationship_owner: "Hana Ward",
          evidence_refs: [
            "x:post:celia-asteria",
            "email:hana-reply",
            "email:celia-catchup",
          ],
        },
        gold,
      ),
    ).toEqual({
      passed: true,
      exact_person: true,
      exact_company: true,
      exact_relationship: true,
      exact_owner: true,
      evidence_recall: 1,
      missing_evidence: [],
    });

    expect(
      scoreP5(
        {
          task: "p5",
          person: "Celia Ortiz",
          company: "Asteria Grid",
          relationship: "former design partner and recent personal catch-up",
          relationship_owner: "Omar Bell",
          evidence_refs: ["email:celia-catchup"],
        },
        gold,
      ),
    ).toMatchObject({
      passed: false,
      exact_person: true,
      exact_owner: false,
      evidence_recall: 1 / 3,
    });

    expect(
      scoreP5(
        {
          task: "p5",
          person: "Celia Ortiz",
          company: "Asteria Grid",
          relationship: "former design partner",
          relationship_owner: "Hana Ward",
          evidence_refs: [
            "email:celia-catchup",
            "email:hana-reply",
            "x:post:celia-asteria",
          ],
        },
        gold,
      ),
    ).toMatchObject({
      passed: false,
      exact_relationship: false,
    });
  });
});
