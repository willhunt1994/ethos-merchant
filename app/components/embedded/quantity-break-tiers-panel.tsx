import { Form, useNavigation } from "react-router";
import { useCallback, useEffect, useState } from "react";
import styles from "../../styles/embedded-app.module.css";
import {
  DEFAULT_QUANTITY_BREAK_TIERS,
  MAX_QUANTITY_TIER_COUNT,
  MIN_QUANTITY_TIER_COUNT,
  parseAndValidateQuantityBreakTiers,
  type QuantityTierDefinition,
} from "../../lib/quantity-tier-definitions";

type EditableTier = { minQty: string; maxQty: string };

function tiersToEditable(tiers: QuantityTierDefinition[]): EditableTier[] {
  return tiers.map((t) => ({ minQty: String(t.minQty), maxQty: String(t.maxQty) }));
}

function editableToPayload(rows: EditableTier[]): { minQty: number; maxQty: number }[] {
  return rows.map((r) => ({
    minQty: Number.parseInt(r.minQty, 10),
    maxQty: Number.parseInt(r.maxQty, 10),
  }));
}

function TierDragHandle({ index, onDragStart, onDragEnd }: {
  index: number;
  onDragStart: (index: number) => void;
  onDragEnd: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.quantityBreakTierDragHandle}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(index));
        onDragStart(index);
      }}
      onDragEnd={onDragEnd}
      aria-label={`Drag to reorder tier ${index + 1}`}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
        <circle cx="5" cy="4" r="1.25" fill="currentColor" />
        <circle cx="11" cy="4" r="1.25" fill="currentColor" />
        <circle cx="5" cy="8" r="1.25" fill="currentColor" />
        <circle cx="11" cy="8" r="1.25" fill="currentColor" />
        <circle cx="5" cy="12" r="1.25" fill="currentColor" />
        <circle cx="11" cy="12" r="1.25" fill="currentColor" />
      </svg>
    </button>
  );
}

export function QuantityBreakTiersPanel({
  initialTiers,
  saveOk,
  saveError,
}: {
  initialTiers: QuantityTierDefinition[];
  saveOk?: boolean;
  saveError?: string | null;
}) {
  const navigation = useNavigation();
  const saving =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "save-quantity-break-tiers";

  const [rows, setRows] = useState<EditableTier[]>(() => tiersToEditable(initialTiers));
  const [clientError, setClientError] = useState<string | null>(null);
  const [showRemapNotice, setShowRemapNotice] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  useEffect(() => {
    setRows(tiersToEditable(initialTiers));
  }, [initialTiers]);

  useEffect(() => {
    if (saveOk) {
      setShowRemapNotice(true);
      setClientError(null);
    }
  }, [saveOk]);

  const validate = useCallback((draft: EditableTier[]) => {
    const result = parseAndValidateQuantityBreakTiers(editableToPayload(draft));
    if (!result.ok) {
      setClientError(result.error);
      return null;
    }
    setClientError(null);
    return result.tiers;
  }, []);

  const updateRow = (index: number, field: "minQty" | "maxQty", value: string) => {
    setRows((prev) => {
      const next = prev.map((row, i) => (i === index ? { ...row, [field]: value } : row));
      validate(next);
      return next;
    });
  };

  const removeRow = (index: number) => {
    setRows((prev) => {
      if (prev.length <= MIN_QUANTITY_TIER_COUNT) return prev;
      const next = prev.filter((_, i) => i !== index);
      validate(next);
      return next;
    });
  };

  const addRow = () => {
    setRows((prev) => {
      if (prev.length >= MAX_QUANTITY_TIER_COUNT) return prev;
      const last = prev[prev.length - 1];
      const lastMax = last ? Number.parseInt(last.maxQty, 10) : 0;
      const nextMin = Number.isFinite(lastMax) ? lastMax + 1 : 1;
      const next = [...prev, { minQty: String(nextMin), maxQty: String(nextMin + 9) }];
      validate(next);
      return next;
    });
  };

  const reorderRows = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setRows((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      if (!moved) return prev;
      next.splice(toIndex, 0, moved);
      validate(next);
      return next;
    });
  };

  const resetToDefault = () => {
    const next = tiersToEditable(DEFAULT_QUANTITY_BREAK_TIERS);
    setRows(next);
    validate(next);
  };

  const payloadJson = JSON.stringify(editableToPayload(rows));
  const displayError = clientError ?? saveError ?? null;

  return (
    <section className={styles.settingsPanel} aria-labelledby="settings-quantity-tiers-heading">
      <h2 id="settings-quantity-tiers-heading" className={styles.settingsPanelTitle}>
        Quantity Break Tiers
      </h2>
      <p className={styles.settingsHelpText}>
        Shop-wide quantity ranges for volume pricing on the configure page. Tiers must be contiguous
        with no gaps between ranges.
      </p>
      {showRemapNotice ? (
        <p className={styles.settingsHelpText} role="status">
          Tiers saved. Saved product prices are matched by quantity range — review configure pages
          after changing breaks.
        </p>
      ) : null}
      {displayError ? (
        <p className={styles.formError} role="alert">
          {displayError}
        </p>
      ) : null}
      <div className={styles.quantityBreakTiersTableWrap}>
        <table className={styles.quantityBreakTiersTable}>
          <thead>
            <tr>
              <th scope="col">Min Qty</th>
              <th scope="col">Max Qty</th>
              <th scope="col" className={styles.quantityBreakTiersOrderCol}>
                Order
              </th>
              <th scope="col" className={styles.quantityBreakTiersRemoveCol}>
                Remove
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={`tier-row-${index}`}
                className={
                  dropIndex === index ? styles.quantityBreakTierRowDropTarget : undefined
                }
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragIndex != null && dragIndex !== index) {
                    setDropIndex(index);
                  }
                }}
                onDragLeave={() => {
                  setDropIndex((prev) => (prev === index ? null : prev));
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = Number.parseInt(e.dataTransfer.getData("text/plain"), 10);
                  if (Number.isFinite(from)) {
                    reorderRows(from, index);
                  }
                  setDragIndex(null);
                  setDropIndex(null);
                }}
              >
                <td>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    inputMode="numeric"
                    className={styles.quantityBreakTierInput}
                    value={row.minQty}
                    onChange={(e) => updateRow(index, "minQty", e.target.value)}
                    aria-label={`Tier ${index + 1} minimum quantity`}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    inputMode="numeric"
                    className={styles.quantityBreakTierInput}
                    value={row.maxQty}
                    onChange={(e) => updateRow(index, "maxQty", e.target.value)}
                    aria-label={`Tier ${index + 1} maximum quantity`}
                  />
                </td>
                <td className={styles.quantityBreakTiersOrderCol}>
                  <TierDragHandle
                    index={index}
                    onDragStart={setDragIndex}
                    onDragEnd={() => {
                      setDragIndex(null);
                      setDropIndex(null);
                    }}
                  />
                </td>
                <td className={styles.quantityBreakTiersRemoveCol}>
                  <button
                    type="button"
                    className={styles.quantityBreakTierIconButton}
                    disabled={rows.length <= MIN_QUANTITY_TIER_COUNT}
                    onClick={() => removeRow(index)}
                    aria-label={`Remove tier ${index + 1}`}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={styles.quantityBreakTiersToolbar}>
        <button
          type="button"
          className={styles.settingsButton}
          disabled={rows.length >= MAX_QUANTITY_TIER_COUNT}
          onClick={addRow}
        >
          Add Tier
        </button>
        <button type="button" className={styles.settingsButton} onClick={resetToDefault}>
          Reset to Ethos Standard
        </button>
      </div>
      <Form method="post" className={styles.quantityBreakTiersSaveForm}>
        <input type="hidden" name="intent" value="save-quantity-break-tiers" />
        <input type="hidden" name="quantityBreakTiers" value={payloadJson} />
        <button
          type="submit"
          className={styles.primarySubmitButton}
          disabled={saving || Boolean(clientError)}
        >
          {saving ? "Saving…" : "Save Quantity Tiers"}
        </button>
      </Form>
    </section>
  );
}
