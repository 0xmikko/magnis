/**
 * TriggerToolCallRenderer — approval card for email.set_trigger.
 *
 * Shows watched addresses, gate prompt, and action prompt in a clear layout.
 */

import type { JSX } from "react";
import { Icon } from "@magnis/host/ui";
import type { AgentRendererProps, ToolCallRendererPayload } from "@magnis/host/runtime";
import { BaseToolCallCard } from "@magnis/host/base";

export function TriggerToolCallRenderer({
  payload,
}: AgentRendererProps<ToolCallRendererPayload>): JSX.Element {
  const { toolCall: tc, toolResult, isAllowlisted, superseded, onApprove, onDeny, onAllowlistToggle } = payload;
  const args = tc.args as Record<string, unknown>;

  // Collect addresses from both params
  const addresses: string[] = [];
  const fromAddresses = args.from_addresses as string[] | undefined;
  const fromAddress = args.from_address as string | undefined;
  if (fromAddresses) addresses.push(...fromAddresses);
  if (fromAddress && !addresses.includes(fromAddress)) addresses.push(fromAddress);

  const gate = (args.gate_prompt as string | undefined) ?? "";
  const action = (args.action_prompt as string | undefined) ?? "";
  const debounce = args.debounce_seconds as number | undefined;

  return (
    <BaseToolCallCard
      icon="zap"
      title={`Email trigger (${String(addresses.length)} address${addresses.length !== 1 ? "es" : ""})`}
      variant="amber"
      status={tc.status}
      toolResult={toolResult}
      superseded={superseded}
      isAllowlisted={isAllowlisted}
      primaryLabel="Create trigger"
      primaryIcon="zap"
      doneLabel="Trigger created"
      onApprove={onApprove}
      onDeny={onDeny}
      onAllowlistToggle={onAllowlistToggle}
    >
      {/* Watched addresses */}
      <div className="mb-2">
        <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-amber-400/70">Watching</div>
        <div className="flex flex-wrap gap-1.5">
          {addresses.map((addr, i) => (
            <span key={i} className="flex items-center gap-1 rounded bg-surface-secondary px-2 py-0.5 text-[11px] text-agent-text">
              <Icon name="mail" size={10} className="text-amber-400/60" />
              {addr}
            </span>
          ))}
        </div>
      </div>

      {/* Gate prompt */}
      <div className="mb-2">
        <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-400/70">Condition</div>
        <p className="rounded border border-transparent px-2 py-1 text-[12px] leading-[1.4] text-agent-text-muted">{gate}</p>
      </div>

      {/* Action prompt */}
      <div className="mb-1">
        <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-400/70">Action</div>
        <p className="rounded border border-transparent px-2 py-1 text-[12px] leading-[1.4] text-agent-text">{action}</p>
      </div>

      {/* Debounce info */}
      {debounce != null && debounce > 0 && (
        <div className="text-[10px] text-agent-text-muted">
          Debounce: {String(debounce)}s
        </div>
      )}
    </BaseToolCallCard>
  );
}
