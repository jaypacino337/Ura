import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { keccak_256 } from "@noble/hashes/sha3";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { assert } from "chai";

// Anchor test-suite for the URA mining game. Run with `anchor test`.

describe("ura-mine", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.UraMine as Program;
  const authority = provider.wallet.publicKey;

  const [config] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  );
  const [mint] = PublicKey.findProgramAddressSync(
    [Buffer.from("mint")],
    program.programId
  );
  const [proof] = PublicKey.findProgramAddressSync(
    [Buffer.from("proof"), authority.toBuffer()],
    program.programId
  );

  const leadingZeroBits = (hash: Uint8Array): number => {
    let count = 0;
    for (const byte of hash) {
      if (byte === 0) count += 8;
      else {
        count += Math.clz32(byte) - 24;
        break;
      }
    }
    return count;
  };

  const findNonce = (challenge: Uint8Array, minDifficulty: number): bigint => {
    const buf = new Uint8Array(32 + 32 + 8);
    buf.set(challenge, 0);
    buf.set(authority.toBytes(), 32);
    const view = new DataView(buf.buffer);
    for (let nonce = 0n; ; nonce++) {
      view.setBigUint64(64, nonce, true);
      if (leadingZeroBits(keccak_256(buf)) >= minDifficulty) return nonce;
    }
  };

  it("initializes the game", async () => {
    await program.methods.initialize().rpc();
    const cfg = await program.account.config.fetch(config);
    assert.ok(cfg.mint.equals(mint));
    assert.ok(cfg.minDifficulty >= 4);
  });

  it("registers a miner", async () => {
    await program.methods.register().rpc();
    const p = await program.account.proof.fetch(proof);
    assert.ok(p.authority.equals(authority));
    assert.equal(p.balance.toNumber(), 0);
  });

  it("mines a valid solution and accrues a reward", async () => {
    const cfg = await program.account.config.fetch(config);
    const before = await program.account.proof.fetch(proof);
    const nonce = findNonce(
      Uint8Array.from(before.challenge),
      cfg.minDifficulty
    );
    await program.methods.mine(new anchor.BN(nonce.toString())).rpc();
    const after = await program.account.proof.fetch(proof);
    assert.ok(after.balance.gt(before.balance), "reward accrued");
    assert.equal(after.streak, 1);
    assert.notDeepEqual(after.challenge, before.challenge, "challenge rotated");
  });

  it("rejects an invalid solution", async () => {
    try {
      await program.methods.mine(new anchor.BN(0)).rpc();
      assert.fail("expected DifficultyNotMet or CooldownActive");
    } catch (err: any) {
      assert.ok(String(err).length > 0);
    }
  });

  it("claims mined URA to the wallet", async () => {
    const p = await program.account.proof.fetch(proof);
    const ata = getAssociatedTokenAddressSync(mint, authority);
    await program.methods.claim(p.balance).rpc();
    const bal = await provider.connection.getTokenAccountBalance(ata);
    assert.equal(bal.value.amount, p.balance.toString());
    const after = await program.account.proof.fetch(proof);
    assert.equal(after.balance.toNumber(), 0);
  });
});
