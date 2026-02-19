import React from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { HeroHeader } from './header'
import { ChevronRight } from 'lucide-react'

const dataSources = [
    { name: 'BigQuery', color: '#4285F4' },
    { name: 'Snowflake', color: '#29B5E8' },
    { name: 'Redshift', color: '#FF9900' },
    { name: 'dbt', color: '#FF694A' },
    { name: 'Databricks', color: '#FF3621' },
    { name: 'Looker', color: '#34A853' },
    { name: 'Tableau', color: '#E97627' },
    { name: 'Power BI', color: '#F2C811' },
    { name: 'Metabase', color: '#509EE3' },
]

export default function HeroSection() {
    return (
        <>
            <HeroHeader />
            <main className="overflow-hidden">
                <section className="bg-background">
                    <div className="relative py-32 md:pt-44">
                        {/* Subtle gradient background */}
                        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(74,222,128,0.08),transparent)]" />

                        <div className="relative z-10 mx-auto w-full max-w-5xl px-6">
                            <div className="mx-auto max-w-2xl text-center">
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400">
                                    Agentic BI for modern data teams
                                </span>
                                <h1 className="mt-6 text-balance font-serif text-4xl font-medium sm:text-5xl lg:text-6xl">
                                    AI Agents That Actually Understand Your Data.
                                </h1>
                                <p className="text-muted-foreground mt-4 text-balance text-lg">
                                    Lunara builds a semantic layer on top of your warehouse, so anyone can explore data, generate reports, and get answers — all within minutes.
                                </p>

                                <div className="mt-8 flex flex-wrap justify-center gap-3">
                                    <Button
                                        asChild
                                        className="pr-1.5">
                                        <a href="/login.html">
                                            <span className="text-nowrap">Get Early Access</span>
                                            <ChevronRight className="opacity-50" />
                                        </a>
                                    </Button>
                                    <Button
                                        variant="outline"
                                        asChild>
                                        <a href="/login.html">Book a Demo</a>
                                    </Button>
                                </div>
                            </div>

                            {/* Data source grid */}
                            <div className="mx-auto mt-24 max-w-xl">
                                <p className="mb-6 text-center text-xs font-medium tracking-widest text-muted-foreground uppercase">
                                    Connects to your warehouse
                                </p>
                                <div className="grid scale-95 grid-cols-3 gap-6">
                                    {dataSources.map((ds, i) => (
                                        <div
                                            key={ds.name}
                                            className={
                                                i % 3 === 0 ? 'ml-auto' :
                                                i % 3 === 2 ? 'mr-auto' : 'mx-auto'
                                            }
                                            style={{ opacity: [1, 3, 5, 7].includes(i) ? 1 : 0.45 }}>
                                            <Card className="shadow-foreground/10 flex h-8 w-fit items-center gap-2 rounded-xl px-3 sm:h-10 sm:px-4">
                                                <span
                                                    className="size-2.5 shrink-0 rounded-full"
                                                    style={{ background: ds.color }}
                                                />
                                                <span className="text-nowrap font-medium max-sm:text-xs">{ds.name}</span>
                                            </Card>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </main>
        </>
    )
}
