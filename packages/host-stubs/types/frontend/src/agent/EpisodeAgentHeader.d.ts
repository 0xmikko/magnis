/**
 * The context panel's first line: which agent answers this episode, which
 * model it uses, and what the last turn's parameters came to.
 *
 * Plan: docs/plans/episode-agent-parity.md S8; layout in
 * docs/backend/episodes.md ("[Target] The context panel").
 *
 * The agent is chosen while the episode is empty and frozen by its first
 * message — an episode is a conversation with ONE agent. So after the freeze
 * the control is disabled rather than hidden, and still says what was chosen:
 * a control that disappears reads as the app forgetting.
 *
 * The model may change at any time, within the family its agent can reach.
 */
import { type JSX } from "react";
import type { TurnResolution } from "@magnis/client-core";
export interface AgentChoice {
    readonly id: string;
    readonly label: string;
}
export interface EpisodeAgentHeaderProps {
    readonly engine: string | null;
    readonly engineLocked: boolean;
    readonly engines: readonly string[];
    /** Models this engine may be asked for — `id` is the catalogue row, `label`
     *  the provider's wire name. They differ, and the row is what is stored. */
    readonly models: readonly AgentChoice[];
    readonly model: string | null;
    readonly lastTurnResolution?: TurnResolution | null;
    /** Why the last choice was refused. The backend refuses a frozen engine and
     *  an unrunnable model on purpose; not showing it leaves a control that
     *  looks broken. */
    readonly error?: string | null;
    readonly onSelectEngine: (engine: string) => void;
    readonly onSelectModel: (model: string | null) => void;
}
export declare function EpisodeAgentHeader({ engine, engineLocked, engines, models, model, lastTurnResolution, error, onSelectEngine, onSelectModel, }: EpisodeAgentHeaderProps): JSX.Element;
