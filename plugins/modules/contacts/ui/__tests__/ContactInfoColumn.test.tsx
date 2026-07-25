/**
 * Contact-detail rail invariants.
 *
 * Root cause these tests pin: `telegram` is the ONLY module declaring
 * `create = ["contacts.person"]`, and it writes exactly ONE facet —
 * `telegram.contact` (telegram_user_id / first_name / last_name /
 * username / phone / relevance_tier). `ContactInfoColumn` used to match
 * only the four `contacts.person.*` schema ids, so a telegram-derived
 * person produced zero rows and the whole card unmounted (`return null`)
 * — the empty Overview the owner reported. In the owner's live data that
 * is 1345 of 1559 persons.
 *
 * tst_fe_contacts_info_001 — telegram username renders as an @handle row.
 * tst_fe_contacts_info_002 — telegram phone renders as a phone row.
 * tst_fe_contacts_info_003 — telegram-only person still renders the card.
 * tst_fe_contacts_info_004 — telegram facet with no handle/phone adds no row.
 * tst_fe_contacts_info_005 — contacts.person.* rows still render (regression).
 * tst_fe_contacts_info_006 — no duplicate row when external_link is the same t.me URL.
 * tst_fe_contacts_info_007 — zero-detail contact renders the empty state, not null.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import type { FacetSummary } from "@magnis/host/base";

import { ContactInfoColumn } from "../ContactInfoColumn";

function facet(schemaId: string, data: Record<string, unknown>): FacetSummary {
  return {
    id: `f-${schemaId}-${JSON.stringify(data).length.toString()}`,
    schema_id: schemaId,
    source: "telegram",
    observed_at: "2026-07-25T10:00:00Z",
    data,
  };
}

/** The exact facet shape the telegram module writes (buildContactData). */
const TG_STEPAN = facet("telegram.contact", {
  telegram_user_id: 12223076,
  first_name: "stepan",
  last_name: "gershuni",
  username: "sgershuni",
  relevance_tier: "inner",
});

describe("tst_fe_contacts_info_001 — telegram username row", () => {
  it("renders @username linked to t.me and labelled Telegram", () => {
    const { getByText, container } = render(<ContactInfoColumn facets={[TG_STEPAN]} />);
    expect(getByText("@sgershuni")).toBeTruthy();
    const link = container.querySelector('a[href="https://t.me/sgershuni"]');
    expect(link).toBeTruthy();
    expect(getByText("· Telegram")).toBeTruthy();
  });
});

describe("tst_fe_contacts_info_002 — telegram phone row", () => {
  it("renders the phone carried on telegram.contact", () => {
    const f = facet("telegram.contact", {
      telegram_user_id: 42,
      first_name: "Ann",
      phone: "+31628564280",
    });
    const { getByText, container } = render(<ContactInfoColumn facets={[f]} />);
    expect(getByText("+31628564280")).toBeTruthy();
    expect(container.querySelector('a[href="tel:+31628564280"]')).toBeTruthy();
  });
});

describe("tst_fe_contacts_info_003 — telegram-only person renders the card", () => {
  it("does not unmount when telegram.contact is the only facet", () => {
    const { queryByText } = render(<ContactInfoColumn facets={[TG_STEPAN]} />);
    expect(queryByText("Contact details")).toBeTruthy();
  });
});

describe("tst_fe_contacts_info_004 — no handle, no phone, no row", () => {
  it("adds no row for a telegram.contact carrying only ids/names", () => {
    // 82 of the owner's live telegram contacts look exactly like this.
    const f = facet("telegram.contact", {
      telegram_user_id: 7,
      first_name: "Ghost",
      relevance_tier: "group",
    });
    const { queryByText } = render(<ContactInfoColumn facets={[f]} />);
    // No invented placeholder row — falls through to the empty state.
    expect(queryByText("Ghost")).toBeNull();
    expect(queryByText("@undefined")).toBeNull();
  });
});

describe("tst_fe_contacts_info_005 — contacts.person.* rows unaffected", () => {
  it("still renders email, phone, external link and birthday", () => {
    const facets = [
      facet("contacts.person.email", { email: "s@x.com", type: "work" }),
      facet("contacts.person.phone", { phone: "+123", type: "mobile" }),
      facet("contacts.person.external_link", {
        external_url: "https://linkedin.com/in/s",
        external_name: "stepan",
        source_type: "linkedin",
      }),
      facet("contacts.person.profile", { first_name: "stepan", birthday: "1981-06-12" }),
    ];
    const { getByText } = render(<ContactInfoColumn facets={facets} />);
    expect(getByText("s@x.com")).toBeTruthy();
    expect(getByText("+123")).toBeTruthy();
    expect(getByText("stepan")).toBeTruthy();
    expect(getByText("12 June 1981")).toBeTruthy();
  });
});

describe("tst_fe_contacts_info_006 — no duplicate telegram link", () => {
  it("collapses a telegram handle already covered by an external_link", () => {
    const facets = [
      TG_STEPAN,
      facet("contacts.person.external_link", {
        external_url: "https://t.me/sgershuni",
        external_name: "stepan gershuni",
        source_type: "google",
      }),
    ];
    const { container, getByText, queryByText } = render(
      <ContactInfoColumn facets={facets} />,
    );
    const links = container.querySelectorAll('a[href="https://t.me/sgershuni"]');
    expect(links.length).toBe(1);
    // The surviving row is the richer one — the handle, not the
    // Google-imported link that just repeats the display name.
    expect(getByText("@sgershuni")).toBeTruthy();
    expect(queryByText("stepan gershuni")).toBeNull();
  });
});

describe("tst_fe_contacts_info_007 — designed empty state", () => {
  it("renders an empty state instead of nothing when there is no detail", () => {
    const { container, getByText } = render(<ContactInfoColumn facets={[]} />);
    expect(container.firstChild).not.toBeNull();
    expect(getByText("No contact details yet")).toBeTruthy();
  });
});
