import type { JSX } from "react";
import type { AskUserPayload } from "../../modules/episodes/types";
export interface AskUserCardProps {
    readonly payload: AskUserPayload;
    readonly submitted: boolean;
    readonly onSubmit: (formattedAnswer: string) => void;
}
export declare function AskUserCard({ payload, submitted, onSubmit, }: AskUserCardProps): JSX.Element;
