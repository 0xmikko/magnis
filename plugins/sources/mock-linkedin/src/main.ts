import { runConnector } from "@magnis/connector-sdk";
import { fetchMockLinkedIn } from "./fetch";

await runConnector({
  name: "mock-linkedin",
  version: "0.1.0",
  surfaces: ["linkedin"],
  intervalSecs: 5,
  fetch: fetchMockLinkedIn,
  probeAuth: () => Promise.resolve({ subject: "mock-linkedin-key" }),
});
