import { toast } from "sonner"

// Shows a plain toast message.
// Thin wrapper so components don't import sonner directly.
export function displayToast(message: string) {
  toast(message)
}
