"use client";

import { useMuqsit } from "@/context/MuqsitContext";
import { suggestionDB } from "@/data/suggestions";
import ExpandableField from "@/components/common/ExpandableField";
import Lock from "@/components/common/Lock";
import InvestigationFindingsField from "@/components/investigation/InvestigationFindingsField";
import DrugHistoryField from "@/components/prescription/DrugHistoryField";
import PreviousComplaintsField from "@/components/prescription/PreviousComplaintsField";
import { PersonalNoteSection } from "@/components/prescription/PersonalNote";
import { useActivityLog } from "@/hooks/useActivity";
import { usePreviousDiagnoses } from "@/hooks/usePreviousDiagnoses";
import { isInlineEditField } from "@/lib/inlineEditFields";
import { BANGLA_FIELDS } from "@/lib/banglaInput";

export default function LeftColumn() {
  const { leftFields, allFieldValues, setShowInvPopup, setShowOePopup, invImages, canEditLabel, hiddenInvestigation, setHiddenInvestigation, hideDrugHistory, setHideDrugHistory } = useMuqsit();
  const logActivity = useActivityLog();
  // "P.D" — offered inside the Final diagnosis popup only.
  const previousDiagnoses = usePreviousDiagnoses();

  return (
    <div>
      {leftFields.map((f) => {
        if (f.label === "Drug history") {
          return (
            // ⚕️ A read-only view since 2026-09-07 — it takes no setter and logs no
            // additions, because there is no longer any way to add one here: the
            // ℞ pad writes Current medications through the mirror. The Lock STAYS.
            // An assistant without `rx.drugHistory` could not reach this list
            // before and must not gain a patient's medications now.
            <Lock key={f.label} locked={!canEditLabel("Drug history")}>
              <DrugHistoryField items={f.items} hidden={hideDrugHistory} onHidden={setHideDrugHistory} />
            </Lock>
          );
        }
        if (f.label === "Previous complaints") {
          return <PreviousComplaintsField key={f.label} items={f.items} setItems={f.set} />;
        }
        if (f.label === "Investigation report findings" || f.label === "On examination") {
          const isInv = f.label === "Investigation report findings";
          const openFn = isInv ? () => setShowInvPopup(true) : () => setShowOePopup(true);
          return (
            <Lock key={f.label} locked={!canEditLabel(f.label)}>
              {/* ⚕️ ⊘ Hide is opt-in and Investigation-only (physician's
                  decision, 2026-09-21). On examination renders the same
                  component and passes nothing, so it prints as it always has. */}
              <InvestigationFindingsField
                label={f.label} items={f.items} invImages={invImages} onOpen={openFn}
                hidden={isInv ? hiddenInvestigation : undefined}
                onHidden={isInv ? setHiddenInvestigation : undefined}
              />
            </Lock>
          );
        }
        return (
          <ExpandableField
            key={f.label}
            label={f.label}
            items={f.items}
            setItems={f.set}
            suggestions={suggestionDB[f.sugKey || f.label] || []}
            allFields={allFieldValues}
            checkboxOptions={f.label === "Associated illness" ? ["BA", "COPD", "Hypothyroidism", "CKD", "CLD"] : undefined}
            inlineEdit={isInlineEditField(f.label)}
            removable
            permKey={f.permKey}
            bangla={BANGLA_FIELDS.includes(f.label)}
            previousItems={f.label === "Final diagnosis" ? previousDiagnoses : undefined}
            onAdd={(item) => logActivity(f.label, item)}
          />
        );
      })}
      {/* ⚕️ Private to the signed-in user — not a clinical field, not printed
          with the prescription, and not gated by assistant keys: each user
          only ever reaches their own note (server/src/patient-notes). */}
      <PersonalNoteSection />
    </div>
  );
}
