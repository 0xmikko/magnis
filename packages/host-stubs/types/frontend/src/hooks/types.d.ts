export interface PaginatedResponse<T> {
    readonly items: readonly T[];
    readonly total: number;
    readonly limit: number;
    readonly offset: number;
}
export interface PaginationParams {
    readonly limit?: number;
    readonly offset?: number;
}
