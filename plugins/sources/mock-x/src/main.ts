import { runConnector } from "@magnis/connector-sdk";
import { fetchMockX } from "./fetch";

await runConnector({
  name: "mock-x",
  version: "0.1.0",
  surfaces: ["x"],
  intervalSecs: 5,
  fetch: fetchMockX,
  probeAuth: () => Promise.resolve({ subject: "@mock_x_user" }),
});
