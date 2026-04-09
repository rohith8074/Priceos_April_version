"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface SliderProps {
  value?: number[];
  defaultValue?: number[];
  min?: number;
  max?: number;
  step?: number;
  onValueChange?: (value: number[]) => void;
  disabled?: boolean;
  className?: string;
  orientation?: "horizontal" | "vertical";
}

const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  (
    {
      value,
      defaultValue,
      min = 0,
      max = 100,
      step = 1,
      onValueChange,
      disabled = false,
      className,
      orientation = "horizontal",
    },
    ref
  ) => {
    const [internalValue, setInternalValue] = React.useState<number>(
      (value ?? defaultValue)?.[0] ?? min
    );

    const current = value !== undefined ? value[0] : internalValue;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = Number(e.target.value);
      setInternalValue(next);
      onValueChange?.([next]);
    };

    // Percentage for fill track
    const pct = ((current - min) / (max - min)) * 100;

    if (orientation === "vertical") {
      return (
        <div
          className={cn("relative flex flex-col items-center", className)}
          style={{ height: "100%" }}
        >
          <input
            ref={ref}
            type="range"
            min={min}
            max={max}
            step={step}
            value={current}
            disabled={disabled}
            onChange={handleChange}
            className="slider-vertical"
            style={{
              writingMode: "vertical-lr" as React.CSSProperties["writingMode"],
              direction: "rtl",
              width: "4px",
              height: "100%",
              appearance: "slider-vertical" as React.CSSProperties["appearance"],
              WebkitAppearance: "slider-vertical" as React.CSSProperties["WebkitAppearance"],
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.5 : 1,
            }}
          />
        </div>
      );
    }

    return (
      <div className={cn("relative flex w-full items-center", className)}>
        {/* Track background */}
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          {/* Fill */}
          <div
            className="absolute h-full rounded-full bg-amber"
            style={{ width: `${pct}%` }}
          />
        </div>
        {/* Native input on top (transparent) */}
        <input
          ref={ref}
          type="range"
          min={min}
          max={max}
          step={step}
          value={current}
          disabled={disabled}
          onChange={handleChange}
          className={cn(
            "absolute inset-0 h-full w-full cursor-pointer opacity-0",
            disabled && "cursor-not-allowed"
          )}
        />
        {/* Thumb */}
        <div
          className={cn(
            "absolute h-4 w-4 rounded-full border-2 border-amber bg-background shadow transition-transform",
            disabled && "opacity-50"
          )}
          style={{ left: `calc(${pct}% - 8px)` }}
        />
      </div>
    );
  }
);

Slider.displayName = "Slider";

export { Slider };
