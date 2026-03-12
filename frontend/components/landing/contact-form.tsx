"use client"

import { useState } from "react"
import { Send, CheckCircle, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"

type FormState = "idle" | "submitting" | "success" | "error"

export function ContactForm() {
  const [formState, setFormState] = useState<FormState>("idle")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [category, setCategory] = useState("")
  const [message, setMessage] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormState("submitting")

    // Simulate form submission (no backend wired yet)
    await new Promise((resolve) => setTimeout(resolve, 1000))

    setFormState("success")
    setName("")
    setEmail("")
    setCategory("")
    setMessage("")
  }

  if (formState === "success") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-primary/10">
            <CheckCircle className="size-7 text-primary" />
          </div>
          <h3 className="text-xl font-semibold">Message Sent</h3>
          <p className="text-sm text-muted-foreground">
            Thank you for reaching out. We&apos;ll get back to you within 24
            hours.
          </p>
          <Button
            variant="outline"
            onClick={() => setFormState("idle")}
            className="mt-2"
          >
            Send another message
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-6 md:p-8">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select value={category} onValueChange={setCategory} required>
              <SelectTrigger id="category" className="w-full">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sales">Sales</SelectItem>
                <SelectItem value="support">Support</SelectItem>
                <SelectItem value="feedback">Feedback</SelectItem>
                <SelectItem value="partnership">Partnership</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">Message</Label>
            <Textarea
              id="message"
              placeholder="How can we help?"
              className="min-h-[120px]"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
            />
          </div>

          {formState === "error" && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              Something went wrong. Please try again.
            </div>
          )}

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={formState === "submitting"}
          >
            {formState === "submitting" ? (
              "Sending..."
            ) : (
              <>
                Send Message
                <Send className="ml-1 size-4" />
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
