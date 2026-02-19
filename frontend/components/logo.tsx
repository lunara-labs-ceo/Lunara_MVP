import Image from 'next/image'
import { cn } from '@/lib/utils'

export const Logo = ({ className }: { className?: string }) => {
    return (
        <Image
            src="/lunara_logo.svg"
            alt="Lunara"
            width={120}
            height={32}
            className={cn('h-7 w-auto', className)}
        />
    )
}

export const LogoIcon = ({ className }: { className?: string }) => {
    return (
        <Image
            src="/lunara_logo.svg"
            alt="Lunara"
            width={32}
            height={32}
            className={cn('h-7 w-auto', className)}
        />
    )
}

export const LogoStroke = ({ className }: { className?: string }) => {
    return (
        <Image
            src="/lunara_logo.svg"
            alt="Lunara"
            width={120}
            height={32}
            className={cn('h-7 w-auto', className)}
        />
    )
}
