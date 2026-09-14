/** What email's entities ARE: the shape of every record this module writes,
 * and how each one is searched.
 *
 * BUILD TIME ONLY — a leaf. `module/`, `ui/` and `types.ts` import nothing
 * from here; the build reads it and writes the descriptors the host installs.
 * The pin runs one way: this file imports the plain interfaces, never the
 * reverse, so zod reaches neither the isolate's bundle nor the UI's types.
 *
 * The message record is the provider's dictionary MINUS what edges now carry:
 * the recipients (sent_to), the sender's address (authored_by) and the
 * attachments (file.attachment). Declaring them here would invite writing them
 * again as strings beside the edges that replaced them.
 */
import { z } from "zod";
import { entity, moment, type AssertEqual } from "@magnis/declare";

import type { EmailAddressDetails, EmailMessageDetails } from "./types.ts";

export const message = entity(
  {
    id: "email.message",
    name: "Email message",
    description: "An email message entity owned by the email plugin.",
    roles: ["content"],
  },
  {
    message_id: z.string().optional(),
    subject: z.string().nullish(),
    from_address: z.string().nullish(),
    from_name: z.string().nullish(),
    snippet: z.string().nullish(),
    body_text: z.string().nullish(),
    body_html: z.string().nullish(),
    has_html_body: z.boolean().optional(),
    sent_at: moment().nullish(),
    received_at: moment().nullish(),
    labels: z.array(z.string()).optional(),
    is_read: z.boolean().optional(),
    is_starred: z.boolean().optional(),
    is_important: z.boolean().optional(),
    has_attachments: z.boolean().optional(),
    thread_id: z.string().optional(),
  },
  { order: ["sent_at", "desc"], title: "subject", body: "body_text" },
) satisfies z.ZodType<EmailMessageDetails>;

const _messageIsTheModulesOwnType: AssertEqual<z.infer<typeof message>, EmailMessageDetails> = true;
void _messageIsTheModulesOwnType;

export const address = entity(
  {
    id: "email.address",
    name: "Email address",
    description: "An email address entity (sender/recipient hub).",
    roles: ["identity_channel"],
    triggerable: true,
  },
  {
    address: z.string(),
    display_name: z.string().nullish(),
  },
  { order: ["address", "asc"] },
) satisfies z.ZodType<EmailAddressDetails>;

const _addressIsTheModulesOwnType: AssertEqual<z.infer<typeof address>, EmailAddressDetails> = true;
void _addressIsTheModulesOwnType;
