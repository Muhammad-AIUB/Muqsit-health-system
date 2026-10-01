import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { maskMobile, maskName } from "./rxPrivacy";
import { anyText, configureProps } from "@/test/fc";

// The OPD "privacy copy" is the page handed to a pharmacy or a lab: "the
// patient's identity (name + mobile) is masked" (lib/prescriptionDoc.ts). The
// two documented examples — "Md Hasan" → "M* H*s*n*" and "01712346951" →
// "******* 6951" (lib/rxPrivacy.ts) — are pinned first; the properties then say
// what a mask must never do: show more of the identity than it promised.
configureProps(500);

describe("the documented examples", () => {
  it("maskName", () => {
    expect(maskName("hasan")).toBe("h*s*n*");
    expect(maskName("Md Hasan")).toBe("M* H*s*n*");
  });
  it("maskMobile", () => {
    expect(maskMobile("01712346951")).toBe("******* 6951");
  });
});

const name = fc.oneof(
  fc.array(fc.string({ unit: fc.constantFrom(..."abcdefghijklmnopqrstuvwxyzABCDEF"), minLength: 1, maxLength: 9 }), { maxLength: 4 }).map((w) => w.join(" ")),
  fc.constantFrom("মোঃ হাসান", "Patient", "", " ", "A", "Md Hasan"),
  anyText(16),
);

describe("maskName", () => {
  it("never throws, and keeps every space where it was", () => {
    fc.assert(
      fc.property(name, (n) => {
        const out = maskName(n);
        // Spaces survive, in order.
        expect([...out].filter((ch) => /\s/.test(ch)).join("")).toBe([...n].filter((ch) => /\s/.test(ch)).join(""));
      }),
    );
  });

  it("⚕️ shows only every other letter — never two neighbouring letters of the name", () => {
    fc.assert(
      fc.property(name.filter((n) => !n.includes("*")), (n) => {
        const letters = [...n].filter((ch) => !/\s/.test(ch));
        const shown = [...maskName(n)].filter((ch) => !/\s/.test(ch) && ch !== "*");
        expect(shown).toEqual(letters.filter((_, i) => i % 2 === 0));
        // At least half of the name is hidden.
        expect(shown.length).toBeLessThanOrEqual(Math.ceil(letters.length / 2));
      }),
    );
  });

  it("an empty name stays empty — nothing is invented", () => {
    expect(maskName("")).toBe("");
    expect(maskName("   ")).toBe("   ");
  });
});

describe("maskMobile", () => {
  const mobile = fc.oneof(
    fc.string({ unit: fc.constantFrom(..."0123456789"), minLength: 5, maxLength: 14 }),
    fc.tuple(fc.constantFrom("+880 ", "+88", "0"), fc.string({ unit: fc.constantFrom(..."0123456789"), minLength: 9, maxLength: 10 })).map((p) => p.join("")),
  );

  it("⚕️ shows the last four characters and not one digit before them", () => {
    fc.assert(
      fc.property(mobile, fc.constantFrom("", " ", "  "), (m, pad) => {
        const out = maskMobile(pad + m + pad);
        expect(out.endsWith(` ${m.slice(-4)}`)).toBe(true);
        const hidden = out.slice(0, out.length - 5);
        expect(hidden).not.toMatch(/[0-9+]/);
        expect(hidden.replace(/\s/g, "")).toMatch(/^\*+$/);
        // Same length as the number: the mask does not reveal a shorter or longer one.
        expect(hidden.length).toBe(m.length - 4);
      }),
    );
  });

  it("returns a number of four characters or fewer as it is (there is nothing left to hide behind)", () => {
    for (const short of ["", "1", "6951", " 12 "]) expect(maskMobile(short)).toBe(short.trim());
  });

  it("never throws on anything typed into the mobile box", () => {
    fc.assert(fc.property(anyText(20), (s) => { expect(typeof maskMobile(s)).toBe("string"); }));
  });
});
