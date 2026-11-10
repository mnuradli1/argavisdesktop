import path from "node:path"

export function parseCliVersion(output: string) {
  const marker = output.lastIndexOf(" v")
  const version = marker === -1 ? output : output.slice(marker + 2)

  if (!version) throw new Error("V2 CLI did not provide a version")

  return version
}

export function serviceVersion(input: {
  readonly channel: "local" | "dev" | "beta" | "prod"
  readonly isolated?: boolean
  readonly mode: "initial" | "reconnect"
  readonly version: string
}) {
  if (input.mode === "reconnect") return undefined

  if (input.channel === "beta" && !input.isolated) return undefined

  return input.version
}

/**
 * The registration file the CLI writes, or undefined for the shared `service.json` of every published channel, which
 * the client finds on its own. Only a CLI built from this checkout registers elsewhere. Matches the CLI's
 * `ServiceConfig.filename` under Argavis' own state directory, never OpenCode's.
 */
export function serviceFile(input: {
  /** `OPENCODE_DESKTOP_SERVER_CHANNEL`: `local` for a CLI built from this checkout. */
  readonly server?: string
  readonly stateHome: string
}) {
  if (input.server === "local") return path.join(input.stateHome, "argavis", "service-local.json")

  return undefined
}

// Retrying on timeout can also replace a server stuck in a migration longer than 120 s, which is accepted.
export function shouldRetryEnsure(version: string | undefined, message: string) {
  if (version !== undefined) return false

  return (
    message === "Background service failed to start" ||
    message === "Timed out waiting for the background service to start"
  )
}

export function stageName(version: string, arch = process.arch) {
  return `${version}-${arch}`.replace(/[^a-zA-Z0-9._-]/g, "-")
}

export function keptStages(bundledVersion: string, runningVersion?: string, arch = process.arch) {
  const stages = [stageName(bundledVersion, arch)]

  if (runningVersion && runningVersion !== bundledVersion) stages.push(stageName(runningVersion, arch))

  return stages
}
