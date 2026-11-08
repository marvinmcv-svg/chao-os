'use client'

import { useEffect, useRef } from 'react'

/**
 * One stack for every dismissable overlay (drawers and modals) so Escape
 * closes only the topmost one — e.g. a change-order modal opened from the
 * project drawer must not take the drawer down with it.
 */
const stack: symbol[] = []

export function useEscapeToClose(open: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const id = Symbol('overlay')
    stack.push(id)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && stack[stack.length - 1] === id) onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      const i = stack.indexOf(id)
      if (i !== -1) stack.splice(i, 1)
    }
  }, [open])
}
