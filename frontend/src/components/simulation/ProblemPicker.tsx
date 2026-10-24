"use client";

import { Waves } from "lucide-react";
import { useId } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ProblemInfo } from "@/lib/types";

type ProblemPickerProps = {
  problems: ProblemInfo[];
  value: string | null;
  enabled: boolean;
  onChange: (problemId: string) => void;
};

/** Condiciones del mar en las que navega la sesión (variante de dificultad), con su explicación. */
export function ProblemPicker({ problems, value, enabled, onChange }: ProblemPickerProps) {
  const labelId = useId();
  const descriptionId = useId();
  if (problems.length === 0) return null;
  const current = problems.find((p) => p.id === value);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span id={labelId} className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Waves aria-hidden="true" className="size-4" />
        Condiciones del mar
      </span>
      <Select value={value ?? undefined} onValueChange={onChange} disabled={!enabled}>
        <SelectTrigger
          aria-labelledby={labelId}
          aria-describedby={descriptionId}
          className="h-9 min-w-48 rounded-xl bg-card"
        >
          <SelectValue placeholder="Elige el mar" />
        </SelectTrigger>
        <SelectContent>
          {problems.map((problem) => (
            <SelectItem key={problem.id} value={problem.id}>
              {problem.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p id={descriptionId} className="min-w-60 flex-1 text-xs leading-snug text-muted-foreground">
        {current?.description}
      </p>
    </div>
  );
}
