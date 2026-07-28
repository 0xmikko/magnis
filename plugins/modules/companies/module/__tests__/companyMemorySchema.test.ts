import { describe, expect, test } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

interface CompanyMemorySchema {
  readonly id: string;
  readonly version: number;
  readonly type: string;
  readonly required: readonly string[];
  readonly additionalProperties: boolean;
  readonly properties: Readonly<Record<string, { readonly type: string }>>;
}

const schemasDir = join(dirname(fileURLToPath(import.meta.url)), "../../schemas");

describe("companies.memory schema ownership", () => {
  /**
   * @test-id: tst_module_company_memory_001
   * @scenario: scn_hosted_demo_rich_data_001
   * @covers: plugins/modules/companies/schemas/company.memory.json
   * @deterministic: yes
   * @fixtures: plugins/modules/companies/schemas/company.memory.json
   */
  test("tst_module_company_memory_001 packages one strict body-only memory schema", () => {
    const memoryFiles = readdirSync(schemasDir).filter((name) => name === "company.memory.json");
    expect(memoryFiles).toEqual(["company.memory.json"]);
    const memoryFile = memoryFiles[0];
    if (memoryFile === undefined) {
      throw new Error("company.memory.json was not packaged");
    }

    const schema = JSON.parse(
      readFileSync(join(schemasDir, memoryFile), "utf8"),
    ) as CompanyMemorySchema;

    expect(schema).toEqual({
      id: "companies.memory",
      version: 1,
      type: "object",
      required: ["body"],
      additionalProperties: false,
      properties: {
        body: {
          type: "string",
        },
      },
    });
  });
});
