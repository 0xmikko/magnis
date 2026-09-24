/**
 * MeetingsDetail — right pane content.
 *
 * Shows meeting info (description, location, attendees, actions).
 * The header (DateBadge + title + time) is handled by TopBarHeader in MeetingsModule.
 */

import { useCallback, useState, type JSX } from "react";
import {
  Avatar,
  Icon,
  Stack,
  Row,
  Text,
} from "@magnis/host/ui";
import { useAppRuntime } from "@magnis/host/runtime";
import { useRouterContext } from "@magnis/host/runtime";
import type { MeetingAttendee, MeetingDetailData, MeetingItem, MeetingsModuleData } from "./types";

function getMeetingDetail(
  detailById: Readonly<Record<string, MeetingDetailData>>,
  id: string,
): MeetingDetailData | undefined {
  return detailById[id];
}

function isGoogleMeetLocation(location: string): boolean {
  const lower = location.toLowerCase();
  return lower.includes("google meet") || lower.includes("meet.google");
}

export interface MeetingsDetailProps {
  readonly meeting: MeetingItem | null;
  readonly data: MeetingsModuleData;
}

export function MeetingsDetail({ meeting, data }: MeetingsDetailProps): JSX.Element {
  if (!meeting) {
    return (
      <div className="flex items-center justify-center h-full text-content-tertiary text-base">
        Select a meeting to view details
      </div>
    );
  }

  const detail = getMeetingDetail(data.detailById, meeting.id);
  if (!detail) {
    return (
      <Stack gap={4} px={5} py={4}>
        <div className="rounded-xl border border-edge bg-surface-secondary px-4 py-3 text-content-secondary text-sm">
          Meeting details are not available yet for this item.
        </div>
      </Stack>
    );
  }

  return <MeetingsDetailBody detail={detail} />;
}

function MeetingsDetailBody({ detail }: { readonly detail: MeetingDetailData }): JSX.Element {
  const runtime = useAppRuntime();
  const router = useRouterContext();
  const [busyEmail, setBusyEmail] = useState<string | null>(null);

  const goToContact = useCallback(
    (id: string) => {
      router.navigate("contacts", "person", id);
    },
    [router],
  );

  // Unknown guest: materialize the contact, best-effort link works_at
  // by sender domain, then navigate to the freshly-created contact.
  const createContactAndGo = useCallback(
    async (attendee: MeetingAttendee): Promise<void> => {
      if (!attendee.email) return;
      setBusyEmail(attendee.email);
      try {
        const created = await runtime.transport.rpc<{ id: string }>(
          "contacts.create",
          { name: attendee.name || attendee.email, email: attendee.email },
        );
        const domain = attendee.email.split("@")[1] ?? "";
        const root = domain.split(".")[0] ?? "";
        if (root) {
          try {
            const companies = await runtime.transport.rpc<{
              items: { id: string; name: string }[];
            }>("companies.list", { search: root });
            const match = companies.items.at(0);
            if (match) {
              await runtime.transport.rpc("graph.link.add", {
                from: created.id,
                to: match.id,
                kind: "works_at",
              });
            }
          } catch {
            /* best-effort company link; ignore */
          }
        }
        goToContact(created.id);
      } finally {
        setBusyEmail(null);
      }
    },
    [runtime, goToContact],
  );

  return (
    <Stack gap={6} px={6} py={4}>
      {/* Where — Google-Calendar style. When a conference link is
       *  present, render a real Join anchor that opens it in a new
       *  tab; otherwise just show the location text. */}
      {detail.location && (
        <Stack gap={1}>
          <Text variant="caption" weight="semibold" color="tertiary">
            Where
          </Text>
          <Row gap={2} align="center">
            <Icon
              name={isGoogleMeetLocation(detail.location) ? "video" : "map-pin"}
              size={14}
              className="text-content-tertiary shrink-0"
            />
            {detail.conferenceLink ? (
              <a
                href={detail.conferenceLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-accent hover:underline"
              >
                Join with Google Meet
              </a>
            ) : (
              <Text variant="body" color="secondary">{detail.location}</Text>
            )}
          </Row>
        </Stack>
      )}

      {/* Agenda — the calendar event's description, rendered with
       *  leading whitespace preserved so injected agenda bullets keep
       *  their shape. Empty-state message when missing. */}
      <Stack gap={1}>
        <Text variant="caption" weight="semibold" color="tertiary">
          Agenda
        </Text>
        {detail.description ? (
          <Text variant="body" color="secondary" leading="relaxed" className="whitespace-pre-wrap">
            {detail.description}
          </Text>
        ) : (
          <Text variant="body" color="tertiary" leading="relaxed">
            No agenda yet.
          </Text>
        )}
      </Stack>

      {/* Guests — Google Calendar uses "Guests" not "Attendees". The
       *  organizer is implicit (first attendee returned by the meeting
       *  service); RSVP status would go here once response_status is
       *  surfaced from the calendar source. */}
      {detail.attendees.length > 0 && (
        <Stack gap={2}>
          <Text variant="caption" weight="semibold" color="tertiary">
            Guests ({detail.attendees.length})
          </Text>
          <Stack gap={1.5}>
            {detail.attendees.map((attendee) => {
              const known = Boolean(attendee.contactId);
              const busy = busyEmail === attendee.email;
              const handleClick = (): void => {
                if (busy) return;
                if (attendee.contactId) {
                  goToContact(attendee.contactId);
                } else {
                  void createContactAndGo(attendee);
                }
              };
              return (
                <button
                  type="button"
                  key={attendee.initials + (attendee.email ?? "")}
                  onClick={handleClick}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 -mx-2 text-left transition-colors hover:bg-surface-hover cursor-pointer"
                >
                  <Avatar label={attendee.initials} color={attendee.color} size="sm" />
                  <Stack gap={0} className="min-w-0 flex-1">
                    <Row gap={2} align="center">
                      <Text
                        variant="body"
                        weight="medium"
                        color={known ? "default" : "tertiary"}
                      >
                        {attendee.name || attendee.initials}
                      </Text>
                      {attendee.role && (
                        <Text variant="caption" color="tertiary">{attendee.role}</Text>
                      )}
                      {!known && (
                        <Text variant="caption" color="tertiary">
                          {busy ? "· adding…" : "· not in contacts"}
                        </Text>
                      )}
                    </Row>
                    {attendee.email && (
                      <Text variant="caption" color="tertiary">{attendee.email}</Text>
                    )}
                  </Stack>
                  <Icon
                    name="chevron-right"
                    size={14}
                    className="text-content-tertiary shrink-0"
                  />
                </button>
              );
            })}
          </Stack>
        </Stack>
      )}
    </Stack>
  );
}
