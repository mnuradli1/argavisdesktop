import { createUniqueId, type ComponentProps } from "solid-js"

// ARGAVIS letterforms on a 6-unit grid. Each glyph is 24 wide, spans y 6–36, and letters advance by 30.
// `shadow` fills the open counters below the top two rows, matching the depth cue of the original wordmark.
export const wordmarkGlyphs = {
  A: { ink: "M0 6H24V36H18V24H6V36H0ZM6 12V18H18V12Z", shadow: "M6 24H18V36H6Z" },
  R: { ink: "M0 6H24V24H18V36H12V24H6V36H0ZM6 12V18H18V12Z", shadow: "M6 24H12V36H6ZM18 24H24V36H18Z" },
  G: { ink: "M0 6H24V12H6V30H18V24H12V18H24V36H0Z", shadow: "M6 18H12V24H18V30H6Z" },
  V: { ink: "M0 6H6V24H9V30H15V24H18V6H24V24H21V30H18V36H6V30H3V24H0Z", shadow: "M6 18H18V24H15V30H9V24H6Z" },
  I: { ink: "M0 6H24V12H15V30H24V36H0V30H9V12H0Z", shadow: "M0 18H9V30H0ZM15 18H24V30H15Z" },
  S: { ink: "M0 6H24V12H6V18H24V36H0V30H18V24H0Z", shadow: "M0 24H18V30H0Z" },
}

export const wordmarkLetters = ["A", "R", "G", "A", "V", "I", "S"] as const

export const Mark = (props: { class?: string }) => {
  return <Emblem component="logo-mark" class={props.class} />
}

export const Splash = (props: Pick<ComponentProps<"svg">, "ref" | "class">) => {
  return <Emblem component="logo-splash" ref={props.ref} class={props.class} />
}

export const Logo = (props: { class?: string }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 204 42"
      fill="none"
      classList={{ [props.class ?? ""]: !!props.class }}
    >
      <g>
        {wordmarkLetters.map((letter, index) => (
          <g transform={`translate(${index * 30} 0)`}>
            <path d={wordmarkGlyphs[letter].shadow} fill="var(--icon-weak-base)" />
            <path d={wordmarkGlyphs[letter].ink} fill="var(--icon-strong-base)" />
          </g>
        ))}
      </g>
    </svg>
  )
}

// The Argavis shield emblem, cropped to the stroked shield. Gradient ids are per instance because
// duplicate ids on one page make every copy resolve the first definition.
function Emblem(props: Pick<ComponentProps<"svg">, "ref" | "class"> & { component: string }) {
  const signal = createUniqueId()

  return (
    <svg
      ref={props.ref}
      data-component={props.component}
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="7 3 50 59"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={signal} x1="14" y1="10" x2="52" y2="57" gradientUnits="userSpaceOnUse">
          <stop stop-color="#A5F3FC" />
          <stop offset=".48" stop-color="#22D3EE" />
          <stop offset="1" stop-color="#8B5CF6" />
        </linearGradient>
      </defs>
      <path
        d="M32 5 55 14v19c0 12-9 20-23 27C18 53 9 45 9 33V14L32 5Z"
        fill="#081323"
        stroke={`url(#${signal})`}
        stroke-width="2.5"
      />
      <path d="m17 43 15-27 15 27h-7l-8-15-8 15h-7Z" fill={`url(#${signal})`} />
      <path d="m21 37 11-6 11 6-11 6-11-6Z" fill="#081323" stroke="#A5F3FC" stroke-width="2" />
      <path d="m32 34 3 3-3 3-3-3 3-3Z" fill="#67E8F9" />
    </svg>
  )
}
