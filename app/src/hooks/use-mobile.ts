"use client"

import * as React from "react"

const MOBILE_BREAKPOINT = 768

// useSyncExternalStore (patrón recomendado por React para sistemas externos
// como matchMedia): sin setState dentro del efecto y sin cascada de renders.
function subscribe(callback: () => void) {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  mql.addEventListener("change", callback)
  return () => mql.removeEventListener("change", callback)
}

export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.innerWidth < MOBILE_BREAKPOINT,
    () => false
  )
}
