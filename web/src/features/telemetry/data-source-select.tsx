"use client"

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// Compact data-source picker for the page header. Options are provided by the
// active dashboard (temperature: Supabase; rain: access point).
export function DataSourceSelect<T extends string>({
  onValueChange,
  options,
  value,
}: {
  onValueChange: (value: T) => void
  options: Array<{ id: T; label: string; description: string }>
  value: T
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (next) onValueChange(next as T)
      }}
    >
      <SelectTrigger aria-label="Data source" className="w-36">
        <SelectValue>
          {(current: T) => options.find((option) => option.id === current)?.label}
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="end" alignItemWithTrigger={false} className="w-60">
        <SelectGroup>
          <SelectLabel>Data source</SelectLabel>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              <div className="grid">
                <span>{option.label}</span>
                <span className="text-xs text-muted-foreground">
                  {option.description}
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
