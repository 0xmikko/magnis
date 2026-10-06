/**
 * MeetingCardView — rich meeting detail card.
 *
 * Layout:
 * ┌────────────────────────────────────────┐
 * │ [DateBadge]  Title                     │
 * │              Subtitle (time+duration)  │
 * │              Location                  │
 * │              Google Meet link          │
 * │                                        │
 * │ Description text...                    │
 * │                                        │
 * │ Attendees                              │
 * │ Avatar · Name · email · role           │
 * │                                        │
 * │ [Join Meeting] [Reschedule] [Cancel]   │
 * └────────────────────────────────────────┘
 */

import type { JSX } from "react";
import {
  Avatar,
  ActionButton,
  Card,
  DateBadge,
  Icon,
  Stack,
  Row,
  Text,
} from "@magnis/host/ui";
import type { MeetingDetailData, MeetingItem } from "./types";

export interface MeetingCardViewProps {
  readonly meeting: MeetingItem;
  readonly detail: MeetingDetailData;
}

function isGoogleMeetLocation(location: string): boolean {
  const lower = location.toLowerCase();
  return lower.includes("google meet") || lower.includes("meet.google");
}

export function MeetingCardView({ meeting, detail }: MeetingCardViewProps): JSX.Element {
  return (
    <Card>
      <Stack gap={5}>
        {/* Header: DateBadge + title/subtitle/location */}
        <Row gap={4} align="start">
          {detail.dateDay && detail.dateMonth && (
            <DateBadge day={detail.dateDay} month={detail.dateMonth} size="lg" />
          )}
          <Stack gap={1} flex1>
            <Text variant="subheading" weight="semibold">{meeting.title}</Text>
            {detail.subtitle && (
              <Text variant="body" color="secondary">{detail.subtitle}</Text>
            )}
            {detail.location && (
              <Row gap={1} align="center">
                <Icon
                  name={isGoogleMeetLocation(detail.location) ? "video" : "map-pin"}
                  size={14}
                  className="text-content-tertiary shrink-0"
                />
                <Text variant="caption" color="tertiary">{detail.location}</Text>
              </Row>
            )}
          </Stack>
        </Row>

        {/* Description */}
        {detail.description && (
          <Text variant="body" color="secondary" leading="relaxed">
            {detail.description}
          </Text>
        )}

        {/* Attendees */}
        {detail.attendees.length > 0 && (
          <Stack gap={2}>
            <Text variant="caption" weight="semibold" color="tertiary">
              Attendees
            </Text>
            <Stack gap={1.5}>
              {detail.attendees.map((attendee) => (
                <Row key={attendee.initials + (attendee.email ?? "")} gap={3} align="center">
                  <Avatar label={attendee.initials} color={attendee.color} size="sm" />
                  <Stack gap={0}>
                    <Row gap={2} align="center">
                      <Text variant="body" weight="medium">{attendee.name || attendee.initials}</Text>
                      {attendee.role && (
                        <Text variant="caption" color="tertiary">{attendee.role}</Text>
                      )}
                    </Row>
                    {attendee.email && (
                      <Text variant="caption" color="tertiary">{attendee.email}</Text>
                    )}
                  </Stack>
                </Row>
              ))}
            </Stack>
          </Stack>
        )}

        {/* Actions */}
        {detail.actions.length > 0 && (
          <Row gap={2} className="mt-1">
            {detail.actions.map((action) => (
              <ActionButton
                key={action.label}
                label={action.label}
                variant={action.variant === "primary" ? "primary" : action.variant === "danger" ? "danger" : "default"}
                icon={action.icon}
              />
            ))}
          </Row>
        )}
      </Stack>
    </Card>
  );
}
