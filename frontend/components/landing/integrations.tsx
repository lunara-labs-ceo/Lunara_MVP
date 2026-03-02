"use client"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import Image from "next/image"
import { BigQueryIcon } from "@/components/ui/svgs/bigquery"
import { Supabase as SupabaseIcon } from "@/components/ui/svgs/supabase"

export function Integrations() {
  return (
    <section>
      <div className="py-24 md:py-32">
        <div className="mx-auto max-w-5xl px-6">
          <div className="aspect-16/10 group relative mx-auto flex max-w-[32rem] items-center justify-between sm:max-w-xl">
            {/* Hover spin rings */}
            <div
              role="presentation"
              className="bg-linear-to-b border-foreground/5 absolute inset-0 z-10 aspect-square animate-spin items-center justify-center rounded-full border-t from-primary/15 to-transparent to-25% opacity-0 duration-[3.5s] group-hover:opacity-100"
            />
            <div
              role="presentation"
              className="bg-linear-to-b border-foreground/5 absolute inset-24 z-10 aspect-square scale-90 animate-spin items-center justify-center rounded-full border-t from-primary/15 to-transparent to-25% opacity-0 duration-[3.5s] group-hover:opacity-100"
            />

            {/* Outer orbit — 3 logos */}
            <div className="bg-linear-to-b from-muted-foreground/15 absolute inset-0 flex aspect-square items-center justify-center rounded-full border-t to-transparent to-25%">
              <IntegrationCard className="-translate-x-1/6 absolute left-0 top-1/4 -translate-y-1/4">
                <Image src="/snowflake-icon.svg" alt="Snowflake" width={32} height={32} className="size-8" />
              </IntegrationCard>
              <IntegrationCard className="absolute top-0 -translate-y-1/2">
                <BigQueryIcon className="size-8" />
              </IntegrationCard>
              <IntegrationCard className="translate-x-1/6 absolute right-0 top-1/4 -translate-y-1/4">
                <Image src="/Redshift.svg" alt="Amazon Redshift" width={32} height={32} className="size-8" />
              </IntegrationCard>
            </div>

            {/* Inner orbit — 3 logos */}
            <div className="bg-linear-to-b from-muted-foreground/15 absolute inset-24 flex aspect-square scale-90 items-center justify-center rounded-full border-t to-transparent to-25%">
              <IntegrationCard className="absolute top-0 -translate-y-1/2">
                <Image src="/databricks.svg" alt="Databricks" width={32} height={32} className="size-8" />
              </IntegrationCard>
              <IntegrationCard className="absolute left-0 top-1/4 -translate-x-1/4 -translate-y-1/4">
                <PostgreSQLIcon className="size-8" />
              </IntegrationCard>
              <IntegrationCard className="absolute right-0 top-1/4 -translate-y-1/4 translate-x-1/4">
                <SupabaseIcon className="size-8" />
              </IntegrationCard>
            </div>

            {/* Center — Lunara logo */}
            <div className="absolute inset-x-0 bottom-0 mx-auto my-2 flex w-fit justify-center gap-2">
              <div className="bg-muted relative z-20 rounded-full border p-1">
                <IntegrationCard
                  className="shadow-black-950/10 dark:bg-background size-24 border-black/20 shadow-xl dark:border-white/25 dark:shadow-white/15"
                  isCenter
                >
                  <svg width={48} height={48} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M8 4L18 4L18 26L32 26L32 36L8 36L8 4Z" className="fill-foreground" />
                    <path d="M20 8L28 8L28 24L20 24L20 8Z" className="fill-background" />
                    <circle cx="30" cy="8" r="2" className="fill-foreground" />
                    <circle cx="30" cy="16" r="2" className="fill-foreground" />
                    <circle cx="12" cy="32" r="2" className="fill-foreground" />
                  </svg>
                </IntegrationCard>
              </div>
            </div>
          </div>

          {/* Text + CTA */}
          <div className="bg-linear-to-t from-background relative z-20 mx-auto mt-12 max-w-lg space-y-6 from-55% text-center">
            <h2 className="text-balance text-3xl font-semibold md:text-4xl">
              Integrate with Your Favorite Data Sources
            </h2>
            <p className="text-muted-foreground">
              Connect to any data warehouse or database. Lunara builds a semantic layer on top, so your team can query without writing SQL.
            </p>
            <Button variant="outline" size="sm" asChild>
              <Link href="#how-it-works">See How It Works</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}

function IntegrationCard({
  children,
  className,
  isCenter = false,
}: {
  children: React.ReactNode
  className?: string
  isCenter?: boolean
}) {
  return (
    <div
      className={cn(
        "relative z-30 flex size-16 rounded-full border bg-white shadow-sm shadow-black/5 dark:bg-white/5 dark:backdrop-blur-md",
        className
      )}
    >
      <div className={cn("m-auto size-fit *:size-8", isCenter && "*:size-10")}>{children}</div>
    </div>
  )
}

function PostgreSQLIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25.6 25.6" className={className}>
      <g fill="none" stroke="#fff" strokeWidth="0.718">
        <path
          d="M18.983 18.636c.163-1.357.114-1.555 1.124-1.336l.257.023c.777.035 1.793-.125 2.392-.403 1.285-.596 2.049-1.593.781-1.332-2.894.597-3.093-.383-3.093-.383 3.053-4.534 4.332-10.289 3.228-11.696-3.005-3.84-8.21-2.024-8.3-1.977l-.028.005a7.39 7.39 0 0 0-1.93-.201c-1.308-.022-2.302.343-3.056.915 0 0-9.283-3.825-8.85 4.81.092 1.836 2.633 13.9 5.663 10.251 1.108-1.332 2.178-2.459 2.178-2.459.533.353 1.168.533 1.835.468l.052-.044a3.1 3.1 0 0 0 .021.518c-.78.872-.551 1.025-2.112 1.346-1.579.325-.651.905-.046 1.056.734.184 2.432.444 3.58-1.163l-.046.183c.306.245.285 1.761.329 2.844s.116 2.095.337 2.688c.221.596.481 2.131 2.532 1.691 1.714-.367 2.603-.896 2.723-5.895"
          style={{ fill: "#336791", stroke: "none" }}
        />
        <path
          d="M23.535 15.6c-2.893.597-3.093-.383-3.093-.383 3.053-4.534 4.332-10.289 3.228-11.696-3.005-3.84-8.21-2.024-8.3-1.977l-.028.005a7.39 7.39 0 0 0-1.93-.201c-1.308-.022-2.302.343-3.056.915 0 0-9.283-3.825-8.85 4.81.092 1.836 2.633 13.9 5.663 10.251 1.108-1.332 2.178-2.459 2.178-2.459.533.353 1.168.533 1.835.468l.052-.044a3.1 3.1 0 0 0 .021.518c-.78.872-.551 1.025-2.112 1.346-1.579.325-.651.905-.046 1.056.734.184 2.432.444 3.58-1.163l-.046.183c.306.245.52 1.593.483 2.815-.037 1.222-.06 2.063.181 2.718.241.656.481 2.131 2.532 1.691 1.714-.367 2.604-.896 2.723-5.895.084-3.55.252-3.81 1.088-3.964l.257.023c.777.035 1.793-.125 2.392-.403 1.285-.596 2.049-1.593.781-1.332z"
          style={{ fill: "#6699CC", stroke: "none" }}
        />
        <path d="M11.252 15.982c-.78.872-.551 1.025-2.112 1.346-1.579.325-.651.905-.046 1.056.734.184 2.432.444 3.58-1.163a2.3 2.3 0 0 0-.182-1.575c-.233-.397-.605-.662-1.24-.664z" />
        <path d="M19.983 7.044c-3.005-3.84-8.21-2.024-8.3-1.977l-.028.005a7.39 7.39 0 0 0-1.93-.201c-1.308-.022-2.302.343-3.056.915 0 0-9.283-3.825-8.85 4.81.092 1.836 2.633 13.9 5.663 10.251 1.108-1.332 2.178-2.459 2.178-2.459.533.353 1.168.533 1.835.468" />
        <path d="M20.442 15.217s.2.98 3.093.383c1.268-.261.504.736-.781 1.332-.599.278-1.615.438-2.392.403" />
      </g>
    </svg>
  )
}
