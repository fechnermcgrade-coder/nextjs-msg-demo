import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "warning";
  size?: "sm" | "md" | "icon";
};

export function Button({ className, variant = "primary", size = "md", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "border-transparent bg-primary px-4 py-2 text-white hover:brightness-95",
        variant === "secondary" && "border-border bg-white px-4 py-2 hover:bg-muted",
        variant === "ghost" && "border-transparent bg-transparent px-3 py-2 hover:bg-muted",
        variant === "danger" && "border-transparent bg-red-600 px-4 py-2 text-white hover:bg-red-700",
        variant === "warning" && "border-transparent bg-amber-500 px-4 py-2 text-white hover:bg-amber-600",
        size === "sm" && "min-h-8 text-sm",
        size === "md" && "min-h-10 text-sm",
        size === "icon" && "h-10 w-10 p-0",
        className
      )}
      {...props}
    />
  );
}
