/**
 * Contact-detail rail invariants.
 *
 * The rail reads the composed detail DTO: `emails` (address nodes the hub
 * reaches over `identity`), `phones` (curated ∪ replica) and the REPLICA
 * dictionaries themselves — one node per source. A telegram-derived person
 * has a `telegram.contact` replica and nothing else, and that person must
 * still get a card: in the owner's live data that is 1345 of 1559 persons.
 *
 * tst_fe_contacts_info_001 — telegram username renders as an @handle row.
 * tst_fe_contacts_info_002 — a composed phone renders as a phone row.
 * tst_fe_contacts_info_003 — telegram-only person still renders the card.
 * tst_fe_contacts_info_004 — a replica with no handle/phone adds no row.
 * tst_fe_contacts_info_005 — email / external link / birthday still render.
 * tst_fe_contacts_info_006 — no duplicate row when a link repeats the t.me URL.
 * tst_fe_contacts_info_007 — zero-detail contact renders the empty state, not null.
 * tst_fe_contacts_info_008 — repeated addresses collapse to one row each.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import { ContactInfoColumn, type ContactReplica } from "../ContactInfoColumn";

function replica(schemaId: string, properties: Record<string, unknown>): ContactReplica {
  return {
    id: `r-${schemaId}-${JSON.stringify(properties).length.toString()}`,
    schema_id: schemaId,
    name: null,
    properties,
  };
}

/** The dictionary the telegram module writes for a contact replica. */
const TG_STEPAN = replica("telegram.contact", {
  telegram_user_id: 12223076,
  first_name: "stepan",
  last_name: "gershuni",
  username: "sgershuni",
});

describe("tst_fe_contacts_info_001 — telegram username row", () => {
  it("renders @username linked to t.me and labelled Telegram", () => {
    const { getByText, container } = render(<ContactInfoColumn replicas={[TG_STEPAN]} />);
    expect(getByText("@sgershuni")).toBeTruthy();
    const link = container.querySelector('a[href="https://t.me/sgershuni"]');
    expect(link).toBeTruthy();
    expect(getByText("· Telegram")).toBeTruthy();
  });
});

describe("tst_fe_contacts_info_002 — phone row", () => {
  it("renders a composed phone with its origin label", () => {
    const { getByText } = render(
      <ContactInfoColumn phones={[{ phone: "+31628564280", origin: "telegram" }]} />,
    );
    expect(getByText("+31628564280")).toBeTruthy();
    expect(getByText("· telegram")).toBeTruthy();
  });
});

describe("tst_fe_contacts_info_003 — telegram-only person renders the card", () => {
  it("does not unmount when a telegram replica is all there is", () => {
    const { queryByText } = render(<ContactInfoColumn replicas={[TG_STEPAN]} />);
    expect(queryByText("Contact details")).toBeTruthy();
  });
});

describe("tst_fe_contacts_info_004 — no handle, no phone, no row", () => {
  it("adds no row for a replica carrying only ids/names", () => {
    // 82 of the owner's live telegram contacts look exactly like this.
    const r = replica("telegram.contact", { telegram_user_id: 7, first_name: "Ghost" });
    const { queryByText } = render(<ContactInfoColumn replicas={[r]} />);
    // No invented placeholder row — falls through to the empty state.
    expect(queryByText("Ghost")).toBeNull();
    expect(queryByText("@undefined")).toBeNull();
  });
});

describe("tst_fe_contacts_info_005 — composed rows render", () => {
  it("renders email, phone, external link and birthday", () => {
    const { getByText } = render(
      <ContactInfoColumn
        emails={[{ id: "a1", address: "s@x.com" }]}
        phones={[{ phone: "+123", type: "mobile", origin: "curated" }]}
        replicas={[
          replica("linkedin.profile", {
            external_url: "https://linkedin.com/in/s",
            display_name: "stepan",
            platform: "linkedin",
          }),
          replica("contacts.google_contact", { birthday: "1981-06-12" }),
        ]}
      />,
    );
    expect(getByText("s@x.com")).toBeTruthy();
    expect(getByText("+123")).toBeTruthy();
    expect(getByText("stepan")).toBeTruthy();
    expect(getByText("12 June")).toBeTruthy();
  });
});

describe("tst_fe_contacts_info_006 — no duplicate telegram link", () => {
  it("collapses a telegram handle already covered by an external link", () => {
    const { container, getByText, queryByText } = render(
      <ContactInfoColumn
        replicas={[
          TG_STEPAN,
          replica("contacts.google_contact", {
            external_url: "https://t.me/sgershuni",
            display_name: "stepan gershuni",
          }),
        ]}
      />,
    );
    const links = container.querySelectorAll('a[href="https://t.me/sgershuni"]');
    expect(links.length).toBe(1);
    // The surviving row is the richer one — the handle, not the
    // Google-imported link that just repeats the display name.
    expect(getByText("@sgershuni")).toBeTruthy();
    expect(queryByText("stepan gershuni")).toBeNull();
  });
});

describe("tst_fe_contacts_info_008 — repeated addresses collapse", () => {
  it("renders one row per distinct address, not one per entry", () => {
    const emails: { id: string; address: string }[] = [];
    for (let i = 0; i < 237; i++) {
      emails.push({ id: `a${String(i)}`, address: "a@x.com" });
      emails.push({ id: `b${String(i)}`, address: "b@x.com" });
      emails.push({ id: `c${String(i)}`, address: "c@x.com" });
    }
    const { container } = render(<ContactInfoColumn emails={emails} />);
    expect(container.querySelectorAll("a[href^='mailto:']").length).toBe(3);
  });
});

describe("tst_fe_contacts_info_007 — designed empty state", () => {
  it("renders an empty state instead of nothing when there is no detail", () => {
    const { container, getByText } = render(<ContactInfoColumn />);
    expect(container.firstChild).not.toBeNull();
    expect(getByText("No contact details yet")).toBeTruthy();
  });
});

// @test-id: tst_fe_contacts_sync_001
// @scenario: scn_contacts_sync_001
// @covers: ContactOverview
// @deterministic: yes
// @fixtures: current identity states and partial owner failures
it("uses the approved contact operation and reloads saved identity states after partial failure", async () => {
  const { fireEvent, screen, waitFor } = await import("@testing-library/react");
  const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
  const { vi } = await import("vitest");
  const { setHostRuntime } = await import("../../../../packages/host-testdouble/runtime");
  const { ContactOverview } = await import("../ContactOverview");
  let enabled = true;
  const rpc = vi.fn(async (method: string) => {
    if (method === "contacts.get") return { emails: [], phones: [], replicas: [], syncTargets: [
      { identityId: "mail", schemaId: "email.address", name: "Alice email", state: { kind: "ready", id: "mail", syncEnabled: enabled, syncRevision: "1" } },
      { identityId: "x", schemaId: "x.profile", name: "Alice X", state: { kind: "ready", id: "x", syncEnabled: false, syncRevision: "0" } },
      { identityId: "tg", schemaId: "telegram.account", name: "Alice Telegram", state: { kind: "unavailable", message: "No stored direct chat" } },
    ] };
    if (method !== "contacts.person.setSyncEnabled") throw new Error(`Unexpected RPC ${method}`);
    enabled = false;
    return { results: [
      { identityId: "mail", targetId: "mail", kind: "saved", syncEnabled: false, syncRevision: "1", application: { kind: "pending" } },
      { identityId: "x", targetId: "x", kind: "saved", syncEnabled: false, syncRevision: "0", application: { kind: "failed", message: "Worker unavailable" } },
      { identityId: "tg", targetId: null, kind: "failed", message: "No stored direct chat" },
    ] };
  });
  setHostRuntime({ transport: { baseUrl: "", rpc } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = <QueryClientProvider client={client}><ContactOverview entityId="contact" /></QueryClientProvider>;
  const view = render(tree);
  expect(await screen.findByText("Alice email: On")).not.toBeNull();
  expect(screen.getByText("Alice X: Off")).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Stop synchronization" }));
  await waitFor(() => { expect(rpc).toHaveBeenCalledWith("contacts.person.setSyncEnabled", { id: "contact", syncEnabled: false }); });
  expect(await screen.findByText("Alice email: Saved. Applying…")).not.toBeNull();
  expect(screen.getByText("Alice X: Saved, but could not be applied: Worker unavailable")).not.toBeNull();
  expect(screen.getByText("Alice Telegram: Not saved: No stored direct chat")).not.toBeNull();
  expect(await screen.findByText("Alice email: Off")).not.toBeNull();
  view.unmount(); client.clear();
  const reload = render(tree);
  expect(await screen.findByText("Alice email: Off")).not.toBeNull();
  expect(screen.queryByText("Alice email: Saved. Applying…")).toBeNull();
  reload.unmount(); client.clear();
});

it("reports denied contact approval and keeps saved choices visible", async () => {
  const { fireEvent, screen } = await import("@testing-library/react");
  const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
  const { setHostRuntime } = await import("../../../../packages/host-testdouble/runtime");
  const { ContactOverview } = await import("../ContactOverview");
  setHostRuntime({ transport: { baseUrl: "", rpc: async (method: string) => {
    if (method === "contacts.get") return { emails: [], phones: [], replicas: [], syncTargets: [
      { identityId: "mail", schemaId: "email.address", name: "Alice email", state: { kind: "ready", id: "mail", syncEnabled: true, syncRevision: "0" } },
    ] };
    throw new Error("Approval denied");
  } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><ContactOverview entityId="contact" /></QueryClientProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "Stop synchronization" }));
  expect((await screen.findByRole("alert")).textContent).toBe("Approval denied");
  expect(screen.getByText("Alice email: On")).not.toBeNull();
  view.unmount(); client.clear();
});

it.each([true, false])("shows the named sync target and explicit choice %s before approval", async (syncEnabled) => {
  const { fireEvent, screen, waitFor } = await import("@testing-library/react");
  const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
  const { vi } = await import("vitest");
  const { setHostRuntime } = await import("../../../../packages/host-testdouble/runtime");
  const { SyncToolCallRenderer } = await import("../SyncToolCallRenderer");
  const approve = vi.fn(); const deny = vi.fn();
  setHostRuntime({ transport: { baseUrl: "", rpc: async () => ({ id: "contact", name: "Alice" }) } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><SyncToolCallRenderer payload={{
    toolCall: { id: "tc", name: "contacts.person.setSyncEnabled", toolBinding: { entity: "contacts.person", operation: "setSyncEnabled" }, status: "pending", args: { id: "contact", syncEnabled } },
    isAllowlisted: false, superseded: false, onApprove: approve, onDeny: deny, onEdit: vi.fn(), onAllowlistToggle: vi.fn(),
  }} /></QueryClientProvider>);
  expect(await screen.findByText("Alice")).not.toBeNull();
  expect(screen.getByText(/Applies once to currently linked/)).not.toBeNull();
  expect(screen.getByText(/Stored data remains available/)).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: syncEnabled ? "Start" : "Stop" }));
  await waitFor(() => { expect(approve).toHaveBeenCalledOnce(); });
  expect(deny).not.toHaveBeenCalled();
  view.unmount(); client.clear();
});

it.each(["raw", "text", "content"])("keeps saved pending results beside failed items in the agent card (%s)", async (format) => {
  const { screen } = await import("@testing-library/react");
  const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
  const { vi } = await import("vitest");
  const { setHostRuntime } = await import("../../../../packages/host-testdouble/runtime");
  const { SyncToolCallRenderer } = await import("../SyncToolCallRenderer");
  setHostRuntime({ transport: { baseUrl: "", rpc: async () => ({ id: "contact", name: "Alice" }) } });
  const encode = (value: unknown): unknown => format === "raw" ? value : format === "text" ? JSON.stringify(value) : { content: [{ type: "text", text: JSON.stringify(value) }] };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><SyncToolCallRenderer payload={{
    toolCall: { id: "tc", name: "contacts.person.setSyncEnabled", toolBinding: { entity: "contacts.person", operation: "setSyncEnabled" }, status: "approved", args: { id: "contact", syncEnabled: false } },
    toolResult: { id: "tc", result: encode({ results: [
      { identityId: "mail", targetId: "mail", kind: "saved", syncEnabled: false, syncRevision: "1", application: { kind: "pending" } },
      { identityId: "x", targetId: "x", kind: "saved", syncEnabled: false, syncRevision: "1", application: { kind: "failed", message: "Worker unavailable" } },
      { identityId: "tg", targetId: null, kind: "failed", message: "No stored DM" },
    ] }) }, isAllowlisted: false, superseded: false, onApprove: vi.fn(), onDeny: vi.fn(), onEdit: vi.fn(), onAllowlistToggle: vi.fn(),
  }} /></QueryClientProvider>);
  expect(await screen.findByText("Alice")).not.toBeNull();
  expect(screen.getByText("mail: Saved Off. Applying…")).not.toBeNull();
  expect(screen.getByText("x: Saved Off. Could not be applied: Worker unavailable")).not.toBeNull();
  expect(screen.getByText("tg: Not saved: No stored DM")).not.toBeNull();
  expect(screen.getAllByText("Failed").length).toBeGreaterThan(0);
  expect(screen.queryByText("Applied")).toBeNull();
  view.unmount(); client.clear();
});

it("shows an unresolved migration target and lets the owner deny it without a write", async () => {
  const { fireEvent, screen, waitFor } = await import("@testing-library/react");
  const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
  const { vi } = await import("vitest");
  const { setHostRuntime } = await import("../../../../packages/host-testdouble/runtime");
  const { SyncToolCallRenderer } = await import("../SyncToolCallRenderer");
  const rpc = vi.fn(); const deny = vi.fn(); const approve = vi.fn();
  setHostRuntime({ transport: { baseUrl: "", rpc } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><SyncToolCallRenderer payload={{
    toolCall: { id: "tc", name: "x.profile.resolveSyncMigration", toolBinding: { entity: "x.profile", operation: "resolveSyncMigration" }, status: "pending",
      args: { target: { schemaId: "x.profile", key: "x:profile:12" }, syncEnabled: false } },
    isAllowlisted: false, superseded: false, onApprove: approve, onDeny: deny, onEdit: vi.fn(), onAllowlistToggle: vi.fn(),
  }} /></QueryClientProvider>);
  expect(screen.getByText("Resolve migration: Stop synchronization")).not.toBeNull();
  expect(screen.getByText("x:profile:12")).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Deny" }));
  await waitFor(() => { expect(deny).toHaveBeenCalledOnce(); });
  expect(approve).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
  view.unmount(); client.clear();
});
