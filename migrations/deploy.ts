// Anchor deploy hook: initializes the game (config + URA mint + treasury)
// right after `anchor deploy`. Safe to re-run — initialization is a no-op
// failure if the config PDA already exists.

import * as anchor from "@coral-xyz/anchor";

module.exports = async function (provider: anchor.AnchorProvider) {
  anchor.setProvider(provider);
  const program = anchor.workspace.UraMine;
  try {
    const sig = await program.methods.initialize().rpc();
    console.log("Game initialized:", sig);
  } catch (err) {
    console.log("Initialize skipped (already initialized?):", String(err));
  }
};
