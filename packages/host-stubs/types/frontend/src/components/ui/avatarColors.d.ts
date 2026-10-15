/** The avatar colour tokens and the classes they paint with. Shared by
 * `Avatar` and by surfaces that cannot take a class (the graph canvas), so
 * both read one table. */
export type AvatarTokenColor = "orange" | "blue" | "green" | "red" | "purple" | "pink" | "gray";
/** The class an avatar of this colour paints with; none for a custom colour. */
export declare function avatarColorClass(color?: string): string | undefined;
