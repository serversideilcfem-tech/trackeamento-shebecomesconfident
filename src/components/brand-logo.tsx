import { cn } from "@/lib/utils";

interface BrandLogoProps {
  className?: string;
  iconClassName?: string;
}

/**
 * Trackeamento.Online — logo "inteligência ativa".
 * Conceito: scope circular (monitoramento) + pulse wave (atividade) +
 * dot central (sinal detectado). Gradiente blue → purple → cyan.
 */
export function BrandLogo({ className, iconClassName }: BrandLogoProps) {
  return (
    <div
      className={cn(
        "bg-gradient-to-br from-blue-500 via-purple-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-purple-500/25 shrink-0",
        className
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn("text-white", iconClassName)}
        aria-hidden="true"
      >
        {/* Scope/radar exterior — linha parcial sugere movimento */}
        <path d="M3.5 12a8.5 8.5 0 0 1 14.5 -6" opacity="0.55" />
        <path d="M20.5 12a8.5 8.5 0 0 1 -14.5 6" opacity="0.55" />
        {/* Pulse wave — heartbeat cortando o scope */}
        <path d="M2 12 L6.5 12 L8.5 8.5 L11 16 L13.5 9.5 L15.5 13 L22 13" />
        {/* Dot central — sinal detectado */}
        <circle cx="12" cy="12" r="1.4" fill="white" stroke="none" />
      </svg>
    </div>
  );
}
