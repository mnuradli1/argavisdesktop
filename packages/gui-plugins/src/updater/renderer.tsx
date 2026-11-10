import { showToast } from "@opencode/ui/toast"
import { createSignal, lazy, onCleanup, Suspense, untrack } from "solid-js"
import { Command, SettingsPage, TitlebarItem, type SetupContext, type Plugin } from "@opencode/plugin/gui"
import { onIdle } from "@opencode/plugin/gui/builtin"
import { Updater } from "@opencode/plugin/gui/updater"
import { updaterAction } from "./action"
import {
  ACTION_CHUNK_TIMEOUT_MS,
  initialWindowUpdater,
  transitionWindowUpdater,
  type WindowUpdaterEffect,
  type WindowUpdaterEvent,
} from "./window-machine"
import { webUpdates } from "./web"
import { initWhatsNew } from "./whats-new-machine"
import type definition from "./index"

const setup: Plugin.Setup<typeof definition> = (ctx) => {
  whatsNew(ctx)
  betaNotes(ctx)

  if (!ctx.desktop) return webUpdates(ctx)
  const updater = ctx.main(Updater)
  // Undefined until main's updater is up and has sent its state, and again while it is gone.
  const state = () => updater.state()
  const [windowState, setWindowState] = createSignal(initialWindowUpdater)

  const dispatchWindow = (event: WindowUpdaterEvent) => {
    const next = transitionWindowUpdater(untrack(windowState), event)

    if (next.state !== untrack(windowState)) setWindowState(next.state)
    next.effects.forEach(runWindow)
  }

  const runWindow = (effect: WindowUpdaterEffect) => {
    if (effect.type === "toast-failed")
      return void showToast({ title: ctx.t("common.requestFailed"), description: effect.message })
    const attempt = effect.attempt
    const chunk = Promise.withResolvers<never>()
    const timer = setTimeout(() => chunk.reject(new Error()), ACTION_CHUNK_TIMEOUT_MS)

    void Promise.race([import("./actions"), chunk.promise])
      .finally(() => clearTimeout(timer))
      .then(
        (module) => {
          if (ctx.signal.aborted) return

          return Promise.try(() => module[effect.action](ctx, updater)).finally(() =>
            dispatchWindow({ type: "action.settled", attempt }),
          )
        },
        (cause: unknown) =>
          dispatchWindow({
            type: "action.failed",
            attempt,
            message: cause instanceof Error && cause.message ? cause.message : undefined,
          }),
      )
  }

  onCleanup(() => dispatchWindow({ type: "disposed" }))

  // Main missing (not loaded yet, failed, or not on this platform) answers that nothing can check or install.
  const act = (name: "check" | "install") =>
    dispatchWindow({ type: "action.requested", action: name, available: state() !== undefined })

  const Section = lazy(() => import("./section"))
  // Settings rows are small; load them while idle so settings opens without a blank row.
  onCleanup(onIdle(() => void Section.preload()))

  ctx.add(TitlebarItem, () => {
    const current = state()
    const installing = current?.status === "installing"
    const ready = current?.status === "ready" || current?.status === "download-required"

    if (!ready && !installing) return

    return {
      id: "update",
      label: ctx.t("status.label"),
      title: ctx.t(updaterAction(current, windowState()).label),
      busy: installing,
      run: () => act("install"),
    }
  })

  ctx.add(SettingsPage, {
    id: "updates",
    page: "general",
    get title() {
      return ctx.t("section.title")
    },
    get entries() {
      return [
        { id: "settings-release-notes", title: ctx.t("releaseNotes.title") },
        { id: "settings-check-updates", title: ctx.t("check.title") },
      ]
    },
    render: () => (
      <Suspense>
        <Section
          action={() => updaterAction(state(), windowState())}
          run={() => {
            const run = updaterAction(state(), windowState()).run

            if (run) act(run)
          }}
        />
      </Suspense>
    ),
  })

  ctx.add(Command, (): Command => ({ id: "check", title: ctx.t("menu.check"), hidden: true, run: () => act("check") }))

  // Beta builds answer the app menu's Check for Updates in the focused window instead of a native dialog. The
  // listener follows main's updater across restarts.
  updater.on("check", () => act("check"))
}

/**
 * What's new in beta as a settings page, to come back to after its dialog closes. Only builds that embed the notes
 * have it: beta builds and the desktop dev server.
 */
function betaNotes(ctx: SetupContext<typeof definition>) {
  if (!import.meta.env.OPENCODE_BETA_NOTES) return

  const Page = lazy(() => import("./beta-page"))

  ctx.add(SettingsPage, {
    id: "whats-new",
    icon: "outline-list-changelog",
    group: "about",
    get title() {
      return ctx.t("beta.title")
    },
    get entries() {
      return [{ id: "whats-new", title: ctx.t("beta.title"), keywords: "changelog release notes beta" }]
    },
    render: () => (
      <Suspense>
        <Page />
      </Suspense>
    ),
  })
}

/**
 * What's New after an update. Argavis has no release-notes feed of its own: the upstream changelog and beta commit
 * notes describe OpenCode releases, so an update only remembers the version (and commit) it reached.
 */
function whatsNew(ctx: SetupContext<typeof definition>) {
  const seen = ctx.stores.seen

  // Starting with release notes off is the machine's remember-only path, so it never asks for the OpenCode changelog
  // or the beta dialog. Only that effect is run here: a load could not start even if the machine asked for one.
  const start = initWhatsNew({
    version: ctx.app.version,
    commit: import.meta.env.OPENCODE_COMMIT,
    channel: ctx.app.channel === "beta" ? "beta" : "stable",
    previousVersion: seen.value.version,
    previousCommit: seen.value.commit,
    enabled: false,
  })

  start.effects.forEach((effect) => {
    if (effect.type !== "mark-seen") return

    seen.update((draft) => {
      draft.version = effect.version

      // Remember the build's commit too, as upstream does, so the stored state stays compatible.
      if (effect.commit) draft.commit = effect.commit
    })
  })
}

export default setup
