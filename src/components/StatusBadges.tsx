import React from "react";
import { CheckCircle2, Clock, ShieldAlert, AlertTriangle, DatabaseZap } from "lucide-react";
import { StatusLevel } from "../types";

interface StatusBadgeProps {
  status: StatusLevel;
  size?: "sm" | "md" | "lg";
  showIcon?: boolean;
  customLabel?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = "md",
  showIcon = true,
  customLabel,
}) => {
  const sizeClasses = {
    sm: "px-1.5 py-0.5 text-[10px] gap-1",
    md: "px-2.5 py-1 text-xs gap-1.5",
    lg: "px-3 py-1.5 text-sm gap-2",
  }[size];

  const iconSizes = {
    sm: 11,
    md: 13,
    lg: 16,
  }[size];

  switch (status) {
    case "PASS":
      return (
        <span
          className={`inline-flex items-center font-mono font-semibold rounded-md border bg-emerald-500/10 text-emerald-400 border-emerald-500/30 ${sizeClasses}`}
          title="PASS / Healthy Execution"
        >
          {showIcon && <CheckCircle2 size={iconSizes} className="text-emerald-400 shrink-0" />}
          <span>{customLabel || "PASS"}</span>
        </span>
      );

    case "WAIT":
      return (
        <span
          className={`inline-flex items-center font-mono font-semibold rounded-md border bg-cyan-500/10 text-cyan-400 border-cyan-500/30 ${sizeClasses}`}
          title="WAIT / Idle Condition"
        >
          {showIcon && <Clock size={iconSizes} className="text-cyan-400 shrink-0" />}
          <span>{customLabel || "WAIT"}</span>
        </span>
      );

    case "BLOCKED":
      return (
        <span
          className={`inline-flex items-center font-mono font-semibold rounded-md border bg-amber-500/10 text-amber-400 border-amber-500/30 ${sizeClasses}`}
          title="BLOCKED / Safety Guard Rejection"
        >
          {showIcon && <ShieldAlert size={iconSizes} className="text-amber-400 shrink-0" />}
          <span>{customLabel || "BLOCKED"}</span>
        </span>
      );

    case "ERROR":
      return (
        <span
          className={`inline-flex items-center font-mono font-semibold rounded-md border bg-rose-500/10 text-rose-400 border-rose-500/30 ${sizeClasses}`}
          title="ERROR / Backend Failure"
        >
          {showIcon && <AlertTriangle size={iconSizes} className="text-rose-400 shrink-0" />}
          <span>{customLabel || "ERROR"}</span>
        </span>
      );

    case "DEGRADED":
      return (
        <span
          className={`inline-flex items-center font-mono font-semibold rounded-md border bg-purple-500/10 text-purple-300 border-purple-500/30 ${sizeClasses}`}
          title="DEGRADED / Non-Persistent State"
        >
          {showIcon && <DatabaseZap size={iconSizes} className="text-purple-400 shrink-0" />}
          <span>{customLabel || "DEGRADED"}</span>
        </span>
      );

    default:
      return null;
  }
};
