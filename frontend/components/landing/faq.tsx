"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { SectionWrapper } from "@/components/shared/section-wrapper"
import { SectionHeader } from "@/components/shared/section-header"
import { FAQ_ITEMS } from "@/lib/constants"

export function FAQ() {
  return (
    <SectionWrapper id="faq">
      <SectionHeader
        badge="FAQ"
        title="Frequently Asked Questions"
        subtitle="Everything you need to know about Lunara."
      />

      <div className="mx-auto max-w-3xl">
        <Accordion type="single" collapsible className="w-full">
          {FAQ_ITEMS.map((item, i) => (
            <AccordionItem key={i} value={`item-${i}`}>
              <AccordionTrigger className="text-left text-base">
                {item.question}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                {item.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </SectionWrapper>
  )
}
