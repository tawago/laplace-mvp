import * as React from "react"

import { cn } from "@/lib/utils"

type SkeletonTone = "dark" | "light"

type SkeletonProps = React.ComponentProps<"div"> & {
  tone?: SkeletonTone
}

const toneClasses: Record<SkeletonTone, string> = {
  dark: "bg-zinc-200 dark:bg-zinc-700",
  light: "bg-slate-100 dark:bg-slate-100",
}

function Skeleton({ className, tone = "dark", ...props }: SkeletonProps) {
  return <div data-slot="skeleton" className={cn("animate-pulse rounded-md", toneClasses[tone], className)} {...props} />
}

export { Skeleton }
