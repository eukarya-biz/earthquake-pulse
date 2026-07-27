import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

interface RangeProps {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: [number, number];
  onValueChange: (value: [number, number]) => void;
  formatValue?: (value: number) => string;
}

export function Range({
  id,
  label,
  min,
  max,
  step,
  value,
  onValueChange,
  formatValue = (v) => v.toString(),
}: RangeProps) {
  return (
    <div>
      <Label htmlFor={id} className="text-xs font-medium mb-2 block text-foreground/70">
        {label}
      </Label>
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold w-9 text-center bg-muted text-foreground px-1.5 py-0.5 rounded">
          {formatValue(value[0])}
        </span>
        <Slider
          id={id}
          min={min}
          max={max}
          step={step}
          value={value}
          onValueChange={(v) => onValueChange(v as [number, number])}
          className="flex-1"
        />
        <span className="text-xs font-semibold w-9 text-center bg-muted text-foreground px-1.5 py-0.5 rounded">
          {formatValue(value[1])}
        </span>
      </div>
    </div>
  );
}
