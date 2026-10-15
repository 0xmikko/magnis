/** The package ships no declarations; this is the plugin this Source uses. */
declare module "turndown-plugin-gfm" {
  import type TurndownService from "turndown";

  export function gfm(service: TurndownService): void;
}
