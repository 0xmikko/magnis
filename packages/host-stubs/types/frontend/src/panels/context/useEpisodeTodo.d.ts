import type { TodoItem } from "@magnis/client-core";
import type { AppRuntime } from "../../runtime/contracts/runtime";
export declare function useEpisodeTodo(runtime: AppRuntime, contextKey: string, episodeId: string | null, enabled: boolean): readonly TodoItem[];
