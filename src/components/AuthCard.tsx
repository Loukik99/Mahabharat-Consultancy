import type { ReactNode } from "react";
import logoImg from "@/assets/logo.png";

/**
 * Shared authentication layout: one continuous light surface under the navbar.
 * No hero section, gradients, dividers, or page chrome — only centering for
 * the existing auth card. Used by customer + staff auth screens.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="auth-canvas relative flex w-full flex-1 items-center justify-center px-4 py-14">
      <div className="relative z-10 w-full">{children}</div>
    </div>
  );
}

/** Alias — prefer AuthLayout naming when wrapping full auth pages. */
export const AuthLayout = AuthShell;

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
    <div className="auth-card-glow relative mx-auto w-full max-w-[420px] rounded-3xl border border-mist bg-white p-8 sm:p-10">
      <div className="flex flex-col items-center text-center">
        <img
          src={logoImg}
          alt="Mahabharat Consultancy"
          className="brand-logo mb-5 h-16 w-auto sm:h-[4.5rem]"
          width={72}
          height={86}
          decoding="async"
        />
        <h1 className="font-display text-[1.65rem] font-bold text-navy-deep">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[13.5px] text-smoke">{subtitle}</p>}
      </div>

      <div className="mt-8">{children}</div>

      {footer && <div className="mt-7 text-center text-sm text-smoke">{footer}</div>}
    </div>
  );
}

/** Shared className strings for form controls on the light auth canvas. */
export const authInputClass =
  "h-12 rounded-2xl border-mist bg-white px-4 text-[15px] text-navy-deep placeholder:text-fog focus-visible:border-gold/40 focus-visible:ring-gold/40";
export const authLabelClass = "text-[13px] font-medium text-ink";
