import { showToast } from "@opencode/ui/toast"
import { lazy, onCleanup, Suspense } from "solid-js"
import { Command, SettingsPage, TitlebarItem, type SetupContext, type Plugin } from "@opencode/plugin/gui"
import { onIdle } from "@opencode/plugin/gui/builtin"
import { Updater } from "@opencode/plugin/gui/updater"
import { updaterAction } from "./action"
import type definition from "./index"

const setup: Plugin.Setup<typeof definition> = (ctx) => {
  whatsNew(ctx)
  betaNotes(ctx)

  if (!ctx.desktop) return
  const updater = ctx.main(Updater)
  // Undefined until main's updater is up and has sent its state, and again while it is gone.
  const state = () => updater.state()

  const act = (name: "check" | "install") => {
    if (state()) return void import("./actions").then((module) => module[name](ctx, updater))

    // Not loaded yet, or not active (failed, or not on this platform): nothing can check or install.
    showToast({ title: ctx.t("common.requestFailed") })
  }

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
      title: ctx.t(updaterAction(current).label),
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
          state={state}
          run={() => {
            const run = updaterAction(state()).run

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
    icon: "flask",
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
  const version = ctx.app.version
  const seen = ctx.stores.seen

  if (!version || seen.value.version === version) return

  const commit = import.meta.env.OPENCODE_COMMIT

  seen.update((draft) => {
    draft.version = version

    // Remember the build's commit too, as upstream does, so the stored state stays compatible.
    if (commit) draft.commit = commit
  })
}

export default setup
