import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type Shortcut = { keys: string[]; action: string };

const PLAYBACK_SHORTCUTS: Shortcut[] = [
  { keys: ["Espacio"], action: "Navegar / pausar" },
  { keys: ["→"], action: "Avanzar un paso" },
  { keys: ["R"], action: "Nuevo escenario" },
  { keys: ["Mayús", "R"], action: "Repetir la travesía en el mismo escenario" },
];

export const NAVIGATION_SHORTCUTS: Shortcut[] = [
  ...PLAYBACK_SHORTCUTS,
  { keys: ["["], action: "Checkpoint anterior" },
  { keys: ["]"], action: "Checkpoint siguiente" },
  { keys: ["1", "2", "3"], action: "Herramienta: mover, añadir, borrar" },
  { keys: ["S"], action: "Mostrar u ocultar los rayos del sensor" },
  { keys: ["C"], action: "Ir a la comparativa" },
  { keys: ["?"], action: "Mostrar esta ayuda" },
];

export const COMPARE_SHORTCUTS: Shortcut[] = [
  ...PLAYBACK_SHORTCUTS,
  { keys: ["S"], action: "Rayos del sensor: barco A, barco B o ninguno" },
  { keys: ["T"], action: "Lanzar un torneo rápido" },
  { keys: ["N"], action: "Ir a la navegación" },
  { keys: ["?"], action: "Mostrar esta ayuda" },
];

type ShortcutsDialogProps = { open: boolean; onOpenChange: (open: boolean) => void; shortcuts: Shortcut[] };

export function ShortcutsDialog({ open, onOpenChange, shortcuts }: ShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[1.25rem]">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">Atajos de teclado</DialogTitle>
          <DialogDescription>Funcionan cuando el foco no está en un control.</DialogDescription>
        </DialogHeader>
        <dl className="flex flex-col gap-2">
          {shortcuts.map(({ keys, action }) => (
            <div key={action} className="flex items-center justify-between gap-4 text-sm">
              <dt>{action}</dt>
              <dd className="flex gap-1">
                {keys.map((key) => (
                  <kbd key={key} className="rounded-lg border border-input bg-secondary px-2 py-0.5 font-mono text-xs">
                    {key}
                  </kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
