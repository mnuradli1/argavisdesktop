export * as Database from "./database.js"

import { EffectDrizzleSqlite } from "./drizzle.js"
import { sqliteLayer, supportsForeignKeyToggle, supportsTuningPragmas } from "#sqlite"
import { Context, Effect, Layer, Schema, Semaphore } from "effect"
import { SqlClient } from "effect/sql"
import { Global } from "@opencode/util/global"
import { closeSync, existsSync, openSync } from "node:fs"
import { chmod, rename, rm } from "node:fs/promises"
import { isAbsolute, join } from "path"
import { DatabaseMigration } from "./migration.js"
import { makeGlobalNode } from "@opencode/util/effect/app-node"

const makeDatabase = EffectDrizzleSqlite.makeWithDefaults()
type DatabaseShape = Effect.Success<typeof makeDatabase>

export interface Interface {
  db: DatabaseShape
}

export const Options = Schema.Struct({
  path: Schema.optional(Schema.String),
  /** A database file copied over `path` once, before first use, while `path` holds no sessions. */
  seed: Schema.optional(Schema.String),
})
export type Options = typeof Options.Type

export class Service extends Context.Service<Service, Interface>()("@opencode/storage/Database") {}

// The bootstrap lock is scoped to the database being built, never to this
// module: on workerd every Durable Object in an isolate shares module state, and
// releasing a shared semaphore resumes the waiting object's fiber inside the
// releasing object's I/O context, where its first storage call is rejected as
// cross-object I/O.
const databaseLayer = (lock: Effect.Effect<Semaphore.Semaphore>) =>
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const db = yield* makeDatabase

      if (supportsTuningPragmas) {
        yield* db.run("PRAGMA journal_mode = WAL")
        yield* db.run("PRAGMA synchronous = NORMAL")
        yield* db.run("PRAGMA busy_timeout = 5000")
        yield* db.run("PRAGMA cache_size = -64000")
        yield* db.run("PRAGMA wal_checkpoint(PASSIVE)")
      }
      // Durable Object SQLite always enforces foreign keys and rejects the pragma.
      if (supportsForeignKeyToggle) yield* db.run("PRAGMA foreign_keys = ON")
      const semaphore = yield* lock
      yield* semaphore.withPermit(DatabaseMigration.apply(db))

      return { db }
    }).pipe(Effect.orDie),
  )

// Two instances over one file bootstrap the same schema, so file databases
// share a lock per path. Each in-memory database is its own connection.
const locks = new Map<string, Semaphore.Semaphore>()

function lockFor(filename: string) {
  const existing = locks.get(filename)
  if (existing) return existing
  const lock = Semaphore.makeUnsafe(1)
  locks.set(filename, lock)
  return lock
}

export function layer(options: Options = { path: ":memory:" }) {
  return Layer.unwrap(
    Effect.gen(function* () {
      const provide = (filename: string) =>
        databaseLayer(filename === ":memory:" ? Semaphore.make(1) : Effect.succeed(lockFor(filename))).pipe(
          Layer.provide(sqliteLayer({ filename })),
        )
      const filename = options.path ?? ":memory:"
      if (filename === ":memory:") return provide(filename)
      const file = isAbsolute(filename) ? filename : join((yield* Global.Service).data, filename)
      if (options.seed && options.seed !== file) yield* lockFor(file).withPermit(seed(file, options.seed))
      yield* Effect.promise(() => restrictToOwner(file))
      return provide(file)
    }),
  )
}

// SQLite creates new sidecars with the database's mode, but does not tighten existing sidecars.
// Windows relies on the user profile directory's inherited ACLs instead of POSIX modes.
async function restrictToOwner(filename: string) {
  if (process.platform === "win32") return
  // Opening and closing an existing database can release another connection's POSIX locks.
  // Create missing files synchronously so another fiber cannot open one before it is restricted.
  if (!existsSync(filename)) closeSync(openSync(filename, "a", 0o600))
  await chmod(filename, 0o600)
  await Promise.all(
    [`${filename}-wal`, `${filename}-shm`].map((file) =>
      chmod(file, 0o600).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error
      }),
    ),
  )
}

// The marker beside the database records that the copy was decided, so deleting every session later
// does not bring the source back.
const seed = Effect.fnUntraced(
  function* (file: string, source: string) {
    const marker = `${file}-seeded`
    if (existsSync(marker)) return
    if ((yield* hasSessions(source)) && !(yield* hasSessions(file))) {
      const temp = `${file}.seed`
      yield* Effect.promise(() => rm(temp, { force: true }))
      // VACUUM INTO writes a consistent snapshot even while another process writes the source.
      yield* query(source, readOnly, (sql) => sql.unsafe("VACUUM INTO ?", [temp]))
      // Execution claims belong to the source's server. The restart sweep here would rerun those turns.
      yield* query(temp, {}, (sql) => sql.unsafe("UPDATE session_v2 SET time_suspended = NULL, resume_attempts = 0"))
      // SQLite would replay the replaced database's WAL onto the copy.
      yield* Effect.promise(() => Promise.all(["-wal", "-shm"].map((suffix) => rm(file + suffix, { force: true }))))
      yield* Effect.promise(() => rename(temp, file))
      yield* Effect.logInfo("database seeded", { file, source })
    }
    closeSync(openSync(marker, "a", 0o600))
  },
  Effect.catchCause((cause) => Effect.logWarning("database seed failed", { cause })),
)

const hasSessions = (filename: string) =>
  existsSync(filename)
    ? query(filename, readOnly, (sql) =>
        Effect.gen(function* () {
          const table = yield* sql.unsafe("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'session_v2'")
          if (table.length === 0) return false
          return (yield* sql.unsafe("SELECT 1 FROM session_v2 LIMIT 1")).length > 0
        }),
      )
    : Effect.succeed(false)

// Bun opens read-write unless both flags are off, whatever `readonly` says.
const readOnly = { readonly: true, readwrite: false, create: false }

const query = <A, E>(
  filename: string,
  options: { readonly?: boolean; readwrite?: boolean; create?: boolean },
  use: (sql: SqlClient.SqlClient) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    return yield* use(sql)
  }).pipe(Effect.provide(sqliteLayer({ filename, ...options, disableWAL: true })))

// The database service over an injected SqlClient, for runtimes that receive
// database storage instead of opening a filesystem path. Any client provided
// here still goes through the pragma guards and migrations; Global is required
// because migrations may read it (the v1 import). The lock is created per build
// because every Durable Object builds this layer over its own storage.
export const layerFromClient: Layer.Layer<Service, never, SqlClient.SqlClient | Global.Service> = databaseLayer(
  Semaphore.make(1),
)

export function configured(options?: Options) {
  return makeGlobalNode({ service: Service, layer: layer(options), deps: [Global.node] })
}

/** `configured`, but over an injected SqlClient layer instead of a filesystem path. */
export function configuredClient(client: Layer.Layer<SqlClient.SqlClient>) {
  return makeGlobalNode({
    service: Service,
    layer: layerFromClient.pipe(Layer.provide(client)),
    deps: [Global.node],
  })
}

export const node = configured({ path: ":memory:" })
