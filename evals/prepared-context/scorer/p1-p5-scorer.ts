export interface P2Row {
  readonly ref: string;
  readonly amount: number;
}

export interface P2Gold {
  readonly currency: string;
  readonly total: number;
  readonly rows: readonly P2Row[];
  readonly required_evidence_refs: readonly string[];
}

export interface P2Answer {
  readonly task: "p2";
  readonly currency: string;
  readonly total: number;
  readonly rows: readonly P2Row[];
  readonly evidence_refs: readonly string[];
}

export interface P2Score {
  readonly passed: boolean;
  readonly row_recall: number;
  readonly row_precision: number;
  readonly exact_rows: boolean;
  readonly exact_total: boolean;
  readonly arithmetic_consistent: boolean;
  readonly exact_currency: boolean;
  readonly evidence_recall: number;
  readonly missing_rows: readonly string[];
  readonly unexpected_rows: readonly string[];
  readonly wrong_amount_rows: readonly string[];
  readonly missing_evidence: readonly string[];
}

export interface P3HumanGold {
  readonly name: string;
  readonly accounts: readonly string[];
  readonly required_evidence_refs: readonly string[];
}

export interface P3Gold {
  readonly humans: readonly P3HumanGold[];
}

export interface P3HumanAnswer {
  readonly name: string;
  readonly accounts: readonly string[];
  readonly evidence_refs: readonly string[];
}

export interface P3Answer {
  readonly task: "p3";
  readonly humans: readonly P3HumanAnswer[];
}

export interface P3Score {
  readonly passed: boolean;
  readonly human_recall: number;
  readonly human_precision: number;
  readonly evidence_recall: number;
  readonly duplicate_accounts: readonly string[];
  readonly missing_humans: readonly string[];
  readonly unexpected_humans: readonly string[];
  readonly wrong_names: readonly string[];
  readonly missing_evidence: readonly string[];
}

export interface P5Gold {
  readonly person: string;
  readonly company: string;
  readonly relationship: string;
  readonly relationship_owner: string;
  readonly required_evidence_refs: readonly string[];
}

export interface P5Answer {
  readonly task: "p5";
  readonly person: string;
  readonly company: string;
  readonly relationship: string;
  readonly relationship_owner: string;
  readonly evidence_refs: readonly string[];
}

export interface P5Score {
  readonly passed: boolean;
  readonly exact_person: boolean;
  readonly exact_company: boolean;
  readonly exact_relationship: boolean;
  readonly exact_owner: boolean;
  readonly evidence_recall: number;
  readonly missing_evidence: readonly string[];
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 1 : numerator / denominator;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function missing(
  required: readonly string[],
  observed: readonly string[],
): string[] {
  const found = new Set(observed);
  return uniqueSorted(required.filter((value) => !found.has(value)));
}

function humanKey(accounts: readonly string[]): string {
  return uniqueSorted(accounts).join("|");
}

function relationshipFacts(value: string): ReadonlySet<string> {
  const folded = value.toLocaleLowerCase("en-US");
  const facts = new Set<string>();
  if (/\bdesign partners?\b/u.test(folded)) {
    facts.add("design_partner");
  }
  if (
    /\bpersonal catch-?up\b/u.test(folded) ||
    /\bcaught up personally\b/u.test(folded)
  ) {
    facts.add("personal_catch_up");
  }
  return facts;
}

function relationshipMatches(observed: string, expected: string): boolean {
  const required = relationshipFacts(expected);
  if (required.size === 0) return observed === expected;
  const found = relationshipFacts(observed);
  return [...required].every((fact) => found.has(fact));
}

/**
 * Exact P2 scoring. Row order is presentation-only, while row identity,
 * amounts, currency, total, arithmetic, and evidence are independent gates.
 */
export function scoreP2(answer: P2Answer, gold: P2Gold): P2Score {
  const goldByRef = new Map(gold.rows.map((row) => [row.ref, row.amount]));
  const answerByRef = new Map(answer.rows.map((row) => [row.ref, row.amount]));
  const duplicateRefs = answer.rows
    .map((row) => row.ref)
    .filter((ref, index, all) => all.indexOf(ref) !== index);
  const missingRows = uniqueSorted(
    gold.rows
      .filter((row) => !answerByRef.has(row.ref))
      .map((row) => row.ref),
  );
  const unexpectedRows = uniqueSorted([
    ...answer.rows
      .filter((row) => !goldByRef.has(row.ref))
      .map((row) => row.ref),
    ...duplicateRefs,
  ]);
  const wrongAmountRows = uniqueSorted(
    answer.rows
      .filter((row) => {
        const expected = goldByRef.get(row.ref);
        return expected !== undefined && expected !== row.amount;
      })
      .map((row) => row.ref),
  );
  const correctRows = answer.rows.filter(
    (row) => goldByRef.get(row.ref) === row.amount,
  ).length;
  const missingEvidence = missing(
    gold.required_evidence_refs,
    answer.evidence_refs,
  );
  const exactRows =
    missingRows.length === 0 &&
    unexpectedRows.length === 0 &&
    wrongAmountRows.length === 0 &&
    answer.rows.length === gold.rows.length;
  const exactTotal = answer.total === gold.total;
  const arithmeticConsistent =
    answer.rows.reduce((sum, row) => sum + row.amount, 0) === answer.total;
  const exactCurrency = answer.currency === gold.currency;

  return {
    passed:
      exactRows &&
      exactTotal &&
      arithmeticConsistent &&
      exactCurrency &&
      missingEvidence.length === 0,
    row_recall: ratio(correctRows, gold.rows.length),
    row_precision: ratio(correctRows, answer.rows.length),
    exact_rows: exactRows,
    exact_total: exactTotal,
    arithmetic_consistent: arithmeticConsistent,
    exact_currency: exactCurrency,
    evidence_recall: ratio(
      gold.required_evidence_refs.length - missingEvidence.length,
      gold.required_evidence_refs.length,
    ),
    missing_rows: missingRows,
    unexpected_rows: unexpectedRows,
    wrong_amount_rows: wrongAmountRows,
    missing_evidence: missingEvidence,
  };
}

/**
 * P3 is scored over humans (`accounts` equivalence classes), not individual
 * provider accounts. Splitting one person into two partial groups is therefore
 * neither a partial true positive nor two people.
 */
export function scoreP3(answer: P3Answer, gold: P3Gold): P3Score {
  const goldByKey = new Map(
    gold.humans.map((human) => [humanKey(human.accounts), human]),
  );
  const answerByKey = new Map(
    answer.humans.map((human) => [humanKey(human.accounts), human]),
  );
  const missingHumans = uniqueSorted(
    [...goldByKey.keys()].filter((key) => !answerByKey.has(key)),
  );
  const unexpectedHumans = uniqueSorted(
    [...answerByKey.keys()].filter((key) => !goldByKey.has(key)),
  );
  const accountCounts = new Map<string, number>();
  for (const human of answer.humans) {
    for (const account of human.accounts) {
      accountCounts.set(account, (accountCounts.get(account) ?? 0) + 1);
    }
  }
  const duplicateAccounts = [...accountCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([account]) => account)
    .sort();
  const wrongNames: string[] = [];
  const missingEvidence: string[] = [];
  let exactHumans = 0;
  let requiredEvidence = 0;
  let foundEvidence = 0;
  for (const [key, expected] of goldByKey) {
    requiredEvidence += expected.required_evidence_refs.length;
    const observed = answerByKey.get(key);
    if (observed === undefined) continue;
    exactHumans += 1;
    if (observed.name !== expected.name) wrongNames.push(key);
    const absent = missing(
      expected.required_evidence_refs,
      observed.evidence_refs,
    );
    missingEvidence.push(...absent.map((ref) => `${key}:${ref}`));
    foundEvidence += expected.required_evidence_refs.length - absent.length;
  }

  return {
    passed:
      missingHumans.length === 0 &&
      unexpectedHumans.length === 0 &&
      duplicateAccounts.length === 0 &&
      wrongNames.length === 0 &&
      missingEvidence.length === 0 &&
      answer.humans.length === gold.humans.length,
    human_recall: ratio(exactHumans, gold.humans.length),
    human_precision: ratio(exactHumans, answer.humans.length),
    evidence_recall: ratio(foundEvidence, requiredEvidence),
    duplicate_accounts: duplicateAccounts,
    missing_humans: missingHumans,
    unexpected_humans: unexpectedHumans,
    wrong_names: wrongNames.sort(),
    missing_evidence: missingEvidence.sort(),
  };
}

export function scoreP5(answer: P5Answer, gold: P5Gold): P5Score {
  const missingEvidence = missing(
    gold.required_evidence_refs,
    answer.evidence_refs,
  );
  const exactPerson = answer.person === gold.person;
  const exactCompany = answer.company === gold.company;
  const exactRelationship = relationshipMatches(
    answer.relationship,
    gold.relationship,
  );
  const exactOwner = answer.relationship_owner === gold.relationship_owner;

  return {
    passed:
      exactPerson &&
      exactCompany &&
      exactRelationship &&
      exactOwner &&
      missingEvidence.length === 0,
    exact_person: exactPerson,
    exact_company: exactCompany,
    exact_relationship: exactRelationship,
    exact_owner: exactOwner,
    evidence_recall: ratio(
      gold.required_evidence_refs.length - missingEvidence.length,
      gold.required_evidence_refs.length,
    ),
    missing_evidence: missingEvidence,
  };
}
