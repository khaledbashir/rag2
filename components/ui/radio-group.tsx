"use client";

import React from "react";

type RadioGroupProps = React.PropsWithChildren<{
  value?: string;
  onValueChange?: (v: string) => void;
  className?: string;
}>;

interface RadioGroupItemProps {
  value: string;
  children?: React.ReactNode;
  checked?: boolean;
  onChange?: (v: string) => void;
  className?: string;
}

export function RadioGroup({ value, onValueChange, children, className }: RadioGroupProps) {
  return (
    <div role="radiogroup" aria-label="Radio group" className={className}>
      {React.Children.map(children, (child) => {
        if (!React.isValidElement<RadioGroupItemProps>(child)) return null;
        return React.cloneElement(child, {
          checked: child.props.value === value,
          onChange: onValueChange,
        });
      })}
    </div>
  );
}

export function RadioGroupItem({ value, children, checked, onChange, className, ...props }: RadioGroupItemProps & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      role="radio"
      aria-checked={checked}
      onClick={() => onChange && onChange(value)}
      className={`px-3 py-1 rounded ${checked ? 'bg-blue-600 text-white' : 'bg-zinc-900 text-zinc-300'} ${className || ''}`}
      {...props}
    >
      {children}
    </button>
  );
}

export default RadioGroup;
