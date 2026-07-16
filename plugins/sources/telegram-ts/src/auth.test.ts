// phone_code auth state-machine tests — the TS mirror of the Rust
// plugins/sources/telegram/src/auth.rs flow (begin → step → minted), driven
// through an injected client factory so NO network is touched.

import { beforeEach, describe, expect, test } from "bun:test";
import { begin, resetAuthFlow, revoke, step } from "./auth";
import type { AuthClientFactory, AuthClientLike, TgUserLike } from "./live";

interface FakeClientOpts {
  sendCodeHash?: string;
  /** Queue of sign-in outcomes; each call shifts one. */
  signIn?: (() => TgUserLike)[];
  password?: () => TgUserLike;
  logOut?: () => void;
  session?: string;
}

const ALICE: TgUserLike = { id: 4242, firstName: "Alice", lastName: "Smith", username: "alice" };

/** gramjs raises RPCErrors carrying `.errorMessage`. */
function rpcErr(name: string): Error & { errorMessage: string; code: number } {
  const e = new Error(name) as Error & { errorMessage: string; code: number };
  e.errorMessage = name;
  e.code = 401;
  return e;
}

class FakeClient implements AuthClientLike {
  sendCodeCalls: { phone: string }[] = [];
  signInCalls: { phoneCode: string; phoneCodeHash: string }[] = [];
  logOutCalls = 0;

  constructor(private readonly opts: FakeClientOpts) {}

  get session() {
    return { save: () => this.opts.session ?? "SESSION_BLOB" };
  }

  async sendCode(_creds: { apiId: number; apiHash: string }, phone: string) {
    this.sendCodeCalls.push({ phone });
    return { phoneCodeHash: this.opts.sendCodeHash ?? "HASH1" };
  }

  async signIn(params: { phoneNumber: string; phoneCodeHash: string; phoneCode: string }) {
    this.signInCalls.push({ phoneCode: params.phoneCode, phoneCodeHash: params.phoneCodeHash });
    const next = this.opts.signIn?.shift();
    if (next === undefined) throw new Error("no signIn outcome queued");
    return next();
  }

  async signInWithPassword(_password: string) {
    if (this.opts.password === undefined) throw new Error("no password outcome queued");
    return this.opts.password();
  }

  async logOut() {
    this.logOutCalls += 1;
    this.opts.logOut?.();
  }
}

function factoryFor(client: FakeClient): AuthClientFactory {
  return {
    async connectFresh() {
      return client;
    },
    async connectWithSession() {
      return client;
    },
  };
}

const META = { _meta: { api_id: 12345, api_hash: "hash", phone: "+15551234567" } };

beforeEach(() => {
  resetAuthFlow();
});

describe("begin", () => {
  test("tst_tgts_auth_001 begin requests the code and parks the flow", async () => {
    const client = new FakeClient({ sendCodeHash: "HASH1" });
    const out = await begin(META, factoryFor(client));
    expect(out).toEqual({ state: "code_sent" });
    expect(client.sendCodeCalls).toEqual([{ phone: "+15551234567" }]);
  });

  test("tst_tgts_auth_002 begin validates its _meta inputs", async () => {
    const f = factoryFor(new FakeClient({}));
    await expect(begin({ _meta: { api_hash: "h", phone: "+1" } }, f)).rejects.toThrow(
      "magnis.auth: missing or invalid _meta.api_id",
    );
    await expect(begin({ _meta: { api_id: "nope", api_hash: "h", phone: "+1" } }, f)).rejects.toThrow(
      "magnis.auth: missing or invalid _meta.api_id",
    );
    await expect(begin({ _meta: { api_id: 1, phone: "+1" } }, f)).rejects.toThrow(
      "magnis.auth: missing _meta.api_hash",
    );
    await expect(begin({ _meta: { api_id: 1, api_hash: "h" } }, f)).rejects.toThrow(
      "magnis.auth: missing _meta.phone",
    );
  });

  test("tst_tgts_auth_003 api_id accepts a numeric string (env is a string)", async () => {
    const client = new FakeClient({});
    await expect(
      begin({ _meta: { ...META._meta, api_id: "12345" } }, factoryFor(client)),
    ).resolves.toEqual({ state: "code_sent" });
  });
});

describe("step: code", () => {
  test("tst_tgts_auth_004 a valid code mints the credential + identity", async () => {
    const client = new FakeClient({ signIn: [() => ALICE], session: "S1" });
    await begin(META, factoryFor(client));
    const out = await step({ _meta: { code: "11111" } });

    expect(out).toEqual({
      credential: "S1",
      identity: { key: "4242", label: "@alice" },
    });
    // The parked phone + phoneCodeHash were threaded into the sign-in.
    expect(client.signInCalls).toEqual([{ phoneCode: "11111", phoneCodeHash: "HASH1" }]);
  });

  test("tst_tgts_auth_005 identity label: @username, else the full name", async () => {
    const noUsername = { id: 7, firstName: "Bob", lastName: "Jones" };
    const client = new FakeClient({ signIn: [() => noUsername] });
    await begin(META, factoryFor(client));
    expect((await step({ _meta: { code: "1" } })).identity).toEqual({
      key: "7",
      label: "Bob Jones",
    });

    // A first name only → no trailing space.
    resetAuthFlow();
    const c2 = new FakeClient({ signIn: [() => ({ id: 8, firstName: "Solo" })] });
    await begin(META, factoryFor(c2));
    expect((await step({ _meta: { code: "1" } })).identity).toEqual({
      key: "8",
      label: "Solo",
    });
  });

  // THE recoverable case: the user mistypes the code and must be able to retry.
  test("tst_tgts_auth_006 an invalid code RE-PARKS the flow so a retry succeeds", async () => {
    const client = new FakeClient({
      signIn: [
        () => {
          throw rpcErr("PHONE_CODE_INVALID");
        },
        () => ALICE,
      ],
    });
    await begin(META, factoryFor(client));

    await expect(step({ _meta: { code: "00000" } })).rejects.toThrow("invalid login code");
    // The flow SURVIVES: a second step with the right code mints, with NO re-begin.
    const out = await step({ _meta: { code: "11111" } });
    expect(out.credential).toBe("SESSION_BLOB");
    // Both attempts reused the SAME parked phoneCodeHash.
    expect(client.signInCalls.map((c) => c.phoneCodeHash)).toEqual(["HASH1", "HASH1"]);
  });

  test("tst_tgts_auth_007 SESSION_PASSWORD_NEEDED → password state → minted", async () => {
    const client = new FakeClient({
      signIn: [
        () => {
          throw rpcErr("SESSION_PASSWORD_NEEDED");
        },
      ],
      password: () => ALICE,
    });
    await begin(META, factoryFor(client));

    expect(await step({ _meta: { code: "11111" } })).toEqual({ state: "password" });
    // Now parked on the password step: the code arm must NOT run again.
    expect(await step({ _meta: { password: "hunter2" } })).toEqual({
      credential: "SESSION_BLOB",
      identity: { key: "4242", label: "@alice" },
    });
  });

  test("tst_tgts_auth_008 any OTHER sign-in error drops the flow", async () => {
    const client = new FakeClient({
      signIn: [
        () => {
          throw rpcErr("PHONE_NUMBER_BANNED");
        },
      ],
    });
    await begin(META, factoryFor(client));

    await expect(step({ _meta: { code: "1" } })).rejects.toThrow("sign_in failed:");
    // The flow was DROPPED (not re-parked) — a retry now reports no login.
    await expect(step({ _meta: { code: "1" } })).rejects.toThrow(
      "no telegram login in progress (call begin first)",
    );
  });

  test("tst_tgts_auth_009 a failed password check drops the flow", async () => {
    const client = new FakeClient({
      signIn: [
        () => {
          throw rpcErr("SESSION_PASSWORD_NEEDED");
        },
      ],
      password: () => {
        throw rpcErr("PASSWORD_HASH_INVALID");
      },
    });
    await begin(META, factoryFor(client));
    await step({ _meta: { code: "1" } });

    await expect(step({ _meta: { password: "wrong" } })).rejects.toThrow("check_password failed:");
    await expect(step({ _meta: { password: "x" } })).rejects.toThrow(
      "no telegram login in progress (call begin first)",
    );
  });
});

describe("step: empty slot + missing inputs", () => {
  test("tst_tgts_auth_010 step without a begin errors", async () => {
    await expect(step({ _meta: { code: "1" } })).rejects.toThrow(
      "no telegram login in progress (call begin first)",
    );
  });

  test("tst_tgts_auth_011 step on AwaitingCode requires _meta.code", async () => {
    const client = new FakeClient({ signIn: [() => ALICE] });
    await begin(META, factoryFor(client));
    await expect(step({ _meta: {} })).rejects.toThrow("magnis.auth: missing _meta.code");
  });
});

describe("revoke", () => {
  test("tst_tgts_auth_012 a successful logout reports revoked:true", async () => {
    const client = new FakeClient({});
    const out = await revoke(
      { _meta: { api_id: 1, api_hash: "h", session: "BLOB" } },
      factoryFor(client),
    );
    expect(out).toEqual({ revoked: true });
    expect(client.logOutCalls).toBe(1);
  });

  test("tst_tgts_auth_013 a FAILED logout reports revoked:false — it never throws", async () => {
    const client = new FakeClient({
      logOut: () => {
        throw rpcErr("AUTH_KEY_UNREGISTERED");
      },
    });
    const out = await revoke(
      { _meta: { api_id: 1, api_hash: "h", session: "BLOB" } },
      factoryFor(client),
    );
    expect(out).toEqual({ revoked: false });
  });

  test("tst_tgts_auth_014 revoke validates its _meta inputs", async () => {
    const f = factoryFor(new FakeClient({}));
    await expect(revoke({ _meta: { api_id: 1, api_hash: "h" } }, f)).rejects.toThrow(
      "magnis.auth: missing _meta.session",
    );
  });
});
