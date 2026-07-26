# Blind quality review — raw scores

Three judges, one frozen rubric, all 11 artifacts scored in one pass
each, de-identified and shuffled. Arm map in
`blind-review-arm-map.tsv` (sealed until judging finished). Per-judge
per-dimension JSON in `blind-review-judge{1,2,3}.json`.

Inter-judge agreement (Spearman on holistic overall, n=11):
J1~J2 **0.86**, J1~J3 **0.91**, J2~J3 **0.93**.

## Holistic overall per artifact (1–10)

| artifact | config / run | J1 | J2 | J3 | mean |
|---|---|---|---|---|---|
| artifact-01 | A2 / run 2 | 9 | 8 | 8 | 8.33 |
| artifact-11 | A3 / run 2 | 7 | 9 | 9 | 8.33 |
| artifact-03 | A3 / run 3 | 8 | 8 | 8 | 8.00 |
| artifact-05 | A2 / run 1 | 8 | 8 | 8 | 8.00 |
| artifact-06 | A3 / run 1 | 7 | 7 | 7 | 7.00 |
| artifact-04 | A1 / run 2 | 6 | 7 | 6 | 6.33 |
| artifact-07 | A1 / run 3 | 6 | 6 | 7 | 6.33 |
| artifact-09 | A2 / run 3 | 5 | 5 | 5 | 5.00 |
| artifact-10 | A1 / run 1 | 5 | 5 | 5 | 5.00 |
| artifact-02 | A0 / run 1 | 4 | 6 | 4 | 4.67 |
| artifact-08 | A0 / run 3 | 4 | 4 | 3 | 3.67 |

## Aggregated by configuration

Mean over all valid runs × 3 judges.

| Config | overall | schema_design | ingest_robustness | interface_quality | test_quality | idiomatic_fit |
|---|---|---|---|---|---|---|
| A3 — skill family | 7.78 | 4.11 | 4.00 | 4.33 | 4.44 | 4.56 |
| A2 — one skill | 7.11 | 3.78 | 4.11 | 4.22 | 3.89 | 4.00 |
| A1 — docs only | 5.89 | 3.56 | 3.67 | 3.44 | 3.33 | 3.22 |
| A0 — no skills | 4.17 | 2.83 | 2.17 | 2.83 | 3.00 | 2.50 |

## Mechanical gate (the prerequisite) — per valid run

All eleven valid runs pass all five checks. Recorded for completeness;
the gate does not discriminate the configurations.

| Config | runs graded | build | conformance | sealed data | contract probes | consumer | PASS |
|---|---|---|---|---|---|---|---|
| A0 — no skills | 2 (1 excluded) | 1/1 | 1/1 | 7/7 | 8/8 | 5/5 | 2/2 |
| A1 — docs only | 3 | 1/1 | 1/1 | 7/7 | 8/8 | 5/5 | 3/3 |
| A2 — one skill | 3 | 1/1 | 1/1 | 7/7 | 8/8 | 5/5 | 3/3 |
| A3 — skill family | 3 | 1/1 | 1/1 | 7/7 | 8/8 | 5/5 | 3/3 |
