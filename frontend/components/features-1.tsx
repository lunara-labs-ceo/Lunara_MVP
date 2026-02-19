import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Database, MessageSquare, ShieldCheck } from 'lucide-react'
import { ReactNode } from 'react'

export default function Features() {
    return (
        <section className="bg-zinc-50 py-16 md:py-32 dark:bg-transparent">
            <div className="px-6 lg:px-16">
                <div className="text-center">
                    <h2 className="text-balance text-4xl font-semibold lg:text-5xl">Everything your data team needs</h2>
                    <p className="mt-4 text-muted-foreground">From raw warehouse to business insights — Lunara handles the entire analytics stack with AI.</p>
                </div>
                <div className="mx-auto mt-8 grid max-w-sm gap-6 *:text-center md:mt-16 md:max-w-none md:grid-cols-3">
                    <Card className="group shadow-zinc-950/5">
                        <CardHeader className="pb-3">
                            <CardDecorator>
                                <Database className="size-6" aria-hidden />
                            </CardDecorator>
                            <h3 className="mt-6 font-medium">Connect Once, Query Forever</h3>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm">Plug in your data warehouse. Lunara's agents scan your schema and build a semantic layer automatically — capturing relationships, metrics, and business logic.</p>
                        </CardContent>
                    </Card>

                    <Card className="group shadow-zinc-950/5">
                        <CardHeader className="pb-3">
                            <CardDecorator>
                                <MessageSquare className="size-6" aria-hidden />
                            </CardDecorator>
                            <h3 className="mt-6 font-medium">Ask in Plain English</h3>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm">No training required. Just ask "What was our revenue by region last quarter?" and get an answer with SQL, charts, tables, and exportable reports.</p>
                        </CardContent>
                    </Card>

                    <Card className="group shadow-zinc-950/5">
                        <CardHeader className="pb-3">
                            <CardDecorator>
                                <ShieldCheck className="size-6" aria-hidden />
                            </CardDecorator>
                            <h3 className="mt-6 font-medium">Human-in-the-Loop Control</h3>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm">AI proposes, you approve. Review generated queries, validate semantic definitions, and maintain full control over how your data is interpreted.</p>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </section>
    )
}

const CardDecorator = ({ children }: { children: ReactNode }) => (
    <div className="mask-radial-from-40% mask-radial-to-60% relative mx-auto size-36 duration-200 [--color-border:color-mix(in_oklab,var(--color-zinc-950)10%,transparent)] group-hover:[--color-border:color-mix(in_oklab,var(--color-zinc-950)20%,transparent)] dark:[--color-border:color-mix(in_oklab,var(--color-white)15%,transparent)] dark:group-hover:[--color-border:color-mix(in_oklab,var(--color-white)20%,transparent)]">
        <div
            aria-hidden
            className="absolute inset-0 bg-[linear-gradient(to_right,var(--color-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border)_1px,transparent_1px)] bg-[size:24px_24px] dark:opacity-50"
        />
        <div className="bg-background absolute inset-0 m-auto flex size-12 items-center justify-center border-l border-t">{children}</div>
    </div>
)
