import type { ReactNode } from "react";
import { GridPattern } from "@/components/GridPattern";
import logoImg from "@/assets/logo.png";

/**
 * Shared dark canvas for every authentication screen (Login, Signup,
 * Forgot Password). Deliberately the one moody surface on an otherwise
 * light site — a gold + emerald glow bleeding from a near-black canvas,
 * per the approved authentication reference.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="auth-canvas relative flex min-h-[calc(100vh-64px)] items-center justify-center overflow-hidden px-4 py-14">
      <GridPattern className="text-white/60" cellSize={38} />
      <div className="relative z-10 w-full">{children}</div>
    </div>
  );
}

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="auth-card-glow relative mx-auto w-full max-w-[420px] rounded-3xl border border-white/10 bg-white/[0.04] p-8 backdrop-blur-xl sm:p-10">
      <div className="flex flex-col items-center text-center">
        <img
          src={logoImg}
          alt="Mahabharat Consultancy"
          className="brand-logo mb-5 h-16 w-auto sm:h-[4.5rem]"
          width={72}
          height={86}
          decoding="async"
        />
        <h1 className="font-display text-[1.65rem] font-bold text-white">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[13.5px] text-white/50">{subtitle}</p>}
      </div>

      <div className="mt-8">{children}</div>

      {footer && <div className="mt-7 text-center text-sm text-white/50">{footer}</div>}
    </div>
  );
}

/** Shared className strings for form controls that sit on the dark auth canvas. */
export const authInputClass =
  "h-12 rounded-2xl border-white/10 bg-white/[0.06] px-4 text-[15px] text-white placeholder:text-white/35 focus-visible:border-gold/40 focus-visible:ring-gold/40";
export const authLabelClass = "text-[13px] font-medium text-white/70";
