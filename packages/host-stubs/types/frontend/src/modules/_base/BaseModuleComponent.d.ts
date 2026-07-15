import type { JSX } from "react";
import type { ModuleConfig, ModuleQueryKeys } from "./types";
export interface BaseModuleComponentProps {
    readonly config: ModuleConfig;
    readonly queryKeys: ModuleQueryKeys;
}
export declare function BaseModuleComponent({ config, queryKeys, }: BaseModuleComponentProps): JSX.Element;
