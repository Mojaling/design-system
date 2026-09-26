import { Button } from "@workspace/ui/components/button"
import { Check, Copy } from "lucide-react"
import { useEffect, useState } from "react"

/** 텍스트를 클립보드에 복사하고 잠깐 "복사됨"을 보여준다. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1_500)
    return () => clearTimeout(timer)
  }, [copied])

  return (
    <Button
      variant="outline"
      size="sm"
      title={value}
      onClick={() => navigator.clipboard.writeText(value).then(() => setCopied(true))}
    >
      {copied ? <Check /> : <Copy />}
      {copied ? "복사됨" : label}
    </Button>
  )
}
