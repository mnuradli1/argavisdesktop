import { Show, createMemo } from "solid-js"
import { ComposerEditor } from "./editor/editor"
import { formatKeybind, useCommand } from "@/shell/commands/command"
import { useLanguage } from "@/runtime/i18n/language"
import type { ComposerModel } from "./model"

export function Composer(props: {
  class?: string
  model: ComposerModel
  borderUnderlay?: boolean
  readOnly?: boolean
  suggestionBoundary?: () => HTMLElement | undefined
}) {
  const command = useCommand()
  const language = useLanguage()

  return (
    <div class="flex flex-col gap-3">
      <ComposerEditor
        controller={props.model}
        borderUnderlay={props.borderUnderlay}
        readOnly={props.readOnly}
        class={props.class}
        modelControlsVisible={!props.model.model.loading}
        attachKeybind={command.keybindParts("file.attach")}
        attachShortcut={command.keybind("file.attach")}
        alternateKeybind={[formatKeybind("mod", language.t), "↵"]}
        exitShellKeybind={[formatKeybind("esc", language.t)]}
        suggestionBoundary={props.suggestionBoundary}
        modelControl={
          <ComposerModelLabel
            loading={props.model.model.loading}
            modelName={props.model.model.selection.current()?.name ?? language.t("dialog.model.select.title")}
          />
        }
      />
    </div>
  )
}

// Argavis ships a single built-in model, so the model control is a fixed label rather than a picker.
function ComposerModelLabel(props: { loading: boolean; modelName: string }) {
  const shouldAnimate = createMemo<boolean>((previous) => previous ?? props.loading)

  return (
    <Show when={!props.loading}>
      <span
        data-action="composer-model"
        class="flex h-7 min-w-0 max-w-[220px] items-center px-2 text-13-regular text-v2-text-text-muted"
        classList={{ "animate-in fade-in": shouldAnimate() }}
      >
        <span class="truncate leading-4">{props.modelName}</span>
      </span>
    </Show>
  )
}
