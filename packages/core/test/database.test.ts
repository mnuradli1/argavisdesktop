import { describe, expect, test } from "bun:test"
import { chmod, mkdir, stat, writeFile } from "node:fs/promises"
import path from "path"
import { sql } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import { Database } from "@opencode/core/database/database"
import { Global } from "@opencode/util/global"
import { tmpdir } from "./fixture/tmpdir"

// Read while the connection is open: SQLite may remove the sidecars on close.
const openModes = (filename: string) =>
  Effect.runPromise(
    Effect.gen(function* () {
      yield* Layer.build(Database.layer({ path: filename }))
      return yield* Effect.promise(() =>
        Promise.all(["", "-wal", "-shm"].map(async (suffix) => (await stat(filename + suffix)).mode & 0o777)),
      )
    }).pipe(Effect.scoped, Effect.provideService(Global.Service, Global.make({ data: path.dirname(filename) }))),
  )

describe.skipIf(process.platform === "win32")("Database file permissions", () => {
  test("creates the database and sidecars readable only by the owner", async () => {
    await using tmp = await tmpdir()

    expect(await openModes(path.join(tmp.path, "opencode.db"))).toEqual([0o600, 0o600, 0o600])
  })

  test("tightens an existing database and sidecars", async () => {
    await using tmp = await tmpdir()
    const filename = path.join(tmp.path, "opencode.db")
    await Promise.all(
      ["", "-wal", "-shm"].map(async (suffix) => {
        await writeFile(filename + suffix, "")
        await chmod(filename + suffix, 0o644)
      }),
    )

    expect(await openModes(filename)).toEqual([0o600, 0o600, 0o600])
  })
})

// Builds the database at `filename`, runs `statements`, and returns the session titles it holds.
const titles = (filename: string, statements: ReadonlyArray<string> = [], seed?: string) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const db = Context.get(yield* Layer.build(Database.layer({ path: filename, seed })), Database.Service).db
      yield* Effect.forEach(statements, (statement) => db.run(sql.raw(statement)))
      const rows = yield* db.all<{ title: string; claimed: number }>(
        sql`SELECT title, time_suspended IS NOT NULL AS claimed FROM session_v2 ORDER BY title`,
      )
      return rows.map((row) => (row.claimed ? `${row.title} (claimed)` : row.title))
    }).pipe(Effect.scoped, Effect.provideService(Global.Service, Global.make({ data: path.dirname(filename) }))),
  )

const session = (title: string) => [
  `INSERT OR IGNORE INTO project (id, worktree, time_created, time_updated, sandboxes) VALUES ('prj', '/repo', 0, 0, '[]')`,
  `INSERT INTO session_v2 (id, project_id, slug, directory, version, title, time_created, time_updated, time_suspended, resume_attempts) VALUES ('ses_${title}', 'prj', '${title}', '/repo', '1', '${title}', 0, 0, 1, 2)`,
]

describe("Database seed", () => {
  test.each([
    { name: "copies into a missing database", target: undefined, source: ["old"], expected: ["old"] },
    { name: "copies into a database without sessions", target: [], source: ["old"], expected: ["old"] },
    { name: "keeps a database that has sessions", target: ["new"], source: ["old"], expected: ["new (claimed)"] },
    { name: "skips a source without sessions", target: [], source: [], expected: [] },
    { name: "skips a missing source", target: [], source: undefined, expected: [] },
  ])("$name", async (input) => {
    await using tmp = await tmpdir()
    const filename = path.join(tmp.path, "target", "opencode.db")
    const source = path.join(tmp.path, "source", "opencode.db")
    await Promise.all([mkdir(path.dirname(filename)), mkdir(path.dirname(source))])
    if (input.source) await titles(source, input.source.flatMap(session))
    if (input.target) await titles(filename, input.target.flatMap(session))

    // Copied sessions lose their execution claims: the source's server owns those turns.
    expect(await titles(filename, [], source)).toEqual([...input.expected])
  })

  test("copies once, even after every session is deleted", async () => {
    await using tmp = await tmpdir()
    const filename = path.join(tmp.path, "target", "opencode.db")
    const source = path.join(tmp.path, "source", "opencode.db")
    await Promise.all([mkdir(path.dirname(filename)), mkdir(path.dirname(source))])
    await titles(source, session("old"))

    expect(await titles(filename, ["DELETE FROM session_v2"], source)).toEqual([])
    expect(await titles(filename, [], source)).toEqual([])
    if (process.platform !== "win32") expect((await stat(filename)).mode & 0o777).toBe(0o600)
  })
})
