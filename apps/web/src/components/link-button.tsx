'use client'

import { Button } from '@heroui/react'
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'tertiary' | 'outline' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

export function LinkButton({ href, children, variant = 'primary', size = 'sm', className }: {
  href: string
  children: ReactNode
  variant?: Variant
  size?: Size
  className?: string
}) {
  const router = useRouter()
  return (
    <Button variant={variant} size={size} className={className} onPress={() => router.push(href)}>
      {children}
    </Button>
  )
}
