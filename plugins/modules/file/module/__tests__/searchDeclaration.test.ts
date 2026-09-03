import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { parse as parseToml } from "smol-toml";

interface SearchField {
  readonly key: string;
  readonly kind: string;
  readonly path?: string;
  readonly embed?: string;
}

interface SearchDeclaration {
  readonly entity: string;
  readonly field: readonly SearchField[];
}

describe("file search declaration", () => {
  /**
   * @test-id: tst_module_file_search_001
   * @scenario: scn_file_mention_search_001
   * @covers: plugins/modules/file/search.toml name embedding declaration
   * @deterministic: yes
   * @fixtures: plugins/modules/file/search.toml
   */
  it("tst_module_file_search_001 embeds the file name as the search title", () => {
    const path = join(import.meta.dirname, "../..", "search.toml");
    const declaration = parseToml(readFileSync(path, "utf8")) as unknown as SearchDeclaration;

    expect(declaration.entity).toBe("file.object");
    expect(declaration.field.find((field) => field.key === "name")).toEqual({
      key: "name",
      kind: "text",
      path: "name",
      embed: "title",
    });
  });
});
