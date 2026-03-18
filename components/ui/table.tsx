import { cn } from "@/lib/utils";

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return <table className={cn("w-full text-sm", className)}>{children}</table>;
}
export function TableHeader({ children }: { children: React.ReactNode }) {
  return <thead>{children}</thead>;
}
export function TableBody({ children }: { children: React.ReactNode }) {
  return <tbody>{children}</tbody>;
}
export function TableRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <tr className={cn("border-b border-gray-100", className)}>{children}</tr>;
}
export function TableHead({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cn("px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide", className)}>{children}</th>;
}
export function TableCell({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3 text-sm text-gray-700", className)}>{children}</td>;
}
