import { Tooltip } from "@opencode/ui/tooltip"
import { Icon } from "@opencode/ui/icon"
import { Slash } from "@opencode/ui/slash"
import { Show, createSignal, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { createResizeObserver } from "@solid-primitives/resize-observer"
import { getFilename } from "@opencode/util/path"
import {
  displayName,
  getProjectAvatarGenerated,
  getProjectAvatarSource,
  getProjectAvatarVariant,
  ProjectAvatar,
} from "@opencode/ui/project-avatar"
import { Schema } from "effect"
import { Composer } from "@/composer/composer"
import { ComposerDropzone } from "@/composer/dropzone"
import type { ComposerModel } from "@/composer/model"
import {
  PromptProjectAddButton,
  type PromptProject,
  type PromptProjectController,
} from "@/new-session/project/selector"
import type { useNewSessionLocationDialog } from "@/new-session/location/dialog"
import { useLanguage } from "@/runtime/i18n/language"
import { NEW_SESSION_CONTENT_WIDTH } from "@/new-session/layout"
import { Persist, persisted } from "@/runtime/persistence/storage"
import { Persistence } from "@/runtime/persistence/schema"
import { useSettings } from "@/settings/model"
import type { NewSessionWorkspaceController } from "./workspace/controller"
import { NewSessionBranch } from "./workspace/selector"
import { NewSessionBrickBreaker } from "./brick-breaker"
import { NewSessionPinBoard, type PinBoardHandle } from "./pin-board"
import { NewSessionWordmark, type LodgerBall } from "./wordmark"

export const WorkspaceOnboardingSchema = Persistence.struct({
  used: Schema.Boolean,
})

// Argavis ships a built-in model, so the connect-a-provider tip is gone; the schema stays for persisted data.
export const ProviderTipSchema = Persistence.struct({
  dismissedAt: Schema.Finite,
})

type WordmarkState = {
  box?: HTMLDivElement
  mode: "flat" | "open" | "closing"
  game: boolean
}

type BrickBreakerHandles = {
  board?: PinBoardHandle
  ball?: LodgerBall
}

export function NewSessionView(props: {
  composer: ComposerModel
  project: PromptProjectController
  workspace: NewSessionWorkspaceController
  location: ReturnType<typeof useNewSessionLocationDialog>
}) {
  const [onboarding, setOnboarding, , onboardingReady] = persisted(
    Persist.global("workspace-onboarding"),
    WorkspaceOnboardingSchema,
    { used: false },
  )

  const settings = useSettings()

  const [wordmark, setWordmark] = createStore<WordmarkState>({ mode: "flat", game: false })

  // Imperative handles for the brick breaker; they are not reactive state.
  const handles: BrickBreakerHandles = {}
  let panel!: HTMLDivElement

  return (
    <div class="@container relative flex flex-col min-h-0 h-full flex-1">
      <div
        ref={panel}
        data-component="new-session"
        class="relative isolate flex-1 min-h-0 overflow-hidden rounded-[10px] bg-v2-background-bg-base shadow-[var(--v2-elevation-raised)]"
      >
        <ComposerDropzone
          active={props.composer.state.drag === "active"}
          input={props.composer.model.selection.current()?.capabilities.input}
        />
        <div class="absolute inset-x-0 top-[25.375%] flex justify-center px-6">
          <div class={NEW_SESSION_CONTENT_WIDTH}>
            <NewSessionWordmark
              ref={(box) => setWordmark("box", box)}
              sound={settings.sounds.interfaceEnabled}
              onOpen={() => setWordmark("mode", "open")}
              onClose={() => setWordmark("mode", "closing")}
              onFlat={() => setWordmark("mode", "flat")}
              onPlay={(ball) => {
                handles.ball = ball
                setWordmark("game", true)
              }}
            />
            <div class="mt-8 flex flex-col gap-3">
              <div data-slot="new-session-composer" class="flex flex-col gap-1">
                <div class="relative z-10">
                  <Composer model={props.composer} />
                </div>
                <Show when={props.project.selected()}>
                  {(project) => (
                    <NewSessionLocation
                      project={project()}
                      workspace={props.workspace.bar.visible() ? props.workspace.selection.value() : "main"}
                      root={props.workspace.project.root()}
                      branch={<NewSessionBranch workspace={props.workspace} onDone={props.composer.restoreFocus} />}
                      onboarding={onboardingReady() && !onboarding.used && props.workspace.bar.visible()}
                      onClick={() =>
                        props.location({
                          onWorkspace: (value) => {
                            if (value !== "main") setOnboarding("used", true)
                          },
                        })
                      }
                    />
                  )}
                </Show>
              </div>
              <Show when={props.project.empty()}>
                <PromptProjectAddButton controller={props.project} />
              </Show>
            </div>
          </div>
        </div>
        <Show when={wordmark.mode !== "flat" && wordmark.box}>
          {(logo) => (
            <NewSessionPinBoard
              logo={logo()}
              sound={settings.sounds.interfaceEnabled}
              entrance="chain"
              closing={wordmark.mode === "closing"}
              ref={(board) => (handles.board = board)}
            />
          )}
        </Show>
        <Show when={wordmark.game && handles.board && handles.ball && { board: handles.board, ball: handles.ball }}>
          {(game) => (
            <NewSessionBrickBreaker
              panel={panel}
              board={game().board}
              ball={game().ball}
              sound={settings.sounds.interfaceEnabled}
              onDone={() => {
                setWordmark("game", false)
                props.composer.restoreFocus()
              }}
            />
          )}
        </Show>
      </div>
    </div>
  )
}

/** The composer tray: combined location picker, Git context, and the session's directory. */
function NewSessionLocation(props: {
  project: PromptProject
  /** "main", "create", or a worktree directory. */
  workspace: string
  root: string
  branch?: JSX.Element
  onboarding: boolean
  onClick: () => void
}) {
  const language = useLanguage()
  const [truncated, setTruncated] = createSignal(false)

  const worktree = () => {
    if (props.workspace === "main") return

    if (props.workspace === "create") return language.t("workspace.new")

    return getFilename(props.workspace)
  }

  const path = () => {
    if (props.workspace === "create") return

    return props.workspace === "main" ? props.root : props.workspace
  }

  return (
    <div class="relative flex min-h-9 min-w-0 items-center gap-3 ps-2 pe-1.5 text-[13px] font-[440] leading-[var(--line-height-compact)] tracking-[-0.04px]">
      <div class="flex min-w-0 max-w-full flex-wrap items-center gap-1 py-1.5">
        <Tooltip
          appearance={props.onboarding ? "large" : undefined}
          placement="top"
          openDelay={800}
          value={
            props.onboarding ? (
              <div class="flex flex-col gap-1 text-start">
                <div class="flex items-center gap-1.5 font-[530] text-v2-text-text-base">
                  <Icon name="outline-worktree" size="small" class="shrink-0 text-v2-text-text-accent" />
                  <span>{language.t("workspace.onboarding.title")}</span>
                </div>
                <span class="font-[440] text-v2-text-text-muted">{language.t("workspace.onboarding.description")}</span>
              </div>
            ) : (
              language.t("session.new.workspace.trigger.tooltip")
            )
          }
          contentClass={props.onboarding ? "max-w-[280px]" : undefined}
          class="flex min-w-0 max-w-full"
        >
          <button
            type="button"
            data-action="prompt-project"
            aria-haspopup="dialog"
            aria-description={language.t("session.new.workspace.trigger.tooltip")}
            class="flex h-7 min-w-0 max-w-full items-center gap-1.5 rounded-sm text-start ps-1.5 pe-2 text-v2-text-text-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base focus-visible:bg-v2-overlay-simple-overlay-hover focus-visible:text-v2-text-text-base focus-visible:outline-none"
            onClick={props.onClick}
          >
            <ProjectAvatar
              class="shrink-0"
              fallback={displayName(props.project)}
              src={getProjectAvatarSource(props.project.id, props.project.icon)}
              variant={getProjectAvatarVariant(props.project.icon?.color)}
              generated={getProjectAvatarGenerated(props.project)}
            />
            <span class="min-w-0 truncate">{displayName(props.project)}</span>
            <Show when={worktree()}>
              {(name) => (
                <>
                  <Slash gap={0} />
                  <span class="sr-only">{" / "}</span>
                  <span class="min-w-12 shrink-[1000] truncate">{name()}</span>
                </>
              )}
            </Show>
            <Show when={props.onboarding}>
              <span
                data-slot="workspace-onboarding-dot"
                aria-hidden="true"
                class="size-1.5 shrink-0 rounded-full bg-v2-text-text-accent"
              />
            </Show>
          </button>
        </Tooltip>
        {props.branch}
      </div>
      <Show when={path()}>
        {(directory) => (
          <div class="flex min-w-0 flex-1 justify-end pe-1.5 @max-[560px]:hidden">
            <Tooltip
              placement="top"
              value={directory()}
              disabled={!truncated()}
              class="flex min-w-0"
              contentClass="max-w-[calc(100vw-32px)] break-all"
            >
              <span
                ref={(element) =>
                  createResizeObserver(element, () => setTruncated(element.scrollWidth > element.clientWidth))
                }
                data-slot="new-session-location-path"
                class="block min-w-0 truncate text-v2-text-text-faint [direction:rtl] [text-align:end]"
              >
                <bdi dir="ltr">{directory()}</bdi>
              </span>
            </Tooltip>
          </div>
        )}
      </Show>
    </div>
  )
}
