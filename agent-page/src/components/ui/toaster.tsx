import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProgress,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "./toast"
import { useToast } from "../../hooks/use-toast"

const DURATION_NORMAL = 3000
const DURATION_WARNING = 5000
const DURATION_ERROR = 8000

function getDuration(variant?: string) {
  if (variant === "destructive") return DURATION_ERROR
  if (variant === "success") return DURATION_WARNING
  return DURATION_NORMAL
}

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider duration={DURATION_NORMAL}>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        const duration = getDuration(variant as string)
        return (
          <Toast key={id} variant={variant} duration={duration} {...props}>
            <div className="flex w-full items-center justify-between space-x-4 p-4 pr-8">
              <div className="grid gap-1">
                {title && <ToastTitle>{title}</ToastTitle>}
                {description && (
                  <ToastDescription>{description}</ToastDescription>
                )}
              </div>
              {action}
            </div>
            <ToastProgress duration={duration} variant={variant as string} />
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
