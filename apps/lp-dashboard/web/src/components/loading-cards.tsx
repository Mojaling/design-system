import { Card, CardContent, CardHeader } from "@workspace/ui/components/card"
import { Skeleton } from "@workspace/ui/components/skeleton"

export function LoadingCards({ count = 2 }: { count?: number }) {
  return Array.from({ length: count }, (_, i) => (
    <Card key={i} aria-hidden>
      <CardHeader>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-5 w-56" />
        </div>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-2 w-full rounded-full" />
        <Skeleton className="h-16 w-full" />
      </CardContent>
    </Card>
  ))
}
