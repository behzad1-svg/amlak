import { describe, expect, it } from "vitest";
import { databaseUrlToPgEnv } from "./backup";

describe("databaseUrlToPgEnv", () => {
  it("parses a normal postgres URL", () => {
    expect(databaseUrlToPgEnv("postgres://sajcrm:secret@127.0.0.1:5432/saj_crm_db")).toEqual({
      PGHOST: "127.0.0.1",
      PGPORT: "5432",
      PGUSER: "sajcrm",
      PGPASSWORD: "secret",
      PGDATABASE: "saj_crm_db",
    });
  });

  it("decodes a percent-encoded password and passes sslmode through", () => {
    expect(
      databaseUrlToPgEnv("postgres://user:p%40ss%3Aw%2Frd@db.example.com:5433/mydb?sslmode=require"),
    ).toEqual({
      PGHOST: "db.example.com",
      PGPORT: "5433",
      PGUSER: "user",
      PGPASSWORD: "p@ss:w/rd",
      PGDATABASE: "mydb",
      PGSSLMODE: "require",
    });
  });

  it("defaults the port to 5432 when missing", () => {
    expect(databaseUrlToPgEnv("postgresql://u:p@localhost/db")).toEqual({
      PGHOST: "localhost",
      PGPORT: "5432",
      PGUSER: "u",
      PGPASSWORD: "p",
      PGDATABASE: "db",
    });
  });
});
