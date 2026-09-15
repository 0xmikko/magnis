export type SourceAuthKind = "oauth2" | "phone_code" | "api_key" | "shared_provider";
export interface SourceStatus {
    readonly source_id: string;
    readonly kind: SourceAuthKind;
    /** 0..N независимых аккаунтов. [] = не подключён. Точка. */
    readonly accounts: readonly Account[];
}
export interface Account {
    /** RUNTIME-ключ секретов/sync_state: oauth/phone = connection_id,
     *  api_key = "default" (v1). Пользователю НЕ показывается. */
    readonly account_id: string;
    /** Человеческая идентичность от провайдера: email | masked phone |
     *  probe subject. Всегда заполнена (§4.1). UI видит только её. */
    readonly display: string;
    readonly state: AccountState;
    /** ровно по одному на каждый синкаемый surface источника */
    readonly surfaces: readonly SurfaceSync[];
}
export type AccountState = {
    readonly state: "connected";
    readonly auth: VerifiedAuth;
    readonly since: string;
} | {
    readonly state: "auth_lost";
    readonly reason: AuthLossReason;
    readonly since: string;
    readonly repair: RepairAction;
};
export type VerifiedAuth = {
    readonly kind: "oauth";
    readonly connection_id: string;
    readonly subject: string;
} | {
    readonly kind: "phone_session";
    readonly connection_id: string;
    readonly subject: string;
} | {
    readonly kind: "api_key";
    readonly key_from: "vault" | "env";
    readonly subject: string;
} | {
    readonly kind: "shared_provider";
    readonly subject: string;
};
export type AuthLossReason = {
    readonly reason: "oauth_expired";
} | {
    readonly reason: "oauth_revoked";
} | {
    readonly reason: "session_lost";
} | {
    readonly reason: "key_rejected";
    readonly provider_message: string;
} | {
    readonly reason: "key_removed";
};
export type RepairAction = "reconnect_oauth" | "relogin_phone" | "enter_key" | "replace_key";
export type SurfaceSync = {
    readonly state: "never_synced";
    readonly surface: string;
    readonly provisioned_at: string;
} | {
    readonly state: "bootstrapping";
    readonly surface: string;
    readonly run: SyncRun;
} | {
    readonly state: "catching_up";
    readonly surface: string;
    readonly run: SyncRun;
    readonly last_success: SyncReport;
} | {
    readonly state: "synced";
    readonly surface: string;
    readonly last_success: SyncReport;
    readonly items: ItemCount;
} | {
    readonly state: "live";
    readonly surface: string;
    readonly since: string;
    readonly last_event_at: string;
    readonly last_success: SyncReport;
    readonly items: ItemCount;
} | {
    readonly state: "rate_limited";
    readonly surface: string;
    readonly retry_at: string;
    readonly history: PriorSuccess;
} | {
    readonly state: "failed";
    readonly surface: string;
    readonly error: SyncError;
    readonly failed_at: string;
    readonly attempts: number;
    readonly history: PriorSuccess;
};
export type PriorSuccess = {
    readonly state: "never";
} | {
    readonly state: "last_at";
    readonly report: SyncReport;
};
/** The settled-surface badge number: the user's REAL graph item count for the
 *  surface, in the module's primary-item units (emails / messages / meetings /
 *  contacts — the module manifest's `sync_item_schemas`). A DB-derived total,
 *  NEVER `SyncReport.ingested` (an envelope counter for ONE run whose meaning
 *  flips between bootstrap-cumulative and one catchup cycle — the "Email · 1"
 *  incident). `unknown` = no declared countable schema; render NO number. */
export type ItemCount = {
    readonly state: "exact";
    readonly value: number;
} | {
    readonly state: "unknown";
};
/** Текущий цикл: где курсор, сколько уже, сколько всего, когда последний
 *  прогресс-репорт. Все поля обязательны.
 *
 *  Units (universal-sync-progress DEC-2): `fetched`/`ingested` count ENVELOPES
 *  of this run; `discovered` is the connector's CUMULATIVE primary-item count —
 *  the SAME units as `total` (telegram: dialogs; gmail: messages). The
 *  determinate progress pair is `discovered / total`; `fetched`/`ingested`
 *  must NEVER meet `total` in any rendered pair (a telegram envelope count
 *  runs up to ~51× the dialog count). `discovered = 0` means the source has
 *  not reported one yet — then NO numeric progress renders (see
 *  `surfaceProgress`; there is no envelope fallback). */
export interface SyncRun {
    readonly started_at: string;
    readonly cursor: Cursor;
    readonly fetched: number;
    readonly ingested: number;
    readonly discovered: number;
    readonly total: TotalEstimate;
    readonly last_report_at: string;
}
export type Cursor = {
    readonly state: "start";
} | {
    readonly state: "at";
    readonly value: string;
} | {
    readonly state: "end";
};
export type TotalEstimate = {
    readonly state: "exact";
    readonly value: number;
} | {
    readonly state: "at_least";
    readonly value: number;
} | {
    readonly state: "unknown";
};
/** Завершённый УСПЕШНЫЙ цикл — единственный источник слова "Synced". */
export interface SyncReport {
    readonly started_at: string;
    readonly finished_at: string;
    readonly fetched: number;
    readonly ingested: number;
    readonly cursor_after: Cursor;
}
export type SyncError = {
    readonly kind: "auth";
    readonly message: string;
} | {
    readonly kind: "network";
    readonly message: string;
} | {
    readonly kind: "contract";
    readonly message: string;
} | {
    readonly kind: "internal";
    readonly message: string;
};
export interface SourceStatusListResponse {
    readonly sources: readonly SourceStatus[];
}
