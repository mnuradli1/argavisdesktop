import { app } from "electron"

type Channel = "local" | "dev" | "beta" | "prod"

const raw = import.meta.env.OPENCODE_CHANNEL

export const CHANNEL: Channel = raw === "local" || raw === "dev" || raw === "beta" || raw === "prod" ? raw : "dev"

export const VERSION = app.isPackaged ? app.getVersion() : (process.env.OPENCODE_VERSION ?? app.getVersion())

const appNames: Record<string, string> = {
  dev: "Argavis Dev",
  beta: "Argavis Beta",
  prod: "Argavis",
}

// Must match electron-builder's appId per channel: it names the userData folder and the Windows AppUserModelId.
const appIDs: Record<string, string> = {
  dev: "ai.argavis.desktop.dev",
  beta: "ai.argavis.desktop.beta",
  prod: "ai.argavis.desktop",
}

// Local renderer/server mode keeps the dev application identity.
export const APP_NAME = app.isPackaged ? appNames[CHANNEL] : "Argavis Dev"

export const APP_ID = app.isPackaged ? appIDs[CHANNEL] : "ai.argavis.desktop.dev"
