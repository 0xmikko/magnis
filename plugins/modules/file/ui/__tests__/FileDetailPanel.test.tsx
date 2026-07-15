import { render, screen, waitFor } from "@testing-library/react";
import type { AppRuntime } from "@magnis/host/runtime";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileDetailPanel } from "../FileDetailPanel";

const useQueryMock = vi.fn();
let runtime: AppRuntime;

vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]): unknown => useQueryMock(...args),
}));

// useAppRuntime + authHeaders both come from @magnis/host/runtime now (the
// file UI moved into the `file` plugin), so mock that single host shim.
vi.mock("@magnis/host/runtime", () => ({
  useAppRuntime: (): AppRuntime => runtime,
  authHeaders: (): HeadersInit => ({ Authorization: "Bearer test-token" }),
}));

describe("FileDetailPanel", () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    runtime = {
      queryClient: {} as AppRuntime["queryClient"],
      transport: { rpc: vi.fn() } as unknown as AppRuntime["transport"],
      modules: {} as AppRuntime["modules"],
      stores: {} as AppRuntime["stores"],
      agent: {} as AppRuntime["agent"],
      composer: {} as AppRuntime["composer"],
    };
  });

  it("tst_fe_file_detail_001 image preview uses authenticated blob URL instead of bare /files src", async () => {
    useQueryMock.mockReturnValue({
      data: {
        entity_id: "file-123",
        name: "photo.jpg",
        mime_type: "image/jpeg",
        size_bytes: 123,
        source_module: "uploads",
        url: null,
      },
    });

    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      if (init?.method === "HEAD") {
        return Promise.resolve(new Response(null, { status: 200 }));
      }
      return Promise.resolve(new Response(new Blob(["img"], { type: "image/jpeg" }), {
        status: 200,
        headers: { "Content-Type": "image/jpeg" },
      }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const createObjectURL = vi.fn(() => "blob:preview-photo");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    });

    render(
      <FileDetailPanel
        entityId="file-123"
        moduleId="file"
        runtime={runtime}
      />,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const secondCall = fetchMock.mock.calls[1];
    if (!secondCall) throw new Error("expected authenticated preview GET call");
    const [secondUrl, secondInit] = secondCall as [string, RequestInit];
    expect(secondUrl).toContain("/files/file-123");
    expect(secondInit.method).toBe("GET");
    expect(secondInit.credentials).toBe("include");

    const img = await screen.findByRole("img", { name: "photo.jpg" });
    expect(img.getAttribute("src")).toBe("blob:preview-photo");
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("tst_fe_file_detail_002 pdf preview uses the full detail height without a metadata footer", async () => {
    useQueryMock.mockReturnValue({
      data: {
        entity_id: "file-pdf",
        name: "deck.pdf",
        mime_type: "application/pdf",
        size_bytes: 10 * 1024 * 1024,
        source_module: "uploads",
        url: null,
      },
    });

    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      if (init?.method === "HEAD") {
        return Promise.resolve(new Response(null, { status: 200 }));
      }
      return Promise.resolve(new Response(new Blob(["pdf"], { type: "application/pdf" }), {
        status: 200,
        headers: { "Content-Type": "application/pdf" },
      }));
    });
    vi.stubGlobal("fetch", fetchMock);

    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:preview-pdf"),
      revokeObjectURL: vi.fn(),
    });

    const { container } = render(
      <FileDetailPanel
        entityId="file-pdf"
        moduleId="file"
        runtime={runtime}
      />,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const preview = screen.getByTestId("file-preview");
    expect(preview.className).toContain("h-full");
    expect(preview.className).toContain("overflow-hidden");

    await waitFor(() => {
      const embed = container.querySelector("embed[type='application/pdf']");
      expect(embed?.getAttribute("src")).toBe("blob:preview-pdf");
      expect(embed?.className).toContain("h-full");
    });

    expect(screen.getByText("application/pdf / 10.0 MB / Upload")).toBeTruthy();
    expect(screen.queryByText("Source")).toBeNull();
  });
});
