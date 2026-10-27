import { createEffect, For, on, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { wordmarkGlyphs, wordmarkLetters } from "@opencode/ui/logo"
import { prefersReducedMotion } from "@opencode/ui/motion"

const choices = ["A", "R", "G", "V", "I", "S"] as const

export function AnimatedWordmark(props: { active: boolean }) {
  const [state, setState] = createStore({ letters: [...wordmarkLetters] })
  const timers = new Set<ReturnType<typeof setTimeout>>()

  createEffect(
    on(
      () => props.active,
      (active) => {
        timers.forEach(clearTimeout)
        timers.clear()

        if (!active || prefersReducedMotion()) {
          setState("letters", [...wordmarkLetters])

          return
        }

        const starts = wordmarkLetters.map(() => choices[Math.floor(Math.random() * choices.length)])
        const settles = wordmarkLetters.map(() => 6 + Math.floor(Math.random() * 8))
        const last = Math.max(...settles)
        setState("letters", starts)

        Array.from({ length: last }, (_, index) => index + 1).forEach((tick) => {
          const timer = setTimeout(() => {
            setState(
              "letters",
              wordmarkLetters.map((letter, index) =>
                tick >= settles[index] ? letter : choices[Math.floor(Math.random() * choices.length)],
              ),
            )
            timers.delete(timer)
          }, tick * 75)

          timers.add(timer)
        })
      },
    ),
  )

  onCleanup(() => timers.forEach(clearTimeout))

  return (
    <svg class="settings-about-wordmark" viewBox="0 0 204 42" aria-hidden="true">
      <defs>
        {choices.map((letter) => (
          <symbol id={`settings-about-letter-${letter}`} viewBox="0 0 24 42">
            <path class="settings-about-letter-shadow" d={wordmarkGlyphs[letter].shadow} />
            <path d={wordmarkGlyphs[letter].ink} />
          </symbol>
        ))}
      </defs>
      <For each={state.letters}>
        {(letter, index) => (
          <use href={`#settings-about-letter-${letter}`} x={index() * 30} width="24" height="42" />
        )}
      </For>
    </svg>
  )
}
