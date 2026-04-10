import type React from "react";
import type { PropsWithChildren } from "react";

export function Card(props: PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={
        "rounded-2xl border border-white/10 bg-white/5 shadow-[0_10px_40px_-20px_rgba(0,0,0,0.8)] backdrop-blur " +
        (props.className ?? "")
      }
    >
      {props.children}
    </div>
  );
}

export function Button(
  props: PropsWithChildren<{
    onClick?: () => void;
    type?: "button" | "submit";
    disabled?: boolean;
    variant?: "primary" | "secondary" | "danger";
    className?: string;
  }>
) {
  const variant = props.variant ?? "primary";
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-sky-400/60 disabled:opacity-50 disabled:cursor-not-allowed";
  const styles =
    variant === "primary"
      ? "bg-sky-500 text-slate-950 hover:bg-sky-400"
      : variant === "danger"
        ? "bg-rose-500 text-white hover:bg-rose-400"
        : "bg-white/10 text-white hover:bg-white/15";
  return (
    <button
      type={props.type ?? "button"}
      onClick={props.onClick}
      disabled={props.disabled}
      className={base + " " + styles + " " + (props.className ?? "")}
    >
      {props.children}
    </button>
  );
}

export function Input(
  props: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    type?: string;
    className?: string;
  }
) {
  return (
    <input
      {...props}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      className={
        "w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white placeholder:text-white/35 focus:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400/20 " +
        (props.className ?? "")
      }
    />
  );
}

export function Select(
  props: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange"> & {
    value: string;
    onChange: (v: string) => void;
    children: React.ReactNode;
    className?: string;
  }
) {
  return (
    <select
      {...props}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      className={
        "w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white focus:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400/20 " +
        (props.className ?? "")
      }
    >
      {props.children}
    </select>
  );
}

export function Badge(props: PropsWithChildren<{ tone?: "green" | "yellow" | "red" | "slate" }>) {
  const tone = props.tone ?? "slate";
  const cls =
    tone === "green"
      ? "bg-emerald-500/15 text-emerald-200 border-emerald-400/20"
      : tone === "yellow"
        ? "bg-amber-500/15 text-amber-200 border-amber-400/20"
        : tone === "red"
          ? "bg-rose-500/15 text-rose-200 border-rose-400/20"
          : "bg-white/10 text-white/80 border-white/10";
  return <span className={"inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium " + cls}>{props.children}</span>;
}

