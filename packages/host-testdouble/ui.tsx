/** `@magnis/host/ui` — the host's presentational primitives.
 *
 * A double renders what a plugin can legitimately assert: the text and nodes
 * the plugin passed in, the className the plugin chose, and the handlers it
 * wired. It does NOT reproduce the host's Tailwind classes — a plugin test
 * that asserts `bg-surface-secondary` is asserting the host's design, and
 * that assertion belongs in the host.
 *
 * Every element carries `data-host="<Name>"` so a plugin test can address a
 * primitive it did not give a test id to.
 */
import {
  createElement,
  useCallback,
  useState,
  type JSX,
  type MouseEvent,
  type ReactNode,
} from "react";
import * as L from "lucide-react";
import type { LucideIcon } from "lucide-react";

/* ── Utility ────────────────────────────────────────────────── */

export function cn(...parts: readonly (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/* ── Layout primitives ──────────────────────────────────────── */

interface BoxProps {
  readonly className?: string;
  readonly children: ReactNode;
}

export function Stack({ className, children }: BoxProps & Record<string, unknown>): JSX.Element {
  return (
    <div data-host="Stack" className={className}>
      {children}
    </div>
  );
}

export function Row({ className, children }: BoxProps & Record<string, unknown>): JSX.Element {
  return (
    <div data-host="Row" className={className}>
      {children}
    </div>
  );
}

export function Card({ className, children }: BoxProps & Record<string, unknown>): JSX.Element {
  return (
    <div data-host="Card" className={className}>
      {children}
    </div>
  );
}

export function Scrollable({ className, children }: BoxProps & Record<string, unknown>): JSX.Element {
  return (
    <div data-host="Scrollable" className={className}>
      {children}
    </div>
  );
}

export function Text({
  as = "span",
  className,
  children,
  ...rest
}: {
  readonly as?: "span" | "div" | "p";
  readonly className?: string;
  readonly children: ReactNode;
} & Record<string, unknown>): JSX.Element {
  // `variant`/`color`/`weight` decide host typography, which a plugin cannot
  // assert — but WHICH variant it asked for is the plugin's own choice, so
  // surface it as an attribute rather than dropping it.
  return createElement(
    as,
    {
      "data-host": "Text",
      "data-variant": rest.variant as string | undefined,
      "data-color": rest.color as string | undefined,
      className,
    },
    children,
  );
}

/* ── Core components ────────────────────────────────────────── */

/** The host's icon-name → glyph map.
 *
 * Ported rather than stubbed because the names are the CONTRACT: a plugin
 * writes `icon="file"` and gets a document glyph, and tests assert the
 * rendered `lucide-file-text` svg. A stub that ignored the name would let a
 * plugin ship a name the host does not know and never hear about it.
 * `isIconName` answers from this same map, so an unknown name is a failure
 * here exactly as it is in the host.
 */
const ICON_BY_NAME: Readonly<Record<string, LucideIcon>> = {
  activity: L.Activity, archive: L.Archive, "archive-restore": L.ArchiveRestore,
  "arrow-left": L.ArrowLeft, "arrow-right": L.ArrowRight, "arrow-up": L.ArrowUp,
  "arrow-up-right": L.ArrowUpRight, attach: L.Paperclip, bell: L.Bell,
  "bell-off": L.BellOff, bot: L.Bot, brain: L.Brain, building: L.Building2,
  calendar: L.Calendar, check: L.Check, "check-square": L.CheckSquare,
  "chevron-down": L.ChevronDown, "chevron-right": L.ChevronRight,
  "chevron-up": L.ChevronUp, circle: L.Circle, "circle-alert": L.CircleAlert,
  "circle-check": L.CircleCheck, "circle-dot": L.CircleDot, clock: L.Clock,
  "clock-3": L.Clock3, close: L.X, code: L.Code,
  "corner-down-left": L.CornerDownLeft, "corner-up-left": L.CornerUpLeft,
  contacts: L.UserRoundPlus, copy: L.ClipboardCopy, edit: L.PenSquare,
  "ellipsis-vertical": L.EllipsisVertical, extensions: L.Puzzle, file: L.FileText,
  "file-image": L.FileImage, filter: L.Filter, folder: L.Folder, gift: L.Gift,
  globe: L.Globe, handshake: L.Handshake, hash: L.Hash, history: L.History,
  image: L.Image, inbox: L.Inbox, link: L.Link, lock: L.Lock, loader: L.Loader,
  mail: L.Mail, "maximize-2": L.Maximize2, "minimize-2": L.Minimize2,
  "map-pin": L.MapPin, menu: L.Menu, message: L.MessageCircle,
  "message-circle": L.MessageCircle, mic: L.Mic, monitor: L.Monitor, moon: L.Moon,
  more: L.CircleEllipsis, note: L.Notebook, "notebook-pen": L.NotebookPen,
  paperclip: L.Paperclip, pause: L.Pause, play: L.Play, pencil: L.Pencil,
  square: L.Square, phone: L.Phone, pin: L.Pin, plus: L.Plus, puzzle: L.Puzzle,
  package: L.Package, search: L.Search, send: L.Send, slack: L.MessageSquare,
  settings: L.Settings, "shield-alert": L.ShieldAlert, briefcase: L.Briefcase,
  "chevron-left": L.ChevronLeft, eye: L.Eye, "eye-off": L.EyeOff, heart: L.Heart,
  "id-card": L.IdCard, "repeat-2": L.Repeat2, scale: L.Scale,
  "shield-check": L.ShieldCheck, anchor: L.Anchor, plug: L.Plug,
  palette: L.Palette, "panel-bottom": L.PanelBottom, "panel-right": L.PanelRight,
  webhook: L.Webhook, smile: L.Smile, sun: L.Sun, tasks: L.ListChecks,
  trash: L.Trash2, "trending-down": L.TrendingDown, user: L.User, users: L.Users,
  video: L.Video, wallet: L.Wallet, zap: L.Zap,
};

export function Icon({
  name,
  size = 16,
  className,
}: {
  readonly name: string;
  readonly size?: number;
  readonly className?: string;
}): JSX.Element {
  const Resolved = ICON_BY_NAME[name];
  if (!Resolved) {
    return (
      <span data-icon={name} data-host="Icon" className={className} title={`Missing icon: ${name}`}>
        ?
      </span>
    );
  }
  return (
    <span data-icon={name} data-host="Icon" className={className} aria-hidden="true">
      <Resolved size={size} strokeWidth={1.6} />
    </span>
  );
}

export function isIconName(value: string): boolean {
  return Object.prototype.hasOwnProperty.call(ICON_BY_NAME, value);
}

export function Avatar({
  label,
  imageSrc,
  imageAlt = "",
  color,
  status,
}: {
  readonly label: string;
  readonly imageSrc?: string;
  readonly imageAlt?: string;
  readonly color?: string;
  readonly status?: string;
}): JSX.Element {
  // The host falls back to initials when the image fails to load; a plugin
  // that passes an avatar URL relies on that, so the double keeps it.
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <div data-host="Avatar" data-color={color} data-status={status}>
      {imageSrc && !imageFailed ? (
        <img
          src={imageSrc}
          alt={imageAlt}
          onError={() => {
            setImageFailed(true);
          }}
        />
      ) : (
        <span>{label}</span>
      )}
    </div>
  );
}

export function IconButton({
  children,
  onClick,
  label,
}: {
  readonly children: ReactNode;
  readonly onClick?: () => void;
  readonly label?: string;
  readonly variant?: string;
}): JSX.Element {
  return (
    <button type="button" data-host="IconButton" aria-label={label} onClick={onClick}>
      {children}
    </button>
  );
}

export function ActionButton({
  label,
  icon,
  onClick,
}: {
  readonly label: string;
  readonly icon?: string;
  readonly onClick?: () => void;
  readonly variant?: string;
  readonly size?: string;
}): JSX.Element {
  return (
    <button type="button" data-host="ActionButton" onClick={onClick}>
      {icon ? <span data-icon={icon} /> : null}
      {label}
    </button>
  );
}

export function AddButton({
  className,
  onClick,
}: {
  readonly className?: string;
  readonly onClick?: () => void;
}): JSX.Element {
  return (
    <button type="button" data-host="AddButton" aria-label="Add" className={className} onClick={onClick} />
  );
}

export function Tag({ label }: { readonly label: string; readonly variant?: string; readonly mode?: string }): JSX.Element {
  return <span data-host="Tag">{label}</span>;
}

export function ChannelChip({
  icon,
  label,
  className,
}: {
  readonly icon?: ReactNode;
  readonly label: string;
  readonly className?: string;
}): JSX.Element {
  return (
    <span data-host="ChannelChip" className={className}>
      {icon}
      {label}
    </span>
  );
}

/* ── Headers, lists, data display ───────────────────────────── */

export const TOPBAR_AVATAR_SIZE = "sm";

export function TopBarHeader({
  leading,
  title,
  subtitle,
  extra,
  actions,
  className,
  titleClassName,
  subtitleClassName,
  onTitleEdit,
}: {
  readonly leading?: ReactNode;
  readonly title: ReactNode;
  readonly subtitle?: ReactNode;
  readonly extra?: ReactNode;
  readonly actions?: ReactNode;
  readonly className?: string;
  readonly titleClassName?: string;
  readonly subtitleClassName?: string;
  readonly onTitleEdit?: (name: string) => void;
}): JSX.Element {
  return (
    <div
      data-host="TopBarHeader"
      data-testid="top-bar-header"
      data-title-class={titleClassName}
      data-subtitle-class={subtitleClassName}
      className={className}
    >
      {leading}
      {onTitleEdit ? (
        <EditableTitle
          value={typeof title === "string" ? title : null}
          onCommit={onTitleEdit}
          className={titleClassName}
        />
      ) : (
        <div className={titleClassName}>{title}</div>
      )}
      {subtitle ? <div className={subtitleClassName}>{subtitle}</div> : null}
      {extra ?? null}
      {actions ?? null}
    </div>
  );
}

export function EditableTitle({
  value,
  onCommit,
  placeholder,
  className,
}: {
  readonly value: string | null;
  readonly onCommit: (name: string) => void;
  readonly placeholder?: string;
  readonly className?: string;
}): JSX.Element {
  // Click to edit, Enter to commit, Escape to abandon — the plugin-visible
  // contract of the host component.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  if (!editing) {
    return (
      <span
        data-host="EditableTitle"
        className={className}
        onClick={() => {
          setDraft(value ?? "");
          setEditing(true);
        }}
      >
        {value ?? placeholder ?? ""}
      </span>
    );
  }
  return (
    <input
      data-host="EditableTitle"
      className={className}
      value={draft}
      placeholder={placeholder}
      autoFocus
      onChange={(e) => {
        setDraft(e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          onCommit(draft);
          setEditing(false);
        }
        if (e.key === "Escape") setEditing(false);
      }}
    />
  );
}

export function SectionHeader({
  title,
  action,
  className,
}: {
  readonly title: string;
  readonly action?: ReactNode;
  readonly className?: string;
}): JSX.Element {
  return (
    <div data-host="SectionHeader" className={className}>
      <span>{title}</span>
      {action}
    </div>
  );
}

export function ModuleListItem({
  selected,
  children,
  onContextMenu,
}: {
  readonly selected?: boolean;
  readonly children: ReactNode;
  readonly onContextMenu?: (e: MouseEvent) => void;
}): JSX.Element {
  return (
    <div
      data-host="ModuleListItem"
      data-selected={selected === true ? "true" : "false"}
      onContextMenu={onContextMenu}
    >
      {children}
    </div>
  );
}

export function InfoCard({
  rows,
}: {
  readonly rows: readonly { readonly label: string; readonly value: ReactNode; readonly action?: ReactNode }[];
}): JSX.Element {
  return (
    <div data-host="InfoCard">
      {rows.map((row) => (
        <div key={row.label} data-host="InfoCardRow">
          <span>{row.label}</span>
          <span>{row.value}</span>
          {row.action}
        </div>
      ))}
    </div>
  );
}

export function StatsGrid({
  stats,
}: {
  readonly stats: readonly { readonly value: string; readonly label: string }[];
}): JSX.Element {
  return (
    <div data-host="StatsGrid">
      {stats.map((stat) => (
        <div key={stat.label} data-host="StatCard">
          <span>{stat.value}</span>
          <span>{stat.label}</span>
        </div>
      ))}
    </div>
  );
}

export function DateBadge({ day, month }: { readonly day: string; readonly month: string; readonly size?: string }): JSX.Element {
  return (
    <div data-host="DateBadge">
      <span>{day}</span>
      <span>{month}</span>
    </div>
  );
}

export function NoteCard({
  content,
  meta,
  className,
}: {
  readonly content: string;
  readonly meta: string;
  readonly className?: string;
}): JSX.Element {
  return (
    <div data-host="NoteCard" className={className}>
      <div>{content}</div>
      <div>{meta}</div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  subtitle,
  className,
}: {
  readonly icon: ReactNode;
  readonly title: string;
  readonly subtitle?: string;
  readonly className?: string;
}): JSX.Element {
  return (
    <div data-host="EmptyState" className={className}>
      {icon}
      <div>{title}</div>
      {subtitle ? <div>{subtitle}</div> : null}
    </div>
  );
}

export function NavArrows({
  label,
  className,
  onPrev,
  onNext,
}: {
  readonly label: string;
  readonly className?: string;
  readonly onPrev?: () => void;
  readonly onNext?: () => void;
}): JSX.Element {
  return (
    <div data-host="NavArrows" className={className}>
      <button type="button" aria-label="Previous" onClick={onPrev} />
      <span>{label}</span>
      <button type="button" aria-label="Next" onClick={onNext} />
    </div>
  );
}

/* ── Tabs ───────────────────────────────────────────────────── */

interface TabLike {
  readonly id: string;
  readonly label: string;
}

export function ViewTabs({
  tabs,
  activeTab,
  onTabChange,
  title,
}: {
  readonly tabs: readonly TabLike[];
  readonly activeTab: string;
  readonly onTabChange: (tabId: string) => void;
  readonly title?: string;
}): JSX.Element {
  return (
    <div data-host="ViewTabs">
      {title ? <span>{title}</span> : null}
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          data-tab={tab.id}
          data-active={tab.id === activeTab ? "true" : "false"}
          onClick={() => {
            onTabChange(tab.id);
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function SearchableTabs({
  tabs,
  activeTab,
  onTabChange,
}: {
  readonly tabs: readonly TabLike[];
  readonly activeTab: string;
  readonly onTabChange: (tabId: string) => void;
} & Record<string, unknown>): JSX.Element {
  return (
    <div data-host="SearchableTabs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          data-tab={tab.id}
          data-active={tab.id === activeTab ? "true" : "false"}
          onClick={() => {
            onTabChange(tab.id);
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/* ── Calendar ───────────────────────────────────────────────── */

export function AgendaList({
  groups,
  selectedId,
  onItemClick,
  className,
}: {
  readonly groups: readonly {
    readonly date: Date;
    readonly items: readonly { readonly id: string; readonly content: ReactNode }[];
  }[];
  readonly selectedId?: string;
  readonly onItemClick?: (id: string) => void;
  readonly className?: string;
}): JSX.Element {
  return (
    <div data-host="AgendaList" className={className}>
      {groups.map((group) => (
        <div key={group.date.toISOString()} data-host="AgendaGroup">
          {group.items.map((item) => (
            <div
              key={item.id}
              data-host="AgendaItem"
              data-selected={item.id === selectedId ? "true" : "false"}
              onClick={() => onItemClick?.(item.id)}
            >
              {item.content}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function MiniCalendar({
  selectedDate,
  displayMonth,
  onDateClick,
  onMonthChange,
  className,
}: {
  readonly selectedDate?: Date;
  readonly displayMonth: Date;
  readonly onDateClick: (date: Date) => void;
  readonly onMonthChange: (delta: -1 | 1) => void;
  readonly className?: string;
}): JSX.Element {
  return (
    <div
      data-host="MiniCalendar"
      data-month={displayMonth.toISOString()}
      data-selected={selectedDate?.toISOString()}
      className={className}
    >
      <button
        type="button"
        aria-label="Previous month"
        onClick={() => {
          onMonthChange(-1);
        }}
      />
      <button
        type="button"
        aria-label="Next month"
        onClick={() => {
          onMonthChange(1);
        }}
      />
      <button
        type="button"
        aria-label="Pick day"
        onClick={() => {
          onDateClick(displayMonth);
        }}
      />
    </div>
  );
}

/* ── Context menu ───────────────────────────────────────────── */

export interface ContextMenuEntryLike {
  readonly id?: string;
  readonly label?: string;
  readonly separator?: boolean;
}

export function ContextMenu({
  items,
  onSelect,
  onClose,
}: {
  readonly items: readonly ContextMenuEntryLike[];
  readonly position: { readonly x: number; readonly y: number };
  readonly onSelect: (itemId: string) => void;
  readonly onClose: () => void;
}): JSX.Element {
  return (
    <div data-host="ContextMenu">
      {items.map((item, index) =>
        item.separator === true || item.id === undefined ? (
          <hr key={`sep-${String(index)}`} />
        ) : (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              onSelect(item.id ?? "");
              onClose();
            }}
          >
            {item.label}
          </button>
        ),
      )}
    </div>
  );
}

export function ContextMenuSurface({ children }: { readonly children: ReactNode }): JSX.Element {
  return <div data-host="ContextMenuSurface">{children}</div>;
}

export function useContextMenu<T>(): {
  state: { isOpen: boolean; position: { x: number; y: number }; data: T | null };
  open: (event: MouseEvent, data: T) => void;
  close: () => void;
} {
  const [state, setState] = useState<{
    isOpen: boolean;
    position: { x: number; y: number };
    data: T | null;
  }>({ isOpen: false, position: { x: 0, y: 0 }, data: null });

  const open = useCallback((event: MouseEvent, data: T) => {
    event.preventDefault();
    setState({ isOpen: true, position: { x: event.clientX, y: event.clientY }, data });
  }, []);

  const close = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: false, data: null }));
  }, []);

  return { state, open, close };
}
