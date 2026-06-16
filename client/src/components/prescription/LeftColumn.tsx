"use client";

import { C } from "@/theme";
import { useMuqsit } from "@/context/MuqsitContext";
import { suggestionDB } from "@/data/suggestions";
import ExpandableField from "@/components/common/ExpandableField";
import InvestigationFindingsField from "@/components/investigation/InvestigationFindingsField";
import DrugHistoryField from "@/components/prescription/DrugHistoryField";
import PreviousComplaintsField from "@/components/prescription/PreviousComplaintsField";
import { useActivityLog } from "@/hooks/useActivity";

export default function LeftColumn() {
  const { leftFields, allFieldValues, setShowInvPopup, setShowOePopup, invImages } = useMuqsit();
  const logActivity = useActivityLog();

  return (
    <div>
      {leftFields.map((f) => {
        if (f.label === "Drug history") {
          return (
            <DrugHistoryField
              key={f.label}
              items={f.items}
              setItems={f.set}
              onAdd={(drug) => logActivity("Drug history", drug)}
            />
          );
        }
        if (f.label === "Previous complaints") {
          return <PreviousComplaintsField key={f.label} items={f.items} setItems={f.set} />;
        }
        if (f.label === "Investigation report findings" || f.label === "On examination") {
          const openFn = f.label === "Investigation report findings" ? () => setShowInvPopup(true) : () => setShowOePopup(true);
          return <InvestigationFindingsField key={f.label} label={f.label} items={f.items} invImages={invImages} onOpen={openFn} />;
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
            onAdd={(item) => logActivity(f.label, item)}
          />
        );
      })}
    </div>
  );
}
