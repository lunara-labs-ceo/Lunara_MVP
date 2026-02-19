"use client";

const items = [
  "Automated Semantic Layers",
  "Supercharged AI Agents",
  "Natural Language Queries",
  "Instant Reports",
  "Dashboards",
  "Exportable PPTs",
  "Automated Semantic Layers",
  "Supercharged AI Agents",
  "Natural Language Queries",
  "Instant Reports",
  "Dashboards",
  "Exportable PPTs",
];

export default function MarqueeStrip() {
  return (
    <div
      className="overflow-hidden py-4 border-y"
      style={{
        background: "linear-gradient(135deg, #4ADE80 0%, #0D9488 100%)",
        borderColor: "transparent",
      }}
    >
      <div
        className="flex gap-10 whitespace-nowrap"
        style={{ animation: "marquee 22s linear infinite" }}
      >
        {items.map((item, i) => (
          <span
            key={i}
            className="text-sm font-semibold text-white/90 shrink-0"
          >
            {item}
            <span className="ml-10 text-white/50">•</span>
          </span>
        ))}
      </div>

      <style>{`
        @keyframes marquee {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
