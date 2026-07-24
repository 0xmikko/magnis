import { useRef, useCallback, useState, useEffect } from "react";
import type { JSX } from "react";
import {
  ActionButton,
  Icon,
  Stack,
  Row,
  Text,
} from "@magnis/host/ui";
import type { EmailDetailData } from "./types";
import type { LinkedEntitySummary } from "@magnis/host/base";
import { formatFileSize } from "@magnis/host/utils";

export interface EmailDetailContentProps {
  readonly detail: EmailDetailData | undefined;
  readonly linkedEntities?: readonly LinkedEntitySummary[];
}

/** Returns true when the HTML is a rich/designed email (tables, inline styles, multiple divs).
 *  Plain text wrapped in a single <div> with <br/> by Gmail is NOT rich. */
export function isRichHtml(raw: string): boolean {
  if (/<table\b/i.test(raw)) return true;
  if (/style\s*=/i.test(raw)) return true;
  // Multiple divs = structured layout; single wrapper div = Gmail plain text
  const divCount = (raw.match(/<div[\s>]/gi) ?? []).length;
  return divCount > 1;
}

/** Inject base styles into email HTML. Plain-text-wrapped emails get dark bg + light text. */
function prepareEmailHtml(raw: string, dark: boolean): string {
  const bg = dark ? "#0E0E0E" : "#ffffff";
  const color = dark ? "#E0E0E0" : "#000000";
  const linkColor = dark ? "#93C5FD" : "#1a0dab";
  const padding = dark ? "20px 24px" : "0";
  const baseStyle = `<style>
html{overflow:hidden!important;background:${bg};}
body{margin:0;padding:${padding};color:${color};font-family:Inter,system-ui,sans-serif;font-size:14px;line-height:1.6;}
a{color:${linkColor};}
</style>`;
  if (/<head[\s>]/i.test(raw)) {
    return raw.replace(/(<head[^>]*>)/i, `$1${baseStyle}`);
  }
  if (/<html[\s>]/i.test(raw)) {
    return raw.replace(/(<html[^>]*>)/i, `$1<head>${baseStyle}</head>`);
  }
  return `<!DOCTYPE html><html><head>${baseStyle}</head><body>${raw}</body></html>`;
}

function HtmlEmailFrame({ html, dark }: { html: string; dark: boolean }): JSX.Element {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState<number>(0);
  const observerRef = useRef<ResizeObserver | null>(null);

  const measureHeight = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body) return;
    const h = doc.body.getBoundingClientRect().height;
    if (h > 0) setContentHeight(Math.ceil(h));
  }, []);

  const handleLoad = useCallback(() => {
    measureHeight();
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body) return;
    observerRef.current?.disconnect();
    const observer = new ResizeObserver(measureHeight);
    observer.observe(doc.body);
    observerRef.current = observer;
  }, [measureHeight]);

  useEffect(() => {
    return (): void => { observerRef.current?.disconnect(); };
  }, []);

  // Calculate min-height: from iframe position to bottom of viewport
  const [minHeight, setMinHeight] = useState(400);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateMinHeight = (): void => {
      const rect = el.getBoundingClientRect();
      // Leave 32px for status bar
      setMinHeight(Math.max(200, window.innerHeight - rect.top - 32));
    };
    updateMinHeight();
    window.addEventListener("resize", updateMinHeight);
    return (): void => { window.removeEventListener("resize", updateMinHeight); };
  }, []);

  // Use content height if measured, otherwise fill available space
  const frameHeight = contentHeight > 0 ? Math.max(contentHeight, minHeight) : minHeight;

  return (
    <div ref={containerRef}>
      <iframe
        ref={iframeRef}
        srcDoc={prepareEmailHtml(html, dark)}
        sandbox="allow-same-origin"
        className="border-0 block"
        style={{ height: frameHeight, width: "100%" }}
        onLoad={handleLoad}
        title="Email body"
      />
    </div>
  );
}

export function EmailDetailContent({ detail, linkedEntities }: EmailDetailContentProps): JSX.Element {
  const hasHtml = !!detail?.bodyHtml;
  const rich = hasHtml && detail.bodyHtml ? isRichHtml(detail.bodyHtml) : false;

  return (
    <Stack gap={0}>
      {hasHtml && detail.bodyHtml ? (
        <HtmlEmailFrame html={detail.bodyHtml} dark={!rich} />
      ) : (
        /* Plain text fallback: padded */
        <Stack gap={4} px={5} py={4}>
          {detail?.bodyParagraphs.map((paragraph, i) => (
            <Text key={i} variant="body" leading="relaxed">{paragraph}</Text>
          ))}
        </Stack>
      )}

      {/* Attachments + actions — always padded */}
      {(detail?.attachments?.length ?? 0) > 0 || (detail?.actions.length ?? 0) > 0 ? (
        <Stack gap={4} px={5} py={4}>
          {detail?.attachments?.length ? (
            <Stack gap={2} className="pt-3 border-t border-white/5">
              <Text variant="caption" weight="semibold">
                Attachments ({detail.attachments.length})
              </Text>
              {detail.attachments.map((att) => {
                const linkedFile = linkedEntities?.find(
                  (le) => le.link_kind === "attachment" && le.name === att.filename,
                );
                const href = linkedFile
                  ? `/#/file/object/${linkedFile.id}`
                  : att.path;
                return (
                  <a
                    key={att.path || att.filename}
                    href={href}
                    {...(linkedFile ? {} : { target: "_blank", rel: "noopener noreferrer" })}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors no-underline cursor-pointer"
                    data-testid={`attachment-link-${att.filename}`}
                  >
                    <Icon name="file" size={14} />
                    <Text variant="body" truncate className="flex-1">{att.filename}</Text>
                    <Text variant="caption" noShrink>{formatFileSize(att.size)}</Text>
                  </a>
                );
              })}
            </Stack>
          ) : null}
          {detail?.actions.length ? (
            <Row gap={2}>
              {detail.actions.map((action) => (
                <ActionButton
                  key={action.label}
                  label={action.label}
                  variant={action.variant === "primary" ? "primary" : "default"}
                />
              ))}
            </Row>
          ) : null}
        </Stack>
      ) : null}
    </Stack>
  );
}
