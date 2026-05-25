import { cn } from "@/lib/utils";

export function EmptyState({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-h-[320px] w-full items-center justify-center text-center text-sm text-slate-500", className)}>
      {children}
    </div>
  );
}
