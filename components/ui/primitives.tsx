"use client";

import { useState, type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes, type ButtonHTMLAttributes } from "react";
import { statusColor, isActiveStatus } from "@/lib/ui/format";

/* ─── StatusDot ─────────────────────────────────────────── */

export function StatusDot({
  status,
  size = 8,
}: {
  status: string;
  size?: number;
}) {
  const color = statusColor(status);
  const active = isActiveStatus(status);
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        backgroundColor: color,
        flexShrink: 0,
        animation: active ? "pulse-dot 1.8s ease-in-out infinite" : undefined,
      }}
    />
  );
}

/* ─── MonoLabel ─────────────────────────────────────────── */

export function MonoLabel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={className}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        fontWeight: 500,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: "var(--text-muted)",
      }}
    >
      {children}
    </span>
  );
}

/* ─── Card ──────────────────────────────────────────────── */

export function Card({
  children,
  variant = "default",
  className = "",
  style,
}: {
  children: ReactNode;
  variant?: "default" | "elevated";
  className?: string;
  style?: React.CSSProperties;
}) {
  const bg = variant === "elevated" ? "var(--surface-2)" : "var(--surface-1)";
  const border =
    variant === "elevated"
      ? "var(--border-emphasis)"
      : "var(--border-default)";
  return (
    <div
      className={className}
      style={{
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: "var(--radius)",
        padding: 20,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ─── MetricCard ────────────────────────────────────────── */

export function MetricCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        background: "var(--surface-1)",
        border: `1px solid ${accent ? "var(--border-accent)" : "var(--border-default)"}`,
        borderRadius: "var(--radius)",
        padding: "14px 16px",
      }}
    >
      <MonoLabel>{label}</MonoLabel>
      <p
        style={{
          marginTop: 6,
          fontSize: 28,
          fontWeight: 600,
          lineHeight: 1,
          color: accent ? "var(--accent)" : "var(--text-primary)",
        }}
      >
        {value}
      </p>
    </div>
  );
}

/* ─── Button ────────────────────────────────────────────── */

type ButtonVariant = "primary" | "secondary" | "danger";

const buttonStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background: "var(--accent)",
    color: "#000",
    border: "1px solid var(--accent)",
    fontWeight: 600,
  },
  secondary: {
    background: "transparent",
    color: "var(--text-secondary)",
    border: "1px solid var(--border-emphasis)",
  },
  danger: {
    background: "rgba(239,68,68,0.1)",
    color: "rgb(239,68,68)",
    border: "1px solid rgba(239,68,68,0.3)",
  },
};

export function Button({
  variant = "secondary",
  children,
  className = "",
  style,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  children: ReactNode;
}) {
  return (
    <button
      className={className}
      style={{
        ...buttonStyles[variant],
        borderRadius: "var(--radius)",
        padding: "8px 16px",
        fontSize: 13,
        fontFamily: "var(--font-mono)",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        cursor: "pointer",
        transition: "opacity 0.15s",
        ...style,
      }}
      {...props}
    >
      {children}
    </button>
  );
}

/* ─── Input ─────────────────────────────────────────────── */

export function Input({
  label,
  style,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <label style={{ display: "block" }}>
      {label && <MonoLabel>{label}</MonoLabel>}
      <input
        style={{
          display: "block",
          width: "100%",
          marginTop: label ? 6 : 0,
          padding: "10px 12px",
          background: "var(--surface-3)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius)",
          color: "var(--text-primary)",
          fontSize: 13,
          fontFamily: "inherit",
          outline: "none",
          transition: "border-color 0.15s",
          ...style,
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = "var(--border-accent)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = "var(--border-default)";
        }}
        {...props}
      />
    </label>
  );
}

/* ─── Select ────────────────────────────────────────────── */

export function Select({
  label,
  children,
  style,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  children: ReactNode;
}) {
  return (
    <label style={{ display: "block" }}>
      {label && <MonoLabel>{label}</MonoLabel>}
      <select
        style={{
          display: "block",
          width: "100%",
          marginTop: label ? 6 : 0,
          padding: "10px 12px",
          background: "var(--surface-3)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius)",
          color: "var(--text-primary)",
          fontSize: 13,
          fontFamily: "inherit",
          outline: "none",
          ...style,
        }}
        {...props}
      >
        {children}
      </select>
    </label>
  );
}

/* ─── ScoreBar ──────────────────────────────────────────── */

export function ScoreBar({
  label,
  score,
  max = 10,
}: {
  label: string;
  score: number;
  max?: number;
}) {
  const pct = Math.min(100, (score / max) * 100);
  const color =
    score >= 7
      ? "var(--status-pass)"
      : score >= 4
        ? "rgb(234,179,8)"
        : "var(--status-fail)";

  return (
    <div style={{ marginBottom: 8 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 4,
        }}
      >
        <MonoLabel>{label}</MonoLabel>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--text-secondary)",
          }}
        >
          {score.toFixed(1)}
        </span>
      </div>
      <div
        style={{
          height: 4,
          background: "var(--surface-3)",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: color,
            borderRadius: 2,
            transition: "width 0.3s ease",
          }}
        />
      </div>
    </div>
  );
}

/* ─── Badge ─────────────────────────────────────────────── */

export function Badge({
  children,
  color,
}: {
  children: ReactNode;
  color?: string;
}) {
  const c = color ?? "var(--text-muted)";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        fontSize: 10,
        fontFamily: "var(--font-mono)",
        fontWeight: 500,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        color: c,
        background:
          c === "var(--status-pass)"
            ? "rgba(34,224,125,0.1)"
            : c === "var(--status-fail)"
              ? "rgba(239,68,68,0.1)"
              : "rgba(255,255,255,0.06)",
        border: `1px solid ${c === "var(--status-pass)" ? "rgba(34,224,125,0.25)" : c === "var(--status-fail)" ? "rgba(239,68,68,0.25)" : "rgba(255,255,255,0.1)"}`,
        borderRadius: "var(--radius)",
      }}
    >
      {children}
    </span>
  );
}

/* ─── Collapsible ───────────────────────────────────────── */

export function Collapsible({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      style={{
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius)",
        background: "var(--surface-1)",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          padding: "10px 14px",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--text-secondary)",
          fontSize: 12,
          fontFamily: "var(--font-mono)",
          fontWeight: 500,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          textAlign: "left",
        }}
      >
        <span
          style={{
            display: "inline-block",
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.15s",
            fontSize: 10,
          }}
        >
          &#9654;
        </span>
        {title}
      </button>
      {open && (
        <div style={{ padding: "0 14px 14px" }}>{children}</div>
      )}
    </div>
  );
}
