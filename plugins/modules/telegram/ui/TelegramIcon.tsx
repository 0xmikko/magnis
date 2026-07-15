import type { JSX } from "react";
/**
 * Telegram brand icon (paper airplane).
 * SVG path based on the official Telegram logo.
 */

export interface TelegramIconProps {
  readonly size?: number;
  readonly className?: string;
}

export function TelegramIcon({
  size = 22,
  className,
}: TelegramIconProps): JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
      <line x1="22" y1="2" x2="11" y2="13" />
    </svg>
  );
}
