import type { ReactNode, JSX } from "react";
export interface MemberItemProps {
    /** Avatar element */
    readonly avatar: ReactNode;
    /** Name to display */
    readonly name: string;
    /** Extra className */
    readonly className?: string;
}
/**
 * A compact row with an avatar and a name. Used in team member lists.
 */
export declare function MemberItem({ avatar, name, className }: MemberItemProps): JSX.Element;
