'use client'

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="px-4 py-2 rounded-md bg-neutral-900 text-white text-sm font-semibold hover:bg-black"
    >
      Imprimir / Guardar PDF
    </button>
  )
}
