import type { ChangeEvent, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function HelperText({ id, text }: { id: string; text?: string }) {
  if (!text) return null;
  return (
    <p id={id} className="mt-1.5 text-[0.78rem] leading-snug text-muted-foreground/80">
      {text}
    </p>
  );
}

interface NumberFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  step?: string | number;
  placeholder?: string;
  required?: boolean;
  helperText?: string;
}

export function NumberField({ id, label, value, onChange, step = 1, placeholder, required, helperText }: NumberFieldProps) {
  const helpId = `${id}-help`;
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
        aria-describedby={helperText ? helpId : undefined}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      />
      <HelperText id={helpId} text={helperText} />
    </div>
  );
}

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  helperText?: string;
}

export function TextField({ id, label, value, onChange, placeholder, helperText }: TextFieldProps) {
  const helpId = `${id}-help`;
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
        aria-describedby={helperText ? helpId : undefined}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      />
      <HelperText id={helpId} text={helperText} />
    </div>
  );
}

interface SelectFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  helperText?: string;
}

export function SelectField({ id, label, value, onChange, options, helperText }: SelectFieldProps) {
  const helpId = `${id}-help`;
  return (
    <div>
      <Label htmlFor={id} className="mb-1.5 text-muted-foreground">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full" aria-describedby={helperText ? helpId : undefined}>
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
      <HelperText id={helpId} text={helperText} />
    </div>
  );
}

export function FieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>;
}

export function FieldSection({ title, description, icon: Icon, children }: { title: string; description?: string; icon?: LucideIcon; children: ReactNode }) {
  return (
    <div className="mt-6 first:mt-0">
      <h3 className="mb-1 flex items-center gap-2 text-[0.95rem] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
        {Icon && <Icon className="h-4 w-4 text-brand" strokeWidth={2} aria-hidden="true" />}
        {title}
      </h3>
      {description && <p className="mb-2.5 text-[0.82rem] leading-snug text-muted-foreground/80">{description}</p>}
      <div className={description ? "mt-2.5" : ""}>{children}</div>
    </div>
  );
}
