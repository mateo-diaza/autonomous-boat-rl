import type { ReactNode } from "react";

import { RunList } from "@/components/runs/RunList";

export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-4 p-4 lg:p-6">
      <header className="flex flex-wrap items-end justify-between gap-2 border-b border-foreground pb-3">
        <div>
          <h1 className="text-3xl italic lg:text-4xl">Bitácora del barco autónomo</h1>
          <p className="text-sm text-muted-foreground">
            Un agente que aprende a navegar entre rocas mediante aprendizaje por refuerzo
          </p>
        </div>
      </header>

      <main className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <section aria-label="Carta de navegación" className="cartouche flex aspect-square items-center justify-center p-4 lg:aspect-auto">
          <p className="text-muted-foreground">La carta de navegación llegará en la fase 4.</p>
        </section>

        <aside className="flex flex-col gap-4" aria-label="Paneles de información">
          <Panel title="Travesías registradas">
            <RunList />
          </Panel>
          <Panel title="Cerebro del agente">
            <p className="text-sm text-muted-foreground">Próximamente.</p>
          </Panel>
          <Panel title="Aprendizaje">
            <p className="text-sm text-muted-foreground">Próximamente.</p>
          </Panel>
        </aside>
      </main>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="cartouche p-4">
      <h2 className="cartouche-title mb-3">{title}</h2>
      {children}
    </section>
  );
}
