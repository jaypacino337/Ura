import { keccak_256 } from "@noble/hashes/sha3";

/** Difficulty metric — leading zero bits, identical to the on-chain program. */
export function leadingZeroBits(hash: Uint8Array): number {
  let count = 0;
  for (const byte of hash) {
    if (byte === 0) count += 8;
    else {
      count += Math.clz32(byte) - 24;
      break;
    }
  }
  return Math.min(count, 255);
}

/** keccak256(challenge ‖ authority ‖ nonce_le) — the mining hash. */
export function mineHash(
  challenge: Uint8Array,
  authority: Uint8Array,
  nonce: bigint
): Uint8Array {
  const buf = new Uint8Array(72);
  buf.set(challenge, 0);
  buf.set(authority, 32);
  new DataView(buf.buffer).setBigUint64(64, nonce, true);
  return keccak_256(buf);
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
