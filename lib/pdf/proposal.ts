import path from "node:path";
import PDFDocument from "pdfkit";

import type { ProposalCopy } from "@/types/proposal";

/**
 * Renders the proposal PDF.
 *
 * ON FONTS — this is not cosmetic. PDF's built-in fonts (Helvetica et al.) are
 * WinAnsi-encoded and have no U+20B9. pdfkit does not error on it: it truncates
 * the code point to two bytes, so "₹17,93,471.38" renders as " ¹17,93,471.38" —
 * a space and a superscript one — in the client-facing document, on the flagship
 * market, silently. Roboto is embedded because it actually has the glyph
 * (verified: hasGlyphForCodePoint(0x20B9)). fontkit reads the .woff directly, so
 * no font binary is vendored into the repo.
 *
 * Any currency whose symbol isn't in the embedded font would hit the same class
 * of bug — worth re-checking when a market is added.
 */

const FONT_DIR = path.join(
  process.cwd(),
  "node_modules",
  "roboto-fontface",
  "fonts",
  "roboto",
);
const REGULAR = path.join(FONT_DIR, "Roboto-Regular.woff");
const MEDIUM = path.join(FONT_DIR, "Roboto-Medium.woff");

export type ProposalPdfInput = {
  copy: ProposalCopy;
  projectName: string;
  designerBrand: string | null;
  marketName: string;
  totals: { label: string; value: string }[];
  /** Canonical, from the locale's catalogue — never the model's (see route). */
  disclaimer: string;
  labels: {
    investment: string;
    nextSteps: string;
    valueEngineering: string;
    preparedFor: string;
  };
};

export async function renderProposalPdf(
  input: ProposalPdfInput,
): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 56, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.registerFont("body", REGULAR);
  doc.registerFont("head", MEDIUM);

  const INK = "#111111";
  const MUTED = "#666666";

  // Header
  if (input.designerBrand) {
    doc.font("head").fontSize(9).fillColor(MUTED).text(input.designerBrand.toUpperCase());
    doc.moveDown(0.4);
  }
  doc.font("head").fontSize(22).fillColor(INK).text(input.copy.title);
  doc.moveDown(0.3);
  doc
    .font("body")
    .fontSize(9)
    .fillColor(MUTED)
    .text(`${input.labels.preparedFor} ${input.projectName} · ${input.marketName}`);
  doc.moveDown(1.2);

  // Intro
  doc.font("body").fontSize(10.5).fillColor(INK).text(input.copy.intro, { align: "left" });
  doc.moveDown(1);

  // Rooms
  for (const room of input.copy.rooms) {
    if (doc.y > 690) doc.addPage();
    doc.font("head").fontSize(12).fillColor(INK).text(room.name);
    doc.moveDown(0.2);
    doc.font("body").fontSize(10).fillColor(INK).text(room.summary);
    if (room.highlights.length) {
      doc.moveDown(0.3);
      for (const h of room.highlights) {
        doc.font("body").fontSize(9.5).fillColor(MUTED).text(`•  ${h}`, { indent: 8 });
      }
    }
    doc.moveDown(0.8);
  }

  // Investment
  if (doc.y > 620) doc.addPage();
  doc.moveDown(0.4);
  doc.font("head").fontSize(13).fillColor(INK).text(input.labels.investment);
  doc.moveDown(0.4);
  doc.font("body").fontSize(10).fillColor(INK).text(input.copy.investment_summary);
  doc.moveDown(0.6);

  // Totals — the ₹ these carry is why Roboto is embedded.
  for (const row of input.totals) {
    const last = row === input.totals[input.totals.length - 1];
    doc.font(last ? "head" : "body").fontSize(last ? 11 : 10).fillColor(INK);
    const y = doc.y;
    doc.text(row.label, 56, y, { continued: false });
    doc.text(row.value, 56, y, { align: "right", width: doc.page.width - 112 });
    doc.moveDown(0.25);
  }

  if (input.copy.value_engineering_note) {
    doc.moveDown(0.8);
    doc.font("head").fontSize(11).fillColor(INK).text(input.labels.valueEngineering);
    doc.moveDown(0.2);
    doc.font("body").fontSize(9.5).fillColor(INK).text(input.copy.value_engineering_note);
  }

  // Next steps
  if (input.copy.next_steps.length) {
    if (doc.y > 660) doc.addPage();
    doc.moveDown(1);
    doc.font("head").fontSize(13).fillColor(INK).text(input.labels.nextSteps);
    doc.moveDown(0.3);
    input.copy.next_steps.forEach((step, i) => {
      doc.font("body").fontSize(10).fillColor(INK).text(`${i + 1}.  ${step}`, { indent: 4 });
      doc.moveDown(0.15);
    });
  }

  // Disclaimer on every page — non-negotiable #3. Placed in the footer via
  // bufferPages so it can't be pushed off by long copy.
  //
  // The bottom margin is zeroed while writing it. Text at height-48 sits inside
  // the bottom margin, so pdfkit treats it as an overflow and helpfully starts a
  // new page — which then also gets a footer, and so on. That produced a
  // document with twice the pages and the disclaimer on only half of them.
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .font("body")
      .fontSize(7.5)
      .fillColor(MUTED)
      .text(input.disclaimer, 56, doc.page.height - 48, {
        width: doc.page.width - 112,
        align: "left",
        lineGap: 1,
      });
    doc.page.margins.bottom = bottom;
  }

  doc.end();
  return done;
}
