// "Previous complaints" entries pair a (read-only) complaint carried over from
// the patient's last visit with an optional note the doctor writes beside it.
// Encoded as "complaint<SEP>note" so the pair survives as a single string in the
// prescription's string-list field. SEP is a non-printing control char so it
// never collides with anything the doctor types.

export const PC_SEP = String.fromCharCode(1);

export const encodePc = (complaint: string, note: string): string => `${complaint}${PC_SEP}${note}`;

export const decodePc = (s: string): { complaint: string; note: string } => {
  const i = s.indexOf(PC_SEP);
  return i < 0 ? { complaint: s, note: "" } : { complaint: s.slice(0, i), note: s.slice(i + 1) };
};

// Readable form for the printed sheet: "Headache — since 3 days".
export const formatPc = (s: string): string => {
  const { complaint, note } = decodePc(s);
  return note.trim() ? `${complaint} — ${note.trim()}` : complaint;
};
