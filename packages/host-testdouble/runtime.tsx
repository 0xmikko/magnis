/** `@magnis/host/runtime` — the app context a plugin UI reaches the host by.
 *
 * A plugin usually receives `runtime` as a prop and the double never enters
 * the picture. Where a component calls `useAppRuntime()` or
 * `useRouterContext()` instead, a test seeds them with `setHostRuntime()` /
 * `setHostRouter()` — an explicit hand-off, so a component reading the
 * runtime out of thin air fails loudly rather than rendering against an
 * invented default.
 */
import { useSyncExternalStore, type JSX, type ReactNode } from "react";

import { BaseEntityCard } from "./internal/entity-card";

/* ── Seeded singletons ──────────────────────────────────────── */

interface Seed<T> {
  value: T | null;
  listeners: Set<() => void>;
}

function makeSeed<T>(): Seed<T> {
  return { value: null, listeners: new Set() };
}

function setSeed<T>(seed: Seed<T>, value: T | null): void {
  seed.value = value;
  for (const listener of seed.listeners) listener();
}

function useSeed<T>(seed: Seed<T>, name: string): T {
  const value = useSyncExternalStore(
    (listener: () => void) => {
      seed.listeners.add(listener);
      return (): void => {
        seed.listeners.delete(listener);
      };
    },
    () => seed.value,
    () => seed.value,
  );
  if (value === null) {
    throw new Error(
      `${name}() was called with no host seeded. Call ${name === "useAppRuntime" ? "setHostRuntime" : "setHostRouter"}() in the test, or pass the value as a prop.`,
    );
  }
  return value;
}

const runtimeSeed = makeSeed<Record<string, unknown>>();
const routerSeed = makeSeed<Record<string, unknown>>();

/** Seed what `useAppRuntime()` returns for this test. Pass null to clear. */
export function setHostRuntime(runtime: unknown): void {
  setSeed(runtimeSeed, runtime as Record<string, unknown> | null);
}

/** Seed what `useRouterContext()` returns for this test. Pass null to clear. */
export function setHostRouter(router: unknown): void {
  setSeed(routerSeed, router as Record<string, unknown> | null);
}

export function useAppRuntime(): never {
  return useSeed(runtimeSeed, "useAppRuntime") as never;
}

export function useRouterContext(): never {
  return useSeed(routerSeed, "useRouterContext") as never;
}

/* ── Entity card resolution ─────────────────────────────────── */

interface RuntimeLike {
  readonly agent: {
    resolveEntityRenderer: (schemaId: string) =>
      | { readonly Render: (props: Record<string, unknown>) => JSX.Element }
      | undefined
      | null;
  };
}

/** The host flattens the `created` envelope before handing a card its data. */
function resolveCardFields(data: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  if (data.kind === "created" && data.entity !== undefined && typeof data.entity === "object" && data.entity !== null) {
    return { ...(data.entity as Record<string, unknown>) };
  }
  return data;
}

export function EntityCardRenderer({
  schemaId,
  data,
  runtime,
  action,
}: {
  readonly schemaId: string;
  readonly data: Readonly<Record<string, unknown>>;
  readonly runtime: unknown;
  readonly action?: string;
}): JSX.Element {
  const resolved = resolveCardFields(data);
  const reg = (runtime as RuntimeLike).agent.resolveEntityRenderer(schemaId);
  if (reg) {
    const Render = reg.Render;
    return <Render schemaId={schemaId} data={resolved} runtime={runtime} action={action} />;
  }
  // A schema nobody registered still gets a card, and it is still a LINK —
  // `TriggerDetailPanel` asserts exactly that for its watched-entity rows.
  return <BaseEntityCard schemaId={schemaId} data={resolved} runtime={runtime} action={action} />;
}

/* ── Transport helpers ──────────────────────────────────────── */

export interface UploadedFile {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
}

interface TransportLike {
  readonly baseUrl: string;
}

export function authHeaders(extra?: HeadersInit): HeadersInit {
  // No token in a test stand: the host's own contract is "no token, no
  // Authorization header", so the double returns exactly what the caller gave.
  return extra ?? {};
}

export async function uploadBrowserFile(transport: TransportLike, file: File): Promise<UploadedFile> {
  const formData = new FormData();
  formData.append("file", file, file.name);
  const response = await fetch(`${transport.baseUrl}/files/upload`, {
    method: "POST",
    headers: authHeaders(),
    credentials: "include",
    body: formData,
  });
  if (!response.ok) {
    throw new Error(`upload failed: ${String(response.status)}`);
  }
  const raw = (await response.json()) as {
    id: string;
    name: string;
    mime_type: string;
    size_bytes: number;
  };
  return { id: raw.id, name: raw.name, mimeType: raw.mime_type, sizeBytes: raw.size_bytes };
}

export async function uploadFile(_transport: TransportLike): Promise<UploadedFile | null> {
  // The real one opens a file picker (Tauri dialog or an <input type=file>).
  // There is no picker in a test stand; a plugin that wants a file uses
  // `uploadBrowserFile` with one it constructed.
  return Promise.resolve(null);
}

export function setupEventInvalidation(): () => void {
  return () => {
    /* nothing subscribed */
  };
}

/* ── useModuleList ──────────────────────────────────────────── */

export function useModuleList<T>(config: {
  readonly rpcMethod: string;
  readonly queryKeyBase: readonly unknown[];
  readonly mapItem: (raw: never) => T;
  readonly getId: (item: T) => string;
  readonly pageSize?: number;
  readonly extraParams?: Readonly<Record<string, unknown>>;
}): {
  readonly items: readonly T[];
  readonly total: number;
  readonly isLoading: boolean;
  readonly searchQuery: string;
  readonly setSearchQuery: (q: string) => void;
  readonly selectedId: string | undefined;
  readonly setSelectedId: (id: string | undefined) => void;
  readonly hasMore: boolean;
  readonly loadMore: () => void;
  readonly navigateTo: (id: string) => void;
  readonly patchItem: (id: string, patch: Partial<T>) => void;
} {
  // The host's version is a TanStack Query + router integration. A plugin
  // list test drives its own data, so the double is the empty, settled list —
  // `config.mapItem`/`getId` stay unused rather than being invented over.
  void config;
  return {
    items: [],
    total: 0,
    isLoading: false,
    searchQuery: "",
    setSearchQuery: () => undefined,
    selectedId: undefined,
    setSelectedId: () => undefined,
    hasMore: false,
    loadMore: () => undefined,
    navigateTo: () => undefined,
    patchItem: () => undefined,
  };
}

/** Convenience wrapper: seed the runtime for everything rendered inside. */
export function HostRuntimeProvider({
  runtime,
  router,
  children,
}: {
  readonly runtime?: unknown;
  readonly router?: unknown;
  readonly children: ReactNode;
}): JSX.Element {
  if (runtime !== undefined) setHostRuntime(runtime);
  if (router !== undefined) setHostRouter(router);
  return <>{children}</>;
}
