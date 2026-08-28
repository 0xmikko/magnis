interface JsonRpcReply {
  jsonrpc?: string;
  id?: string | number | null;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function decodeReply(value: unknown, label: string): JsonRpcReply {
  if (!isRecord(value) || value.jsonrpc !== "2.0") {
    throw new Error(`${label} is not a JSON-RPC 2.0 object`);
  }
  if (typeof value.id !== "number" && typeof value.id !== "string" && value.id !== null) {
    throw new Error(`${label} has an invalid id`);
  }
  const hasResult = Object.hasOwn(value, "result");
  const hasError = Object.hasOwn(value, "error");
  if (hasResult === hasError) throw new Error(`${label} must contain exactly one of result or error`);
  if (hasError) {
    if (!isRecord(value.error) || typeof value.error.code !== "number" || typeof value.error.message !== "string") {
      throw new Error(`${label}.error is malformed`);
    }
  }
  return {
    jsonrpc: "2.0",
    id: value.id,
    ...(hasResult ? { result: value.result } : { error: value.error as JsonRpcReply["error"] }),
  };
}

export interface SourceHostEvidence {
  initialize: JsonRpcReply;
  toolsList: JsonRpcReply;
  operationProbes: Readonly<Record<string, JsonRpcReply>>;
}

function probeArguments(operation: string): Record<string, unknown> {
  if (operation === "listen_start") {
    return { subscription_id: "certification-probe", _meta: { account_id: "certification" } };
  }
  if (operation === "listen_stop") return { subscription_id: "certification-probe" };
  if (operation === "magnis.sync.listen") return { _meta: { account_id: "certification" } };
  const separator = operation.indexOf(":");
  if (separator >= 0) return { action: operation.slice(separator + 1), _certification_probe: true };
  return { _certification_probe: true };
}

function requestForOperation(id: number, operation: string): Record<string, unknown> {
  if (operation === "initialize") return { jsonrpc: "2.0", id, method: "initialize" };
  if (operation === "tools/list") return { jsonrpc: "2.0", id, method: "tools/list" };
  const separator = operation.indexOf(":");
  const tool = separator >= 0 ? operation.slice(0, separator) : operation;
  return {
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: { name: tool, arguments: probeArguments(operation) },
  };
}

async function withDeadline<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<T>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${String(timeoutMs)}ms`));
    }, timeoutMs);
  });
  return Promise.race([promise, deadline]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

/** Execute one dependency-closed Source artifact over its real stdio boundary.
 * Every declared operation is probed; any absent dispatcher is a certification
 * failure even when initialize and tools/list succeed. */
async function collectSourceHostProcessEvidence(
  artifactRoot: string,
  callableOperations: readonly string[],
  extraArgs: readonly string[],
  timeoutMs: number,
): Promise<SourceHostEvidence> {
  const operations = [...new Set(callableOperations)].sort();
  if (!operations.includes("initialize") || !operations.includes("tools/list")) {
    throw new Error("callable operations must include initialize and tools/list");
  }
  const requests = operations.map((operation, index) =>
    requestForOperation(index + 1, operation),
  );
  const child = Bun.spawn([process.execPath, "run", "dist/main.js", ...extraArgs], {
    cwd: artifactRoot,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: {
      LANG: "C.UTF-8",
      NO_COLOR: "1",
    },
  });
  const stdoutPromise = new Response(child.stdout).text();
  const stderrPromise = new Response(child.stderr).text();
  try {
    await child.stdin.write(`${requests.map((request) => JSON.stringify(request)).join("\n")}\n`);
    await child.stdin.end();
    const [exitCode, stdout, stderr] = await withDeadline(
      Promise.all([child.exited, stdoutPromise, stderrPromise]),
      timeoutMs,
      `Source host ${artifactRoot}`,
    );
    if (exitCode !== 0) {
      throw new Error(`Source host exited ${String(exitCode)}: ${stderr.trim()}`);
    }
    const replies = stdout
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line, index): JsonRpcReply => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(line) as unknown;
        } catch (error: unknown) {
          throw new Error(`Source host output line ${String(index + 1)} is not JSON`, { cause: error });
        }
        return decodeReply(parsed, `Source host output line ${String(index + 1)}`);
      });
    if (new Set(replies.map(({ id }) => id)).size !== replies.length) {
      throw new Error("Source host returned duplicate JSON-RPC ids");
    }
    const byId = new Map(replies.map((reply) => [reply.id, reply]));
    const evidence = new Map<string, JsonRpcReply>();
    for (let index = 0; index < operations.length; index += 1) {
      const operation = operations[index];
      if (operation === undefined) continue;
      const reply = byId.get(index + 1);
      if (reply === undefined) throw new Error(`Source host omitted reply for '${operation}'`);
      if (
        reply.error?.code === -32601 &&
        /unknown tool|not available|not implemented/i.test(reply.error.message ?? "")
      ) {
        throw new Error(`Source host does not implement declared operation '${operation}'`);
      }
      evidence.set(operation, reply);
    }
    const initialize = evidence.get("initialize");
    const toolsList = evidence.get("tools/list");
    if (initialize === undefined || toolsList === undefined) {
      throw new Error("Source host did not return initialize and tools/list evidence");
    }
    return {
      initialize,
      toolsList,
      operationProbes: Object.fromEntries(
        [...evidence].filter(([operation]) => operation !== "initialize" && operation !== "tools/list"),
      ),
    };
  } finally {
    if (child.exitCode === null) child.kill();
    await child.exited;
  }
}

export async function collectSourceHostEvidence(
  artifactRoot: string,
  callableOperations: readonly string[],
  timeoutMs = 5_000,
): Promise<SourceHostEvidence> {
  const operations = [...new Set(callableOperations)].sort();
  const authOperations = operations.filter((operation) => operation.startsWith("magnis.auth."));
  const syncOperations = operations.filter((operation) => !operation.startsWith("magnis.auth."));
  const syncEvidence = await collectSourceHostProcessEvidence(
    artifactRoot,
    syncOperations,
    [],
    timeoutMs,
  );
  if (authOperations.length === 0) return syncEvidence;
  const authEvidence = await collectSourceHostProcessEvidence(
    artifactRoot,
    ["initialize", ...authOperations, "tools/list"],
    ["--auth-mode"],
    timeoutMs,
  );
  return {
    ...syncEvidence,
    operationProbes: {
      ...syncEvidence.operationProbes,
      ...authEvidence.operationProbes,
    },
  };
}
