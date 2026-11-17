import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "./csv";

describe("csvCell", () => {
  it("escapes double quotes", () => {
    expect(csvCell('a"b')).toBe('"a""b"');
  });

  it("returns empty quotes for null/undefined", () => {
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
  });

  it("leaves plain text and numbers alone", () => {
    expect(csvCell("hello")).toBe('"hello"');
    expect(csvCell(123)).toBe('"123"');
  });

  it("neutralizes formula starters with a leading quote", () => {
    expect(csvCell("=2+5")).toBe("\"'=2+5\"");
    expect(csvCell("+123")).toBe("\"'+123\"");
    expect(csvCell("-5")).toBe("\"'-5\"");
    expect(csvCell("@user")).toBe("\"'@user\"");
    expect(csvCell("|calc")).toBe("\"'|calc\"");
    expect(csvCell("%x")).toBe("\"'%x\"");
  });

  it("neutralizes after leading whitespace too (Excel trims it)", () => {
    expect(csvCell("  =2+5")).toBe("\"'  =2+5\"");
  });
});

describe("toCsv", () => {
  it("joins rows with CRLF and a BOM, neutralizing cells", () => {
    expect(toCsv([["a", "b"], ["=x", "y"]])).toBe(
      "\uFEFF\"a\",\"b\"\r\n\"'=x\",\"y\""
    );
  });
});
