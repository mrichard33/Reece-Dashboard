import { describe, expect, it } from "vitest";
import { isMissingRelation, isMissingColumn, MIGRATIONS } from "./commandCenter";

/**
 * These two predicates are the whole of the migration banner.
 *
 * The bug they exist to prevent is a SILENT one, which is why it survived a
 * merge: with sql/112 unapplied, `v_command_center_queue` still exists, the
 * lane filters simply match no rows, and PostgREST returns 0 with NO ERROR.
 * The page then says "No stale issues" over 624 of them, and "No open to-dos"
 * over 2,400 — confidently, with nothing on screen suggesting anything is
 * wrong. It took a live database query to tell that state apart from a genuinely
 * clear queue.
 *
 * So the distinction these pin is: a missing RELATION (42P01) means R1 was never
 * applied, and a missing COLUMN (42703) means the view is there but is the old
 * version. They must never be confused, because they send someone to different
 * files.
 */

describe("isMissingRelation — sql/102 was never applied", () => {
  it("recognises Postgres 42P01 by code", () => {
    expect(isMissingRelation({ code: "42P01", message: "…" })).toBe(true);
  });

  it("recognises it by message, for clients that drop the code", () => {
    expect(isMissingRelation({ message: 'relation "v_command_center_queue" does not exist' })).toBe(true);
  });

  it("is not fooled by a missing COLUMN, which is a different migration", () => {
    // The whole point. Before this split, any "does not exist" counted as a
    // missing relation and the banner always said sql/102.
    expect(isMissingRelation({ code: "42703", message: 'column "omi_action_item_id" does not exist' })).toBe(false);
  });

  it("treats no error as no problem", () => {
    expect(isMissingRelation(null)).toBe(false);
    expect(isMissingRelation({})).toBe(false);
  });
});

describe("isMissingColumn — the view is there but it is the R1 version", () => {
  it("recognises Postgres 42703 by code", () => {
    expect(isMissingColumn({ code: "42703", message: "…" })).toBe(true);
  });

  it("recognises it by message", () => {
    expect(isMissingColumn({ message: 'column "omi_action_item_id" does not exist' })).toBe(true);
  });

  it("is not fooled by a missing relation", () => {
    expect(isMissingColumn({ code: "42P01", message: 'relation "x" does not exist' })).toBe(false);
  });

  it("treats no error as no problem — this is the common case, on every load", () => {
    expect(isMissingColumn(null)).toBe(false);
    expect(isMissingColumn({})).toBe(false);
  });
});

describe("neither predicate claims an unrelated failure is a migration", () => {
  // A permissions error or a dropped connection must not send someone to the
  // SQL editor to re-apply a migration that is already there.
  const unrelated = [
    { code: "42501", message: "permission denied for view v_command_center_queue" },
    { code: "57014", message: "canceling statement due to statement timeout" },
    { message: "TypeError: fetch failed" },
  ];
  for (const error of unrelated) {
    it(`ignores ${error.code ?? "a transport failure"}`, () => {
      expect(isMissingRelation(error)).toBe(false);
      expect(isMissingColumn(error)).toBe(false);
    });
  }
});

describe("the files the banner points at", () => {
  it("names both migrations and the sections to run", () => {
    // The section range is part of the instruction: sql/112 has seven sections,
    // A through G, and telling someone "A through F" would leave the
    // single-card lane buttons broken with no sign of why.
    expect(MIGRATIONS.r1.file).toBe("sql/102_command_center.sql");
    expect(MIGRATIONS.r1.sections).toBe("A through F");
    expect(MIGRATIONS.r2.file).toBe("sql/112_command_center_r2.sql");
    expect(MIGRATIONS.r2.sections).toBe("A through G");
  });
});
