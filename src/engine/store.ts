// Central game state + tick loop. One mutable world object, snapshotted into
// React via useSyncExternalStore-style subscription.

import { makeToken, tickToken } from "./market";
import { rankFeed } from "./rank";
import {
  BOT_HANDLES,
  botPickToken,
  makeBot,
  makeCall,
  randomThesis,
  tickCalls,
} from "./sim";
import { gradeCall } from "./verdict";
import type { Call, Caller, RankedCall, Token } from "./types";

export const TICK_MS = 1000;
const MAX_TOKENS = 14;
const MAX_CALLS = 120;

// Mulberry32 — deterministic per session seed, fast enough to call constantly.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface World {
  tokens: Map<string, Token>;
  calls: Call[];
  callers: Map<string, Caller>;
  user: Caller;
  feed: RankedCall[];
  startedAt: number;
  solPrice: number;
}

export interface Snapshot {
  version: number;
  world: World;
}

type Listener = () => void;

class Store {
  private world: World;
  private rng = mulberry32(Date.now() ^ 0x5eed);
  private listeners = new Set<Listener>();
  private version = 0;
  private snapshot: Snapshot;
  private timer: number | null = null;

  constructor() {
    this.world = this.boot();
    this.snapshot = { version: this.version, world: this.world };
  }

  /** Seed a believable world: tokens with pre-rolled history, bots mid-argument. */
  private boot(): World {
    const now = Date.now();
    const tokens = new Map<string, Token>();
    const callers = new Map<string, Caller>();
    const calls: Call[] = [];

    BOT_HANDLES.forEach((h, i) => {
      const bot = makeBot(h, i);
      callers.set(bot.id, bot);
    });

    const user: Caller = {
      id: "you",
      handle: "you",
      avatarHue: 150,
      isUser: true,
      earnedSol: 0,
      wins: 0,
      losses: 0,
      calls: 0,
    };
    callers.set(user.id, user);

    // Pre-roll ~20 minutes of market so charts and calls have context.
    const PREROLL_TICKS = 240;
    const prerollStart = now - PREROLL_TICKS * 5000;
    for (let i = 0; i < 9; i++) {
      const t = makeToken(prerollStart - Math.floor(this.rng() * 3_600_000), this.rng);
      tokens.set(t.id, t);
    }
    const tokenArr = () => [...tokens.values()];
    const bots = [...callers.values()].filter((c) => !c.isUser);

    for (let tick = 0; tick < PREROLL_TICKS; tick++) {
      const t = prerollStart + tick * 5000;
      for (const token of tokens.values()) tickToken(token, t, this.rng);
      // Sprinkle historical calls.
      if (this.rng() < 0.06 && calls.length < 40) {
        const bot = bots[Math.floor(this.rng() * bots.length)];
        const token = botPickToken(tokenArr(), this.rng);
        if (token) calls.push(makeCall(bot, token, randomThesis(this.rng), t));
      }
      const order = calls.map((c) => c.id);
      tickCalls(calls, tokens, callers, order, t, this.rng);
    }

    const world: World = {
      tokens,
      calls,
      callers,
      user,
      feed: [],
      startedAt: now,
      solPrice: 190 + this.rng() * 30,
    };
    world.feed = rankFeed(
      calls.filter((c) => c.outcome === "open" || now - c.createdAt < 3_600_000),
      tokens,
      now
    );
    return world;
  }

  start() {
    if (this.timer !== null) return;
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
  }

  stop() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  private tick() {
    const w = this.world;
    const now = Date.now();

    for (const token of w.tokens.values()) tickToken(token, now, this.rng);

    // New launches keep the tape fresh; dead rugs age out.
    if (w.tokens.size < MAX_TOKENS && this.rng() < 0.012) {
      const t = makeToken(now, this.rng);
      w.tokens.set(t.id, t);
    }
    for (const [id, token] of [...w.tokens.entries()]) {
      const stale =
        token.regime === "rugged" && now - token.launchedAt > 40 * 60_000;
      const hasOpenCalls = w.calls.some(
        (c) => c.tokenId === id && c.outcome === "open"
      );
      if (stale && !hasOpenCalls && w.tokens.size > 8) w.tokens.delete(id);
    }

    // Bots fire callouts.
    if (this.rng() < 0.16) {
      const bots = [...w.callers.values()].filter((c) => !c.isUser);
      const bot = bots[Math.floor(this.rng() * bots.length)];
      const token = botPickToken([...w.tokens.values()], this.rng);
      if (token) {
        w.calls.unshift(makeCall(bot, token, randomThesis(this.rng), now));
      }
    }
    if (w.calls.length > MAX_CALLS) {
      // Drop oldest resolved calls first.
      const resolved = w.calls.filter((c) => c.outcome !== "open");
      resolved
        .sort((a, b) => a.createdAt - b.createdAt)
        .slice(0, w.calls.length - MAX_CALLS)
        .forEach((c) => {
          const i = w.calls.indexOf(c);
          if (i >= 0) w.calls.splice(i, 1);
        });
    }

    const visible = w.calls.filter(
      (c) => c.outcome === "open" || now - c.createdAt < 3_600_000
    );
    w.feed = rankFeed(visible, w.tokens, now);
    tickCalls(
      w.calls,
      w.tokens,
      w.callers,
      w.feed.map((r) => r.call.id),
      now,
      this.rng
    );

    this.emit();
  }

  /** The user makes a call. Returns it (already graded by the verdict model). */
  userCall(tokenId: string, thesis: string): Call {
    const w = this.world;
    const token = w.tokens.get(tokenId);
    if (!token) throw new Error("Token vanished from the tape");
    const call = makeCall(w.user, token, thesis, Date.now());
    w.calls.unshift(call);
    w.feed = rankFeed(
      w.calls.filter((c) => c.outcome === "open"),
      w.tokens,
      Date.now()
    );
    this.emit();
    return call;
  }

  /** Preview a verdict before committing the call. */
  previewVerdict(tokenId: string, thesis: string) {
    const token = this.world.tokens.get(tokenId);
    if (!token) return null;
    return gradeCall(token, this.world.user, thesis, Date.now());
  }

  react(callId: string, kind: "agree" | "echo" | "fade") {
    const call = this.world.calls.find((c) => c.id === callId);
    if (!call) return;
    if (kind === "agree") call.agrees++;
    else if (kind === "echo") call.echoes++;
    else call.fades++;
    call.impressions++;
    this.emit();
  }

  private emit() {
    this.version++;
    this.snapshot = { version: this.version, world: this.world };
    for (const l of this.listeners) l();
  }

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  getSnapshot = (): Snapshot => this.snapshot;
}

export const store = new Store();
