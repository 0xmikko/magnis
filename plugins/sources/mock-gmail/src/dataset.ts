import { ConnectorError, type DatasetActionHandler, type Envelope } from "@magnis/connector-sdk";

type Json = Record<string, unknown>;

function requiredString(payload: Json, key: string): string {
  const value = payload[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new ConnectorError(`invalid emit_message payload: ${key}`, {
      kind: "contract",
      field: key,
    });
  }
  return value;
}

export const emitMessage: DatasetActionHandler = (args) => Promise.resolve().then(() => {
  const payload = args.payload;
  const messageId = requiredString(payload, "message_id");
  const sentAt = requiredString(payload, "sent_at");
  if (Number.isNaN(Date.parse(sentAt))) {
    throw new ConnectorError("invalid emit_message payload: sent_at", {
      kind: "contract",
      field: "sent_at",
    });
  }
  requiredString(payload, "from_address");
  if (typeof payload.subject !== "string" || typeof payload.body_text !== "string") {
    throw new ConnectorError("invalid emit_message payload: subject/body_text", {
      kind: "contract",
    });
  }
  const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];
  const envelope: Envelope = {
    surface: "email",
    remote_id: `dataset:${args.invocation_id}:0`,
    kind: "live",
    payload: {
      message_id: messageId,
      ...(typeof payload.thread_id === "string" ? { thread_id: payload.thread_id } : {}),
      from_address: payload.from_address,
      from_name: typeof payload.from_name === "string" ? payload.from_name : "",
      subject: payload.subject,
      body_text: payload.body_text,
      sent_at: sentAt,
      has_attachments: attachments.length > 0,
      attachments,
    },
  };
  return { envelopes: [envelope] };
});

function meetingAttendees(payload: Json): Json[] {
  if (!Array.isArray(payload.attendees)) {
    throw new ConnectorError("invalid emit_meeting payload: attendees", {
      kind: "contract",
      field: "attendees",
    });
  }
  return payload.attendees.map((value, index) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new ConnectorError(`invalid emit_meeting payload: attendees[${String(index)}]`, {
        kind: "contract",
        field: `attendees[${String(index)}]`,
      });
    }
    const attendee = value as Json;
    const email = requiredString(attendee, "email");
    return {
      ...(typeof attendee.name === "string" ? { name: attendee.name } : {}),
      email,
    };
  });
}

export const emitMeeting: DatasetActionHandler = (args) => Promise.resolve().then(() => {
  const payload = args.payload;
  const eventId = requiredString(payload, "event_id");
  const title = requiredString(payload, "title");
  const startsAt = requiredString(payload, "starts_at");
  const endsAt = requiredString(payload, "ends_at");
  if (Number.isNaN(Date.parse(startsAt)) || Number.isNaN(Date.parse(endsAt))) {
    throw new ConnectorError("invalid emit_meeting payload: starts_at/ends_at", {
      kind: "contract",
    });
  }
  const attendees = meetingAttendees(payload);
  const envelope: Envelope = {
    surface: "meetings",
    remote_id: `dataset:${args.invocation_id}:0`,
    kind: "live",
    payload: {
      id: eventId,
      title,
      starts_at: startsAt,
      ends_at: endsAt,
      ...(typeof payload.description === "string" ? { description: payload.description } : {}),
      ...(typeof payload.location === "string" ? { location: payload.location } : {}),
      status: "confirmed",
      attendees,
    },
  };
  return { envelopes: [envelope] };
});
