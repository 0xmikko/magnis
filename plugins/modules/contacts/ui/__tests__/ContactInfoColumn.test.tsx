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
