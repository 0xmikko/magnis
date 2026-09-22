import { type EpisodeUsageQuery, type EpisodeUsageQueryResult } from "@magnis/sdk";
import type { AppTransport } from "../contracts/transport.ts";
/** Query persisted per-Episode usage; the browser never aggregates transcript rows. */
export declare function queryEpisodeUsage(transport: AppTransport, range: EpisodeUsageQuery): Promise<EpisodeUsageQueryResult>;
