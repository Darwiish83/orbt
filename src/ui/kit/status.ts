import type { BadgeTone } from "@/ui/primitives";

/**
 * Status vocabulary shown in the UI kits, keyed by the English display label
 * (the same strings the EN/SO/AR dictionaries translate). Ported from the
 * design kit's STATUS_TONE.
 */
export const STATUS_TONE: Record<string, BadgeTone> = {
  "At Origin Store": "neutral",
  Departed: "warning",
  Pending: "neutral",
  "In Transit": "info",
  Transit: "info",
  Arrived: "brand",
  Delivered: "success",
  "On Hold": "warning",
  Paid: "success",
  "Partial Paid": "warning",
  Unpaid: "danger",
  Void: "neutral",
  Active: "success",
  Inactive: "neutral",
  Suspended: "danger",
  Scheduled: "accent",
  Sent: "brand",
  Draft: "neutral",
};

/** DB enum → design display label (operational vocabulary used inside the apps). */
export const SHIPMENT_STATUS_LABEL = {
  AT_ORIGIN_STORE: "At Origin Store",
  DEPARTED: "Departed",
  IN_TRANSIT: "Transit",
  ARRIVED: "Arrived",
} as const;

export const INVOICE_STATUS_LABEL = {
  UNPAID: "Unpaid",
  PARTIAL: "Partial Paid",
  PAID: "Paid",
  VOID: "Void",
} as const;

export const CUSTOMER_STATUS_LABEL = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  SUSPENDED: "Suspended",
} as const;

export const NOTIFICATION_STATUS_LABEL = {
  DRAFT: "Draft",
  SCHEDULED: "Scheduled",
  SENT: "Sent",
} as const;
