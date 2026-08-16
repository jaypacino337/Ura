import { useMemo, useState } from "react";
import { fmtMcap } from "../engine/market";
import { store } from "../engine/useWorld";
import type { Token } from "../engine/types";
import { gradeColor } from "../lib/ui";

export function MakeCall({
  tokens,
  initialTokenId,
  onClose,
  onDone,
}: {
  tokens: Token[];
  initialTokenId: string | null;
  onClose: () => void;
  onDone: (tokenId: string) => void;
}) {
  const live = tokens.filter((t) => t.regime !== "rugged");
  const [tokenId, setTokenId] = useState(
    initialTokenId ?? live[0]?.id ?? ""
  );
  const [thesis, setThesis] = useState("");
  const token = tokens.find((t) => t.id === tokenId);

  // Live preview of what the AI verdict will say — no surprises on submit.
  const preview = useMemo(
    () => (tokenId ? store.previewVerdict(tokenId, thesis) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tokenId, thesis, token?.mcap]
  );

  const submit = () => {
    if (!tokenId) return;
    store.userCall(tokenId, thesis.trim() || "no thesis. vibes.");
    onDone(tokenId);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">
          <span className="hl">make a call</span>
        </h2>
        <p className="muted small">
          entry is stamped at current mcap. the verdict model grades it
          instantly. the tape decides the rest.
        </p>

        <label className="field-label mono small">token</label>
        <div className="token-pick">
          {live.map((t) => (
            <button
              key={t.id}
              className={`pick mono small ${t.id === tokenId ? "active" : ""}`}
              onClick={() => setTokenId(t.id)}
            >
              {t.emoji} ${t.ticker}
            </button>
          ))}
        </div>

        {token && (
          <div className="entry-line mono small">
            entry: <b>{fmtMcap(token.mcap)}</b> · regime: {token.regime} ·
            holders: {token.holders}
          </div>
        )}

        <label className="field-label mono small">thesis (optional)</label>
        <textarea
          className="thesis-input"
          rows={3}
          maxLength={220}
          placeholder="why this coin, why now…"
          value={thesis}
          onChange={(e) => setThesis(e.target.value)}
        />

        {preview && (
          <div
            className="verdict-preview"
            style={{ borderColor: gradeColor(preview.grade) }}
          >
            <div className="mono">
              <span style={{ color: gradeColor(preview.grade) }}>
                AI verdict {preview.score}/100 · {preview.grade}
              </span>
            </div>
            <div className="small muted">▸ {preview.note}</div>
            <div className="factors small mono">
              {preview.factors.map((f) => (
                <span key={f.label} className="factor">
                  {f.label} <b>{f.value}</b>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn-ghost mono" onClick={onClose}>
            cancel
          </button>
          <button className="btn-mint mono" onClick={submit} disabled={!tokenId}>
            post the call →
          </button>
        </div>
      </div>
    </div>
  );
}
