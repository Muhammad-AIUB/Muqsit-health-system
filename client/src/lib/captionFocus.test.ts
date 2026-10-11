// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { controlAfterCaption, installCaptionFocus } from "./captionFocus";

// A caption above a box: pressing the caption puts the cursor in the box.
//
// The app writes a caption as its own element just before the box it names,
// and nothing tied the two together — on every form, pressing "Mobile" or
// "Bed" did nothing. A `for`/`id` pair on each of ~80 boxes would do it; so
// would wrapping each box in its caption, but a caption that WRAPS forwards
// every click inside it to its first control (the trap that keeps
// PatientMobileLookup out of a <label>). One listener, and one rule, instead.

let uninstall: () => void;
beforeEach(() => { uninstall = installCaptionFocus(); });
afterEach(() => { uninstall(); document.body.innerHTML = ""; });

const html = (s: string) => { document.body.innerHTML = s; };
const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const click = (sel: string) => $(sel).dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));

describe("captionFocus — a caption puts the cursor in its box", () => {
  it("focuses the box written straight after the caption", () => {
    html(`<div><label data-caption id="c">Bed</label><input id="box" /></div>`);
    click("#c");
    expect(document.activeElement).toBe($("#box"));
  });

  it("works for a list and for a long-text box too", () => {
    html(`<div><label data-caption id="a">Sex</label><select id="s"><option>—</option></select></div>
          <div><label data-caption id="b">Address</label><textarea id="t"></textarea></div>`);
    click("#a");
    expect(document.activeElement).toBe($("#s"));
    click("#b");
    expect(document.activeElement).toBe($("#t"));
  });

  it("finds the box when it sits inside the element after the caption (a date box, the mobile lookup)", () => {
    html(`<div><label data-caption id="c">Date of birth</label><div class="date-field"><input id="box" /><span>hint</span></div></div>`);
    click("#c");
    expect(document.activeElement).toBe($("#box"));
  });

  it("a press on something inside the caption — its unit — counts as a press on the caption", () => {
    html(`<div><label data-caption><span>Hb <span id="unit">(g/dL)</span></span></label><input id="box" /></div>`);
    click("#unit");
    expect(document.activeElement).toBe($("#box"));
  });

  it("⚕️ only ever moves the cursor — it never ticks, chooses or types anything", () => {
    html(`<div><label data-caption id="c">Hide in print</label><input id="tick" type="checkbox" /></div>`);
    click("#c");
    expect(document.activeElement).toBe($("#tick"));
    expect($<HTMLInputElement>("#tick").checked).toBe(false);
  });
});

describe("captionFocus — what it leaves alone", () => {
  it("⚕️ a label that does not say it is a caption — a switch drawn as a label, a title — moves nothing", () => {
    html(`<div><label id="plain">Mirror devices</label><div><input id="search" /></div></div>`);
    expect(controlAfterCaption($<HTMLLabelElement>("#plain"))).toBeNull();
    click("#plain");
    expect(document.activeElement).toBe(document.body);
  });

  it("a box that is shown but cannot be typed in (read-only) is not given the cursor", () => {
    html(`<div><label data-caption id="a">Patient name</label><input id="ro" readonly value="Rahim" /></div>
          <div><label data-caption id="b">Address</label><textarea id="rot" readonly>Dhaka</textarea></div>
          <div><label data-caption id="c">Mobile</label><div><input id="roin" readonly value="017" /></div></div>`);
    for (const id of ["#a", "#b", "#c"]) {
      click(id);
      expect(document.activeElement).toBe(document.body);
    }
  });

  it("a list is never 'read-only': a caption over a select still reaches it", () => {
    html(`<div><label data-caption id="c">Sex</label><select id="s"><option>—</option></select></div>`);
    click("#c");
    expect(document.activeElement).toBe($("#s"));
  });

  it("a caption that already has its own control is the browser's business", () => {
    html(`<label data-caption id="wrap">Remember me <input id="own" type="checkbox" /></label><input id="after" />
          <label data-caption id="named" for="x">Email</label><input id="other" /><input id="x" />`);
    expect(controlAfterCaption($<HTMLLabelElement>("#wrap"))).toBeNull();
    expect(controlAfterCaption($<HTMLLabelElement>("#named"))).toBeNull();
  });

  it("⚕️ a caption over a value that is only SHOWN (BMI, ideal weight) moves nothing", () => {
    html(`<div><label data-caption id="c">BMI (auto)</label><div id="value">22.4</div></div><input id="elsewhere" />`);
    click("#c");
    expect(document.activeElement).toBe(document.body);
  });

  it("⚕️ names only the box straight after it — never one further along the row", () => {
    html(`<div><label data-caption id="c">Weight (kg)</label><div>—</div><input id="next-field" /></div>`);
    click("#c");
    expect(document.activeElement).toBe(document.body);
  });

  it("a box that cannot be typed in is not given the cursor", () => {
    html(`<div><label data-caption id="a">Hospital ID</label><input id="off" disabled /></div>
          <fieldset disabled><label data-caption id="b">Mobile</label><input id="locked" /></fieldset>
          <div inert><label data-caption id="c">Bed</label><input id="gated" /></div>`);
    for (const id of ["#a", "#b", "#c"]) {
      click(id);
      expect(document.activeElement).toBe(document.body);
    }
  });

  it("a file picker and a hidden value are not boxes", () => {
    html(`<div><label data-caption id="a">Report</label><input id="file" type="file" /></div>
          <div><label data-caption id="b">Token</label><input id="hidden" type="hidden" /></div>`);
    expect(controlAfterCaption($<HTMLLabelElement>("#a"))).toBeNull();
    expect(controlAfterCaption($<HTMLLabelElement>("#b"))).toBeNull();
  });

  it("text that is not a caption does nothing", () => {
    html(`<div><div id="plain">Bed</div><input id="box" /></div>`);
    click("#plain");
    expect(document.activeElement).toBe(document.body);
  });

  it("a press something else has already handled is left alone", () => {
    html(`<div><label data-caption id="c">Bed</label><input id="box" /></div>`);
    $("#c").addEventListener("click", (e) => e.preventDefault());
    click("#c");
    expect(document.activeElement).toBe(document.body);
  });

  it("stops listening when it is taken off", () => {
    html(`<div><label data-caption id="c">Bed</label><input id="box" /></div>`);
    uninstall();
    click("#c");
    expect(document.activeElement).toBe(document.body);
    uninstall = installCaptionFocus(); // for afterEach
  });
});
