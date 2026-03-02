"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"

interface LogoProps {
  className?: string
  variant?: "default" | "icon" | "text"
  size?: number
}

// Concept 1: Angular L - Sharp geometric L with data nodes
const AngularL: React.FC<LogoProps> = ({ className = "", variant = "icon", size = 40 }) => {
  if (variant === "icon") {
    return (
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
        <path d="M8 4L18 4L18 26L32 26L32 36L8 36L8 4Z" className="fill-foreground" />
        <path d="M20 8L28 8L28 24L20 24L20 8Z" className="fill-background" />
        <circle cx="30" cy="8" r="2" className="fill-foreground" />
        <circle cx="30" cy="16" r="2" className="fill-foreground" />
        <circle cx="12" cy="32" r="2" className="fill-foreground" />
      </svg>
    )
  }

  return (
    <svg width={size * 5} height={size} viewBox="0 0 200 40" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M4 2L9 2L9 13L16 13L16 18L4 18L4 2Z" className="fill-foreground" />
      <path d="M10 4L14 4L14 12L10 12L10 4Z" className="fill-background" />
      <circle cx="15" cy="4" r="1" className="fill-foreground" />
      <circle cx="15" cy="8" r="1" className="fill-foreground" />
      <text x="24" y="15" className="fill-foreground" style={{ fontSize: "13px", fontWeight: "600", fontFamily: "system-ui", letterSpacing: "-0.5px" }}>Lunara Labs</text>
    </svg>
  )
}

// Concept 2: Orbital Nodes - Abstract orbital paths with connection points
const OrbitalNodes: React.FC<LogoProps> = ({ className = "", variant = "icon", size = 40 }) => {
  if (variant === "icon") {
    return (
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
        <path d="M20 4L32 12L32 28L20 36L8 28L8 12L20 4Z" className="stroke-foreground" strokeWidth="2" />
        <path d="M20 12L26 16L26 24L20 28L14 24L14 16L20 12Z" className="fill-foreground" />
        <circle cx="20" cy="4" r="2.5" className="fill-foreground" />
        <circle cx="32" cy="12" r="2.5" className="fill-foreground" />
        <circle cx="8" cy="28" r="2.5" className="fill-foreground" />
      </svg>
    )
  }

  return (
    <svg width={size * 5} height={size} viewBox="0 0 200 40" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M10 2L16 6L16 14L10 18L4 14L4 6L10 2Z" className="stroke-foreground" strokeWidth="1" />
      <path d="M10 6L13 8L13 12L10 14L7 12L7 8L10 6Z" className="fill-foreground" />
      <circle cx="10" cy="2" r="1.5" className="fill-foreground" />
      <circle cx="16" cy="6" r="1.5" className="fill-foreground" />
      <text x="24" y="15" className="fill-foreground" style={{ fontSize: "13px", fontWeight: "600", fontFamily: "system-ui", letterSpacing: "-0.5px" }}>Lunara Labs</text>
    </svg>
  )
}

// Concept 3: Phase Shift - Geometric blocks suggesting data states
const PhaseShift: React.FC<LogoProps> = ({ className = "", variant = "icon", size = 40 }) => {
  if (variant === "icon") {
    return (
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
        <rect x="4" y="4" width="10" height="32" className="fill-foreground" />
        <rect x="16" y="12" width="8" height="24" className="fill-foreground opacity-70" />
        <rect x="26" y="18" width="10" height="18" className="fill-foreground opacity-40" />
        <path d="M4 4L14 4L14 12L4 12Z" className="fill-background opacity-30" />
      </svg>
    )
  }

  return (
    <svg width={size * 5} height={size} viewBox="0 0 200 40" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect x="2" y="2" width="5" height="16" className="fill-foreground" />
      <rect x="8" y="6" width="4" height="12" className="fill-foreground opacity-70" />
      <rect x="13" y="9" width="5" height="9" className="fill-foreground opacity-40" />
      <text x="24" y="15" className="fill-foreground" style={{ fontSize: "13px", fontWeight: "600", fontFamily: "system-ui", letterSpacing: "-0.5px" }}>Lunara Labs</text>
    </svg>
  )
}

// Concept 4: Neural Arc - Sharp arc with connection points
const NeuralArc: React.FC<LogoProps> = ({ className = "", variant = "icon", size = 40 }) => {
  if (variant === "icon") {
    return (
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
        <path d="M6 34L6 20C6 11.163 13.163 4 22 4L34 4" className="stroke-foreground" strokeWidth="3" strokeLinecap="square" />
        <path d="M20 20L26 14L32 20L26 26L20 20Z" className="fill-foreground" />
        <circle cx="6" cy="34" r="3" className="fill-foreground" />
        <circle cx="34" cy="4" r="3" className="fill-foreground" />
        <circle cx="20" cy="20" r="2" className="fill-background" />
      </svg>
    )
  }

  return (
    <svg width={size * 5} height={size} viewBox="0 0 200 40" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M3 17L3 10C3 5.582 6.582 2 11 2L17 2" className="stroke-foreground" strokeWidth="1.5" strokeLinecap="square" />
      <path d="M10 10L13 7L16 10L13 13L10 10Z" className="fill-foreground" />
      <circle cx="3" cy="17" r="1.5" className="fill-foreground" />
      <circle cx="17" cy="2" r="1.5" className="fill-foreground" />
      <text x="24" y="15" className="fill-foreground" style={{ fontSize: "13px", fontWeight: "600", fontFamily: "system-ui", letterSpacing: "-0.5px" }}>Lunara Labs</text>
    </svg>
  )
}

// Concept 5: Prismatic Fragment - Faceted geometric shape
const PrismaticFragment: React.FC<LogoProps> = ({ className = "", variant = "icon", size = 40 }) => {
  if (variant === "icon") {
    return (
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
        <path d="M20 4L36 14L30 32L10 32L4 14L20 4Z" className="fill-foreground" />
        <path d="M20 4L36 14L20 18L4 14L20 4Z" className="fill-background opacity-30" />
        <path d="M20 18L30 32L10 32L20 18Z" className="fill-background opacity-15" />
        <line x1="20" y1="4" x2="20" y2="32" className="stroke-background" strokeWidth="1.5" />
      </svg>
    )
  }

  return (
    <svg width={size * 5} height={size} viewBox="0 0 200 40" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M10 2L18 7L15 16L5 16L2 7L10 2Z" className="fill-foreground" />
      <path d="M10 2L18 7L10 9L2 7L10 2Z" className="fill-background opacity-30" />
      <path d="M10 9L15 16L5 16L10 9Z" className="fill-background opacity-15" />
      <text x="24" y="15" className="fill-foreground" style={{ fontSize: "13px", fontWeight: "600", fontFamily: "system-ui", letterSpacing: "-0.5px" }}>Lunara Labs</text>
    </svg>
  )
}

// Concept 6: Data Lattice - Interconnected nodes forming L
const DataLattice: React.FC<LogoProps> = ({ className = "", variant = "icon", size = 40 }) => {
  if (variant === "icon") {
    return (
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
        <line x1="8" y1="8" x2="32" y2="8" className="stroke-foreground" strokeWidth="2" />
        <line x1="8" y1="8" x2="8" y2="32" className="stroke-foreground" strokeWidth="2" />
        <line x1="8" y1="32" x2="32" y2="32" className="stroke-foreground" strokeWidth="2" />
        <line x1="32" y1="8" x2="20" y2="20" className="stroke-foreground" strokeWidth="1" opacity="0.4" />
        <line x1="20" y1="20" x2="32" y2="32" className="stroke-foreground" strokeWidth="1" opacity="0.4" />
        <circle cx="8" cy="8" r="3" className="fill-foreground" />
        <circle cx="32" cy="8" r="3" className="fill-foreground" />
        <circle cx="8" cy="32" r="3" className="fill-foreground" />
        <circle cx="32" cy="32" r="3" className="fill-foreground" />
        <circle cx="20" cy="20" r="2" className="fill-foreground" />
      </svg>
    )
  }

  return (
    <svg width={size * 5} height={size} viewBox="0 0 200 40" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <line x1="4" y1="4" x2="16" y2="4" className="stroke-foreground" strokeWidth="1" />
      <line x1="4" y1="4" x2="4" y2="16" className="stroke-foreground" strokeWidth="1" />
      <line x1="4" y1="16" x2="16" y2="16" className="stroke-foreground" strokeWidth="1" />
      <circle cx="4" cy="4" r="1.5" className="fill-foreground" />
      <circle cx="16" cy="4" r="1.5" className="fill-foreground" />
      <circle cx="4" cy="16" r="1.5" className="fill-foreground" />
      <circle cx="16" cy="16" r="1.5" className="fill-foreground" />
      <text x="24" y="15" className="fill-foreground" style={{ fontSize: "13px", fontWeight: "600", fontFamily: "system-ui", letterSpacing: "-0.5px" }}>Lunara Labs</text>
    </svg>
  )
}

// Concept 7: Flux Triangle - Sharp triangular forms in motion
const FluxTriangle: React.FC<LogoProps> = ({ className = "", variant = "icon", size = 40 }) => {
  if (variant === "icon") {
    return (
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
        <path d="M20 4L36 32L4 32L20 4Z" className="fill-foreground" />
        <path d="M20 12L30 28L10 28L20 12Z" className="fill-background" />
        <path d="M20 4L28 18L12 18L20 4Z" className="fill-foreground opacity-60" />
      </svg>
    )
  }

  return (
    <svg width={size * 5} height={size} viewBox="0 0 200 40" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M10 2L18 16L2 16L10 2Z" className="fill-foreground" />
      <path d="M10 6L15 14L5 14L10 6Z" className="fill-background" />
      <text x="24" y="15" className="fill-foreground" style={{ fontSize: "13px", fontWeight: "600", fontFamily: "system-ui", letterSpacing: "-0.5px" }}>Lunara Labs</text>
    </svg>
  )
}

// Concept 8: Vector Pulse - Sharp chevrons suggesting forward motion
const VectorPulse: React.FC<LogoProps> = ({ className = "", variant = "icon", size = 40 }) => {
  if (variant === "icon") {
    return (
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
        <path d="M4 20L14 8L14 32L4 20Z" className="fill-foreground" />
        <path d="M16 20L26 8L26 32L16 20Z" className="fill-foreground opacity-60" />
        <path d="M28 20L38 8L38 32L28 20Z" className="fill-foreground opacity-30" />
      </svg>
    )
  }

  return (
    <svg width={size * 5} height={size} viewBox="0 0 200 40" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M2 10L7 4L7 16L2 10Z" className="fill-foreground" />
      <path d="M8 10L13 4L13 16L8 10Z" className="fill-foreground opacity-60" />
      <path d="M14 10L19 4L19 16L14 10Z" className="fill-foreground opacity-30" />
      <text x="24" y="15" className="fill-foreground" style={{ fontSize: "13px", fontWeight: "600", fontFamily: "system-ui", letterSpacing: "-0.5px" }}>Lunara Labs</text>
    </svg>
  )
}

// Concept 9: Quantum Split - Split hexagon with energy gap
const QuantumSplit: React.FC<LogoProps> = ({ className = "", variant = "icon", size = 40 }) => {
  if (variant === "icon") {
    return (
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
        <path d="M6 10L18 4L18 18L6 24L6 10Z" className="fill-foreground" />
        <path d="M22 18L22 4L34 10L34 24L22 18Z" className="fill-foreground" />
        <rect x="18" y="16" width="4" height="4" className="fill-foreground" />
        <line x1="18" y1="18" x2="22" y2="18" className="stroke-background" strokeWidth="1" />
      </svg>
    )
  }

  return (
    <svg width={size * 5} height={size} viewBox="0 0 200 40" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M3 5L9 2L9 9L3 12L3 5Z" className="fill-foreground" />
      <path d="M11 9L11 2L17 5L17 12L11 9Z" className="fill-foreground" />
      <rect x="9" y="8" width="2" height="2" className="fill-foreground" />
      <text x="24" y="15" className="fill-foreground" style={{ fontSize: "13px", fontWeight: "600", fontFamily: "system-ui", letterSpacing: "-0.5px" }}>Lunara Labs</text>
    </svg>
  )
}

// Concept 10: Signal Stack - Stacked angular forms
const SignalStack: React.FC<LogoProps> = ({ className = "", variant = "icon", size = 40 }) => {
  if (variant === "icon") {
    return (
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
        <path d="M4 16L12 8L28 8L36 16L20 24L4 16Z" className="fill-foreground" />
        <path d="M4 24L12 16L28 16L36 24L20 32L4 24Z" className="fill-foreground opacity-70" />
        <path d="M4 32L12 24L28 24L36 32L20 40L4 32Z" className="fill-foreground opacity-40" />
      </svg>
    )
  }

  return (
    <svg width={size * 5} height={size} viewBox="0 0 200 40" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M2 8L6 4L14 4L18 8L10 12L2 8Z" className="fill-foreground" />
      <path d="M2 12L6 8L14 8L18 12L10 16L2 12Z" className="fill-foreground opacity-70" />
      <path d="M2 16L6 12L14 12L18 16L10 20L2 16Z" className="fill-foreground opacity-40" />
      <text x="24" y="15" className="fill-foreground" style={{ fontSize: "13px", fontWeight: "600", fontFamily: "system-ui", letterSpacing: "-0.5px" }}>Lunara Labs</text>
    </svg>
  )
}

const concepts = [
  { id: "angular", name: "Angular L", Component: AngularL, desc: "Sharp geometric L with data nodes" },
  { id: "orbital", name: "Orbital Nodes", Component: OrbitalNodes, desc: "Abstract orbital paths with connection points" },
  { id: "phase", name: "Phase Shift", Component: PhaseShift, desc: "Geometric blocks suggesting data states" },
  { id: "neural", name: "Neural Arc", Component: NeuralArc, desc: "Sharp arc with AI connection points" },
  { id: "prismatic", name: "Prismatic", Component: PrismaticFragment, desc: "Faceted geometric with light refraction" },
  { id: "lattice", name: "Data Lattice", Component: DataLattice, desc: "Interconnected nodes forming L shape" },
  { id: "flux", name: "Flux Triangle", Component: FluxTriangle, desc: "Sharp triangular forms in motion" },
  { id: "vector", name: "Vector Pulse", Component: VectorPulse, desc: "Sharp chevrons suggesting forward motion" },
  { id: "quantum", name: "Quantum Split", Component: QuantumSplit, desc: "Split hexagon with energy gap" },
  { id: "signal", name: "Signal Stack", Component: SignalStack, desc: "Stacked angular forms with depth" },
]

export default function LogosPage() {
  const [selectedConcept, setSelectedConcept] = useState("angular")

  const SelectedLogo = concepts.find((c) => c.id === selectedConcept)?.Component || AngularL

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-8">
        {/* Header */}
        <div className="space-y-3 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">Lunara Labs Inc.</h1>
          <p className="mx-auto max-w-2xl text-sm text-muted-foreground md:text-base">
            Abstract, tech-forward logo concepts for your agentic BI platform. Monochrome design with sharp edges.
          </p>
        </div>

        {/* Concept Selector */}
        <div className="flex flex-wrap justify-center gap-2">
          {concepts.map((concept) => (
            <Button
              key={concept.id}
              variant={selectedConcept === concept.id ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedConcept(concept.id)}
              className="text-xs md:text-sm"
            >
              {concept.name}
            </Button>
          ))}
        </div>

        {/* Main Showcase */}
        <div className="rounded-xl border border-border bg-card p-6 md:p-12">
          <div className="flex flex-col items-center gap-6">
            <div className="space-y-2 text-center">
              <h2 className="text-xl font-semibold text-foreground md:text-2xl">
                {concepts.find((c) => c.id === selectedConcept)?.name}
              </h2>
              <p className="text-sm text-muted-foreground">
                {concepts.find((c) => c.id === selectedConcept)?.desc}
              </p>
            </div>
            <SelectedLogo variant="icon" size={120} />
          </div>
        </div>

        {/* All Concepts Grid */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground md:text-2xl">All Concepts</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {concepts.map(({ id, name, Component, desc }) => (
              <div
                key={id}
                className="cursor-pointer rounded-lg border border-border bg-card p-6 transition-colors hover:bg-accent/50"
                onClick={() => setSelectedConcept(id)}
              >
                <div className="flex flex-col items-center gap-4">
                  <Component variant="icon" size={64} />
                  <div className="space-y-1 text-center">
                    <h3 className="text-sm font-semibold text-foreground">{name}</h3>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Logo Variants */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Icon Only (Favicon) */}
          <div className="space-y-4 rounded-lg border border-border bg-card p-6">
            <h3 className="font-semibold text-foreground">Icon Only (Favicon)</h3>
            <div className="flex flex-wrap items-center justify-around gap-4">
              <div className="flex flex-col items-center gap-2">
                <div className="rounded border border-border bg-background p-2">
                  <SelectedLogo variant="icon" size={16} />
                </div>
                <span className="text-xs text-muted-foreground">16x16</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="rounded border border-border bg-background p-2">
                  <SelectedLogo variant="icon" size={32} />
                </div>
                <span className="text-xs text-muted-foreground">32x32</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="rounded border border-border bg-background p-2">
                  <SelectedLogo variant="icon" size={48} />
                </div>
                <span className="text-xs text-muted-foreground">48x48</span>
              </div>
            </div>
          </div>

          {/* Full Logo */}
          <div className="space-y-4 rounded-lg border border-border bg-card p-6">
            <h3 className="font-semibold text-foreground">Full Logo (with text)</h3>
            <div className="flex min-h-[140px] flex-col items-center justify-center gap-6">
              <SelectedLogo variant="default" size={32} />
              <SelectedLogo variant="default" size={40} />
            </div>
          </div>
        </div>

        {/* Usage Examples */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground md:text-2xl">Usage Examples</h2>

          {/* Navbar - Light */}
          <div className="rounded-lg border border-border bg-white p-4">
            <div className="flex items-center justify-between">
              <SelectedLogo variant="default" size={28} className="[&_*]:!fill-black [&_*]:!stroke-black" />
              <div className="flex gap-6 text-sm text-gray-600">
                <span>Platform</span>
                <span>Solutions</span>
                <span>Pricing</span>
              </div>
            </div>
          </div>

          {/* Navbar - Dark */}
          <div className="rounded-lg border border-border bg-black p-4">
            <div className="flex items-center justify-between">
              <SelectedLogo variant="default" size={28} className="[&_*]:!fill-white [&_*]:!stroke-white" />
              <div className="flex gap-6 text-sm text-gray-400">
                <span>Platform</span>
                <span>Solutions</span>
                <span>Pricing</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="rounded-lg border border-border bg-card p-8">
            <div className="flex flex-col items-center gap-4 text-center">
              <SelectedLogo variant="icon" size={40} />
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Lunara Labs Inc.</p>
                <p className="text-xs text-muted-foreground">Agentic BI Platform</p>
                <p className="text-xs text-muted-foreground">&copy; 2024 All rights reserved.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Technical Notes */}
        <div className="space-y-3 rounded-lg border border-border bg-card p-6">
          <h3 className="font-semibold text-foreground">Technical Notes</h3>
          <ul className="list-inside list-disc space-y-2 text-sm text-muted-foreground">
            <li>All logos use semantic color classes (fill-foreground, stroke-foreground)</li>
            <li>Automatically adapts to light/dark mode via Tailwind theming</li>
            <li>Sharp, geometric edges for modern tech aesthetic</li>
            <li>Scalable at any size without quality loss</li>
            <li>Optimized for favicon sizes (16x16, 32x32, 48x48)</li>
            <li>Monochrome design with optional luminous accent support</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
