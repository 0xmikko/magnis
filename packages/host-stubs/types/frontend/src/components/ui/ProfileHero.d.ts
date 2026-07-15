import type { ReactNode, JSX } from "react";
export interface ProfileHeroProps {
    /** Avatar element */
    readonly avatar: ReactNode;
    /** Display name */
    readonly name: string;
    /** Subtitle (role, status, etc.) */
    readonly subtitle?: string;
    /** Extra className */
    readonly className?: string;
}
/**
 * A centered profile hero with avatar, name, and optional subtitle.
 * Used in contact detail views.
 */
export declare function ProfileHero({ avatar, name, subtitle, className }: ProfileHeroProps): JSX.Element;
