import type { JSX } from "react";

/**
 * X brand icon.
 *
 * Inline SVG, exactly like TelegramIcon — the rail must not fetch anything to
 * draw itself. This module used to load `/api/plugins/x/icon.svg` through a
 * CSS mask, which resolved against the PAGE origin: fine in the browser, where
 * the dev server proxies `/api`, and broken inside the desktop webview, where
 * the origin is `tauri://localhost` and the icon silently disappeared.
 */
export interface XIconProps {
  readonly size?: number;
  readonly className?: string;
}

export function XIcon({ size = 22, className }: XIconProps): JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1200 1227"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M714.163 519.284 1160.89 0h-105.86L667.137 450.887 357.328 0H0l468.492 681.821L0 1226.37h105.866l409.625-476.152 327.181 476.152H1200L714.163 519.284Zm-144.7 168.087-47.468-67.894-377.686-540.24h162.604l304.797 435.991 47.468 67.894 396.2 566.721H892.774L569.463 687.371Z" />
    </svg>
  );
}
