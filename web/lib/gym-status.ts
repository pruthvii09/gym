import type { GymStatus } from "@/types/api";

// Shared between app/dashboard and app/admin/gyms so the two surfaces can't
// visually drift on what a gym status means.
export const GYM_STATUS_TONE: Record<GymStatus, string> = {
  pending: "bg-warning/10 text-warning border-warning/25",
  active: "bg-success/10 text-success border-success/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
  inactive: "bg-muted text-muted-foreground border-border",
};

export const GYM_STATUS_LABEL: Record<GymStatus, string> = {
  pending: "Pending review",
  active: "Active",
  rejected: "Rejected",
  inactive: "Inactive",
};
