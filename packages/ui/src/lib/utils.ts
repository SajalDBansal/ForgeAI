import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

// Merges class names and resolves conflicting Tailwind classes.
// Used by every component to combine base and caller classes.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
