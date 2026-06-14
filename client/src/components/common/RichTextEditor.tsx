"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { C } from "@/theme";
import { ApiError, uploadImage } from "@/lib/api";

// Font list mirroring Microsoft Word's font menu (theme fonts + the standard
// Windows/Office font set). Label is what shows in the dropdown; value is the
// CSS font-family applied to the selection.
const FONT_GROUPS: { group: string; fonts: { label: string; value: string }[] }[] = [
  {
    group: "Theme Fonts",
    fonts: [
      { label: "Aptos Display (Headings)", value: "Aptos Display" },
      { label: "Aptos (Body)", value: "Aptos" },
    ],
  },
  {
    group: "All Fonts",
    fonts: [
      "Arial", "Arial Black", "Arial Narrow", "Bahnschrift", "Bahnschrift Condensed",
      "Bahnschrift Light", "Bahnschrift SemiBold", "Bahnschrift SemiCondensed",
      "Bookman Old Style", "Calibri", "Calibri Light", "Cambria", "Cambria Math",
      "Candara", "Candara Light", "Century Gothic", "Comic Sans MS", "Consolas",
      "Constantia", "Corbel", "Corbel Light", "Courier New", "Ebrima",
      "Franklin Gothic Medium", "Gabriola", "Gadugi", "Garamond", "Georgia",
      "Impact", "Ink Free", "Javanese Text", "Leelawadee UI", "Lucida Console",
      "Lucida Sans Unicode", "Malgun Gothic", "Marlett", "Microsoft Himalaya",
      "Microsoft JhengHei", "Microsoft New Tai Lue", "Microsoft PhagsPa",
      "Microsoft Sans Serif", "Microsoft Tai Le", "Microsoft YaHei",
      "Microsoft Yi Baiti", "MingLiU-ExtB", "Mongolian Baiti", "MS Gothic",
      "MV Boli", "Myanmar Text", "Nirmala UI", "Palatino Linotype", "Segoe Print",
      "Segoe Script", "Segoe UI", "Segoe UI Emoji", "Segoe UI Historic",
      "Segoe UI Symbol", "SimSun", "Sitka", "Sylfaen", "Symbol", "Tahoma",
      "Times New Roman", "Trebuchet MS", "Verdana", "Webdings", "Wingdings",
      "Yu Gothic", "Yu Mincho",
    ].map((f) => ({ label: f, value: f })),
  },
];

// Lightweight, dependency-free rich text editor built on a contentEditable
// surface + document.execCommand. Returns HTML via onChange. Good enough for
// formatting a prescription header (bold/italic, sizes, alignment, lists,
// colour) without pulling in a heavy editor library.
export interface RichTextEditorHandle {
  setAlign: (dir: "left" | "center" | "right") => void;
}

const RichTextEditor = forwardRef<
  RichTextEditorHandle,
  {
    value: string;
    onChange: (html: string) => void;
    minHeight?: number;
    placeholder?: string;
  }
>(function RichTextEditor({ value, onChange, minHeight = 200, placeholder = "Start typing…" }, handleRef) {
  const ref = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [empty, setEmpty] = useState(true);
  const [imgBusy, setImgBusy] = useState(false);

  // Seed the editor once on mount (and whenever the external value diverges
  // while the editor isn't focused — e.g. a reset). Avoids cursor jumps.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (document.activeElement !== el && el.innerHTML !== value) {
      el.innerHTML = value || "";
    }
    setEmpty(isBlank(el.innerHTML));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const sync = () => {
    const html = ref.current?.innerHTML ?? "";
    setEmpty(isBlank(html));
    onChange(html);
  };

  const exec = (cmd: string, arg?: string) => {
    document.execCommand(cmd, false, arg);
    ref.current?.focus();
    sync();
  };

  // Apply a precise px font size to the selection. execCommand("fontSize")
  // only takes the 1–7 buckets, so we tag the selection with size 7 then
  // rewrite those <font> tags to the exact px value.
  const setFontSize = (px: string) => {
    const el = ref.current;
    if (!el) return;
    document.execCommand("fontSize", false, "7");
    el.querySelectorAll('font[size="7"]').forEach((f) => {
      f.removeAttribute("size");
      (f as HTMLElement).style.fontSize = px;
    });
    el.focus();
    sync();
  };

  // The color menu steals focus, so remember the last in-editor selection and
  // restore it before applying a color.
  const savedRange = useRef<Range | null>(null);
  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount && ref.current && ref.current.contains(sel.anchorNode)) {
      savedRange.current = sel.getRangeAt(0).cloneRange();
    }
  };
  const restoreSelection = () => {
    if (!ref.current) return;
    ref.current.focus();
    const r = savedRange.current;
    if (r) {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(r);
    }
  };

  const applyColor = (color: string) => {
    restoreSelection();
    document.execCommand("foreColor", false, color);
    sync();
  };

  // Upload an image to Cloudinary and insert it at the caret.
  const insertImage = (url: string) => {
    restoreSelection();
    document.execCommand("insertImage", false, url);
    ref.current?.querySelectorAll<HTMLImageElement>("img:not([data-rte])").forEach((img) => {
      img.setAttribute("data-rte", "1");
      img.style.maxWidth = "100%";
      img.style.height = "auto";
    });
    sync();
  };

  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImgBusy(true);
    try {
      insertImage(await uploadImage(file));
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : "Image upload failed. Is the API running?");
    } finally {
      setImgBusy(false);
    }
  };

  // Gradient text: wrap the selection in a span that clips a gradient to the
  // glyphs. (execCommand can't do gradients.)
  const applyGradient = (gradient: string) => {
    restoreSelection();
    const sel = window.getSelection();
    if (sel && sel.rangeCount && !sel.isCollapsed) {
      const range = sel.getRangeAt(0);
      const span = document.createElement("span");
      span.style.backgroundImage = gradient;
      span.style.backgroundClip = "text";
      const s = span.style as CSSStyleDeclaration & { webkitBackgroundClip?: string; webkitTextFillColor?: string };
      s.webkitBackgroundClip = "text";
      s.webkitTextFillColor = "transparent";
      span.style.color = "transparent";
      try {
        span.appendChild(range.extractContents());
        range.insertNode(span);
      } catch {
        /* selection spanned incompatible nodes — ignore */
      }
      sel.removeAllRanges();
    }
    sync();
  };

  // Alignment is applied to the content (not a container style) so it works
  // on an empty editor and keeps focus — fixes typed text being invisible.
  useImperativeHandle(handleRef, () => ({
    setAlign: (dir) => {
      ref.current?.focus();
      restoreSelection();
      document.execCommand(`justify${dir.charAt(0).toUpperCase()}${dir.slice(1)}`, false);
      sync();
    },
  }), []);

  return (
    <div style={{ border: `0.5px solid ${C.n[200]}`, borderRadius: 10, overflow: "hidden", background: C.n[0] }}>
      {/* Toolbar */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4, padding: 6, borderBottom: `0.5px solid ${C.n[200]}`, background: C.n[50] }}>
        <select
          onChange={(e) => { if (e.target.value) exec("fontName", e.target.value); e.target.selectedIndex = 0; }}
          defaultValue=""
          title="Font"
          style={{ ...selStyle, minWidth: 150 }}
        >
          <option value="" disabled>Font</option>
          {FONT_GROUPS.map((g) => (
            <optgroup key={g.group} label={g.group}>
              {g.fonts.map((f) => (
                <option key={f.label} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <select
          onChange={(e) => { if (e.target.value) setFontSize(e.target.value); e.target.selectedIndex = 0; }}
          defaultValue=""
          title="Font size"
          style={selStyle}
        >
          <option value="" disabled>Size</option>
          {["10px", "12px", "14px", "16px", "18px", "20px", "24px", "28px", "32px", "40px"].map((s) => (
            <option key={s} value={s}>{s.replace("px", "")}</option>
          ))}
        </select>
        <Sep />
        <Btn label="B" title="Bold" onClick={() => exec("bold")} style={{ fontWeight: 700 }} />
        <Btn label="I" title="Italic" onClick={() => exec("italic")} style={{ fontStyle: "italic" }} />
        <Btn label="U" title="Underline" onClick={() => exec("underline")} style={{ textDecoration: "underline" }} />
        <Sep />
        <ColorMenu onColor={applyColor} onGradient={applyGradient} onAutomatic={() => applyColor(C.n[900])} />
        <Sep />
        <button
          title="Insert image"
          onMouseDown={(e) => { e.preventDefault(); saveSelection(); imageInputRef.current?.click(); }}
          disabled={imgBusy}
          style={{ ...btnStyle, opacity: imgBusy ? 0.6 : 1 }}
        >
          {imgBusy ? "…" : "🖼 Image"}
        </button>
        <input ref={imageInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onPickImage} />
      </div>

      {/* Editable surface */}
      <div style={{ position: "relative" }}>
        {empty && (
          <div style={{ position: "absolute", top: 12, left: 14, color: C.n[500], fontSize: 13, pointerEvents: "none" }}>
            {placeholder}
          </div>
        )}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={sync}
          onBlur={sync}
          onMouseUp={saveSelection}
          onKeyUp={saveSelection}
          style={{
            minHeight,
            padding: "12px 14px",
            fontSize: 13,
            lineHeight: 1.6,
            color: C.n[900],
            outline: "none",
            fontFamily: "inherit",
          }}
        />
      </div>
    </div>
  );
});

export default RichTextEditor;

function isBlank(html: string): boolean {
  return !html || html === "<br>" || html.replace(/<[^>]*>/g, "").replace(/ |&nbsp;/g, "").trim() === "";
}

const btnStyle: React.CSSProperties = {
  minWidth: 28,
  height: 28,
  padding: "0 8px",
  borderRadius: 6,
  border: `0.5px solid ${C.n[200]}`,
  background: C.n[0],
  color: C.n[800],
  fontSize: 12.5,
  cursor: "pointer",
  fontFamily: "inherit",
};
const selStyle: React.CSSProperties = { ...btnStyle, height: 28, padding: "0 6px" };

function Btn({ label, title, onClick, style }: { label: string; title: string; onClick: () => void; style?: React.CSSProperties }) {
  // onMouseDown + preventDefault keeps the selection in the editor when the
  // toolbar button is pressed (otherwise execCommand has nothing to act on).
  return (
    <button title={title} onMouseDown={(e) => { e.preventDefault(); onClick(); }} style={{ ...btnStyle, ...style }}>
      {label}
    </button>
  );
}

function Sep() {
  return <span style={{ width: 1, height: 18, background: C.n[200], margin: "0 2px" }} />;
}

// ── Color menu (mirrors Word's font-colour dropdown) ────────
// Office theme colors (top row of the Theme Colors grid).
const THEME = ["#FFFFFF", "#000000", "#E7E6E6", "#44546A", "#4472C4", "#ED7D31", "#A5A5A5", "#FFC000", "#5B9BD5", "#70AD47"];
const STANDARD = ["#C00000", "#FF0000", "#FFC000", "#FFFF00", "#92D050", "#00B050", "#00B0F0", "#0070C0", "#002060", "#7030A0"];

// Mix hex toward white (p>0) or black (p<0).
function shade(hex: string, p: number): string {
  const c = parseInt(hex.slice(1), 16);
  let r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  if (p >= 0) {
    r = Math.round(r + (255 - r) * p);
    g = Math.round(g + (255 - g) * p);
    b = Math.round(b + (255 - b) * p);
  } else {
    const q = 1 + p;
    r = Math.round(r * q); g = Math.round(g * q); b = Math.round(b * q);
  }
  return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
}
// 5 tint/shade variants per theme color, like Word's grid.
function shadesFor(hex: string): string[] {
  const lum = (parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16)) / 765;
  const steps = lum > 0.85 ? [-0.05, -0.15, -0.25, -0.35, -0.5] : [0.8, 0.6, 0.4, -0.25, -0.5];
  return steps.map((s) => shade(hex, s));
}
const SHADE_ROWS: string[][] = [0, 1, 2, 3, 4].map((i) => THEME.map((t) => shadesFor(t)[i]));

const GRADIENTS = [
  "linear-gradient(135deg,#000000,#7f7f7f)", "linear-gradient(135deg,#44546A,#8497B0)",
  "linear-gradient(135deg,#4472C4,#2e4a86)", "linear-gradient(135deg,#ED7D31,#9e5320)",
  "linear-gradient(135deg,#FFC000,#bf8f00)", "linear-gradient(135deg,#70AD47,#4a7330)",
  "linear-gradient(135deg,#5B9BD5,#2e5a8c)", "linear-gradient(135deg,#C00000,#7f0000)",
  "linear-gradient(135deg,#FF0000,#FFC000)", "linear-gradient(135deg,#00B050,#00B0F0)",
  "linear-gradient(135deg,#0070C0,#7030A0)", "linear-gradient(135deg,#7030A0,#FF00FF)",
  "linear-gradient(90deg,#4472C4,#70AD47)", "linear-gradient(90deg,#ED7D31,#FFC000)",
  "linear-gradient(90deg,#C00000,#7030A0)", "linear-gradient(90deg,#00B0F0,#0070C0)",
  "linear-gradient(45deg,#FF0000,#0070C0)", "linear-gradient(45deg,#FFC000,#70AD47)",
];

function ColorMenu({
  onColor,
  onGradient,
  onAutomatic,
}: {
  onColor: (c: string) => void;
  onGradient: (g: string) => void;
  onAutomatic: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Wrap an action so it keeps the editor selection (preventDefault) and closes.
  const pick = (fn: () => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    fn();
    setOpen(false);
  };

  const eyedrop = async () => {
    const Ctor = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
    if (!Ctor) {
      window.alert("Eyedropper isn't supported in this browser.");
      return;
    }
    try {
      const res = await new Ctor().open();
      onColor(res.sRGBHex);
    } catch {
      /* cancelled */
    }
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        title="Font colour"
        onMouseDown={(e) => { e.preventDefault(); setOpen((o) => !o); }}
        style={{ ...btnStyle, display: "inline-flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, lineHeight: 1 }}
      >
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>A</span>
        <span style={{ width: 16, height: 3, background: "#FF0000", borderRadius: 1 }} />
      </button>

      {/* Native picker kept outside the panel so it survives the menu closing. */}
      <input
        ref={colorInputRef}
        type="color"
        onChange={(e) => onColor(e.target.value)}
        style={{ position: "absolute", width: 0, height: 0, opacity: 0, pointerEvents: "none" }}
      />

      {open && (
        <div onMouseDown={(e) => e.preventDefault()} style={panelStyle}>
          <button onMouseDown={pick(onAutomatic)} style={menuRow}>
            <span style={{ width: 16, height: 16, background: "#000", borderRadius: 2, border: `1px solid ${C.n[300]}` }} />
            Automatic
          </button>

          <ColorGroup label="Theme Colors">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(10,1fr)", gap: 3 }}>
              {THEME.map((h) => <Swatch key={h} color={h} onPick={pick(() => onColor(h))} />)}
              {SHADE_ROWS.flat().map((h, i) => <Swatch key={`s${i}`} color={h} onPick={pick(() => onColor(h))} />)}
            </div>
          </ColorGroup>

          <ColorGroup label="Standard Colors">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(10,1fr)", gap: 3 }}>
              {STANDARD.map((h) => <Swatch key={h} color={h} onPick={pick(() => onColor(h))} />)}
            </div>
          </ColorGroup>

          <ColorGroup label="Gradient Fill">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 4 }}>
              {GRADIENTS.map((g, i) => <Swatch key={i} gradient={g} onPick={pick(() => onGradient(g))} />)}
            </div>
          </ColorGroup>

          <div style={{ height: 1, background: C.n[200], margin: "8px 0" }} />

          <button onMouseDown={(e) => e.preventDefault()} style={menuRow}>
            <span>🌈</span> More Gradient Colors <span style={{ marginLeft: "auto", color: C.n[500] }}>›</span>
          </button>
          <button onMouseDown={pick(() => colorInputRef.current?.click())} style={menuRow}>
            <span>🎨</span> More Fill Colors…
          </button>
          <button onMouseDown={pick(eyedrop)} style={menuRow}>
            <span>🖊️</span> Eyedropper
          </button>
        </div>
      )}
    </div>
  );
}

function ColorGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ fontSize: 11, color: C.n[600], margin: "4px 2px 6px" }}>{label}</div>
      {children}
    </div>
  );
}

function Swatch({ color, gradient, onPick }: { color?: string; gradient?: string; onPick: (e: React.MouseEvent) => void }) {
  return (
    <button
      title={color ?? "Gradient"}
      onMouseDown={onPick}
      style={{
        width: "100%",
        height: gradient ? 20 : 15,
        padding: 0,
        border: `1px solid rgba(0,0,0,0.18)`,
        borderRadius: 2,
        cursor: "pointer",
        background: gradient ?? color,
      }}
    />
  );
}

const panelStyle: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 4px)",
  left: 0,
  zIndex: 50,
  width: 250,
  background: C.n[0],
  border: `0.5px solid ${C.n[200]}`,
  borderRadius: 10,
  boxShadow: "0 12px 32px rgba(0,0,0,0.16)",
  padding: 8,
};

const menuRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  padding: "7px 8px",
  border: "none",
  background: "transparent",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 12.5,
  color: C.n[800],
  fontFamily: "inherit",
  textAlign: "left",
};
