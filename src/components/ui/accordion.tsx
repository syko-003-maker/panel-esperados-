"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface AccordionItemProps {
  value: string;
  children: React.ReactNode;
}

interface AccordionTriggerProps {
  children: React.ReactNode;
  className?: string;
}

interface AccordionContentProps {
  children: React.ReactNode;
  className?: string;
}

interface AccordionContextType {
  value: string | null;
  onValueChange: (value: string) => void;
}

const AccordionContext = React.createContext<AccordionContextType | null>(null);

export function Accordion({ 
  children, 
  type = "single",
  collapsible = false,
  defaultValue,
  className 
}: { 
  children: React.ReactNode;
  type?: "single" | "multiple";
  collapsible?: boolean;
  defaultValue?: string;
  className?: string;
}) {
  const [value, setValue] = React.useState<string | null>(defaultValue || null);

  const onValueChange = (newValue: string) => {
    setValue((prev) => {
      if (prev === newValue && collapsible) return null;
      return newValue;
    });
  };

  return (
    <AccordionContext.Provider value={{ value, onValueChange }}>
      <div className={cn("space-y-2", className)}>{children}</div>
    </AccordionContext.Provider>
  );
}

export function AccordionItem({ value, children }: AccordionItemProps) {
  const context = React.useContext(AccordionContext);
  if (!context) throw new Error("AccordionItem must be used within Accordion");

  const isOpen = context.value === value;

  return (
    <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-900/20">
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child as any, { value, isOpen, onToggle: () => context.onValueChange(value) });
        }
        return child;
      })}
    </div>
  );
}

export function AccordionTrigger({ children, className, ...props }: AccordionTriggerProps & { value?: string; isOpen?: boolean; onToggle?: () => void }) {
  const { isOpen, onToggle } = props as any;
  
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "flex w-full items-center justify-between px-4 py-3 text-left font-medium transition-all hover:bg-slate-800/30",
        className
      )}
    >
      {children}
      <ChevronDown
        className={cn(
          "h-4 w-4 shrink-0 transition-transform duration-200",
          isOpen && "rotate-180"
        )}
      />
    </button>
  );
}

export function AccordionContent({ children, className, ...props }: AccordionContentProps & { isOpen?: boolean }) {
  const { isOpen } = props as any;
  
  if (!isOpen) return null;

  return (
    <div className={cn("px-4 pb-4 pt-0", className)}>
      {children}
    </div>
  );
}
