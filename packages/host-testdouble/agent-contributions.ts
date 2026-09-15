/** `@/runtime/agent/contributions` — the registry a module registers into.
 *
 * Three suites (`TelegramRendererResolution`, `TriggersModuleResolution`,
 * `ContactMergeResolution`) exist because component tests over hand-built
 * props do NOT prove that a real tool-call block RESOLVES to the module's
 * renderer. Resolution is the subject, so the resolution rules are
 * reimplemented here rather than stubbed: priority order across modules,
 * the schema-id normalisation pass, and first-match-wins for allowlist
 * targets. A stub that returned the only registered renderer would make
 * every one of those tests pass no matter what the module registered.
 */

interface HistoryBlockLike {
  readonly toolName?: string | null;
}

interface HistoryRendererLike {
  readonly match: (block: HistoryBlockLike) => boolean;
  readonly priority?: number;
}

interface EntityRendererLike {
  readonly moduleId: string;
  readonly schemaMatch: string | ((schemaId: string) => boolean);
}

interface TodoRendererLike {
  readonly kind: string;
}

interface ContributionLike {
  readonly systemPrompt?: string;
  readonly historyRenderers?: readonly HistoryRendererLike[];
  readonly todoRenderers?: readonly TodoRendererLike[];
  readonly entityRenderers?: readonly EntityRendererLike[];
  readonly contextActions?: readonly unknown[];
  readonly entityContextResolvers?: readonly unknown[];
  readonly navigateToEntity?: (
    entityId: string,
    schemaId: string,
    data: Readonly<Record<string, unknown>>,
    runtime: unknown,
    navigate: (moduleId: string, entityType?: string, entityId?: string) => void,
  ) => void;
  readonly extractAllowlistTarget?: (toolCall: { name: string; args: unknown }) => unknown;
  readonly onDraftRequest?: (payload: unknown, runtime: unknown) => void;
}

const LEGACY_SCHEMA_MAP: Readonly<Record<string, string>> = {
  person: "contacts.person",
  email_message: "email.message",
  email_address: "email.address",
  telegram_message: "telegram.message",
  telegram_chat: "telegram.chat",
  calendar_event: "meetings.calendar_event",
  file_object: "file.object",
};

function normalizeSchemaId(schemaId: string): string {
  return LEGACY_SCHEMA_MAP[schemaId] ?? schemaId;
}

export class AgentContributionRegistry {
  private readonly contributions = new Map<string, ContributionLike>();

  register(moduleId: string, contribution: ContributionLike): () => void {
    this.contributions.set(moduleId, contribution);
    return () => {
      this.contributions.delete(moduleId);
    };
  }

  resolveHistoryRenderer(block: HistoryBlockLike): HistoryRendererLike | null {
    let bestMatch: HistoryRendererLike | null = null;
    let bestPriority = -Infinity;
    for (const [, contribution] of this.contributions) {
      for (const renderer of contribution.historyRenderers ?? []) {
        if (renderer.match(block)) {
          const priority = renderer.priority ?? 0;
          if (priority > bestPriority) {
            bestMatch = renderer;
            bestPriority = priority;
          }
        }
      }
    }
    return bestMatch;
  }

  resolveTodoRenderer(item: { kind: string }): TodoRendererLike | null {
    for (const [, contribution] of this.contributions) {
      const match = contribution.todoRenderers?.find((r) => r.kind === item.kind);
      if (match) return match;
    }
    return null;
  }

  resolveSystemPrompt(moduleId: string): string | undefined {
    return this.contributions.get(moduleId)?.systemPrompt;
  }

  getContextActions(moduleId: string): readonly unknown[] {
    return this.contributions.get(moduleId)?.contextActions ?? [];
  }

  getEntityContextResolvers(): readonly unknown[] {
    const resolvers: unknown[] = [];
    for (const [, contribution] of this.contributions) {
      if (contribution.entityContextResolvers) resolvers.push(...contribution.entityContextResolvers);
    }
    return resolvers;
  }

  resolveEntityRenderer(schemaId: string): EntityRendererLike | null {
    // The database stores underscore ids; renderers register dotted ones.
    const variants = [schemaId, normalizeSchemaId(schemaId)];
    for (const sid of variants) {
      for (const [, contribution] of this.contributions) {
        for (const reg of contribution.entityRenderers ?? []) {
          const matches =
            typeof reg.schemaMatch === "function" ? reg.schemaMatch(sid) : sid === reg.schemaMatch;
          if (matches) return reg;
        }
      }
    }
    return null;
  }

  navigateToEntity(
    schemaId: string,
    entityId: string,
    data: Readonly<Record<string, unknown>>,
    runtime: unknown,
    navigate: (moduleId: string, entityType?: string, entityId?: string) => void,
  ): boolean {
    const reg = this.resolveEntityRenderer(schemaId);
    if (!reg) return false;
    const contribution = this.contributions.get(reg.moduleId);
    if (contribution?.navigateToEntity) {
      contribution.navigateToEntity(entityId, schemaId, data, runtime, navigate);
    } else {
      const dotIdx = schemaId.indexOf(".");
      navigate(reg.moduleId, dotIdx >= 0 ? schemaId.slice(dotIdx + 1) : undefined, entityId);
    }
    return true;
  }

  resolveAllowlistTarget(toolCall: { name: string; args: unknown }): unknown {
    for (const [, contribution] of this.contributions) {
      const result = contribution.extractAllowlistTarget?.(toolCall);
      if (result) return result;
    }
    return null;
  }

  handleDraftRequest(targetModuleId: string, payload: unknown, runtime: unknown): boolean {
    const contribution = this.contributions.get(targetModuleId);
    if (contribution?.onDraftRequest) {
      contribution.onDraftRequest(payload, runtime);
      return true;
    }
    return false;
  }

  hasContribution(moduleId: string): boolean {
    return this.contributions.has(moduleId);
  }

  listModuleIds(): string[] {
    return Array.from(this.contributions.keys());
  }
}
