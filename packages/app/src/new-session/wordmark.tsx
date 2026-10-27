import { Logo } from "@opencode/ui/logo"
import "./wordmark.css"

/** The lodger curled up as the brick breaker ball. Positions are the ball's centre, relative to the new session panel. */
export type LodgerBall = {
  radius: () => number
  at: () => { x: number; y: number }
  place: (
    x: number,
    y: number,
    pose: { look: number; lookAngle: number; stretch: number; angle: number; squint: number; curl: number },
  ) => void
  blink: () => void
  /** Uncurls and hops back to its perch beside the pin board. */
  done: () => void
}

/**
 * Argavis shows the flat ARGAVIS wordmark with a single shimmer. Upstream's pull-the-pin lodger and pin board are
 * drawn from the OpenCode letterforms, so the lodger that opens them is not mounted; the props keep upstream's
 * signature so the pin board and brick breaker wiring stays mergeable.
 */
export function NewSessionWordmark(props: {
  ref: (element: HTMLDivElement) => void
  pins?: boolean
  sound?: () => boolean
  onOpen?: () => void
  onClose?: () => void
  onFlat?: () => void
  onPlay?: (ball: LodgerBall) => void
}) {
  return (
    <div
      data-component="new-session-wordmark"
      aria-hidden="true"
      class="pointer-events-none mx-auto w-full max-w-[720px] text-v2-background-bg-inverse"
    >
      <div ref={props.ref} data-slot="wordmark-reveal" class="relative mx-auto w-4/5">
        <Logo class="block aspect-[204/42] w-full opacity-[0.16]" />
        <Logo class="wordmark-shimmer absolute inset-0 aspect-[204/42] w-full" />
      </div>
    </div>
  )
}
