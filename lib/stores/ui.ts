import { create } from 'zustand'

interface UIState {
  mobileNavOpen: boolean
  setMobileNav: (open: boolean) => void
  paletteOpen: boolean
  setPalette: (open: boolean) => void
}

export const useUI = create<UIState>((set) => ({
  mobileNavOpen: false,
  setMobileNav: (open) => set({ mobileNavOpen: open }),
  paletteOpen: false,
  setPalette: (open) => set({ paletteOpen: open }),
}))
