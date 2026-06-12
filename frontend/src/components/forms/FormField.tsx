import type { ChangeEvent, ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface NumberFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  step?: string | number;
  placeholder?: string;
  required?: boolean;
}

export function NumberField({ id, label, value, onChange, step = 1, placeholder, required }: NumberFieldProps) {
  return (
    <div>
      <Label htmlFor={id} className="mb-1.5 text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        step={step}
        value={value}
        placeholder={placeholder}
        required={required}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      />
    </div>
  );
}

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function TextField({ id, label, value, onChange, placeholder }: TextFieldProps) {
  return (
    <div>
      <Label htmlFor={id} className="mb-1.5 text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      />
    </div>
  );
}

interface SelectFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
}

export function SelectField({ id, label, value, onChange, options }: SelectFieldProps) {
  return (
    <div>
      <Label htmlFor={id} className="mb-1.5 text-muted-foreground">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="Select…" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function FieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>;
}

export function FieldSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-4.5 first:mt-0">
      <h3 className="mb-2.5 text-[0.95rem] font-semibold uppercase tracking-[0.04em] text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}
