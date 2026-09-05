import type { FraudEventType, FraudReviewStatus, FraudRiskLevel } from "@/types/api";

export const FRAUD_RISK_TONE: Record<FraudRiskLevel, string> = {
  low: "bg-muted text-muted-foreground border-border",
  medium: "bg-warning/10 text-warning border-warning/25",
  high: "bg-destructive/10 text-destructive border-destructive/20",
};

export const FRAUD_RISK_LABEL: Record<FraudRiskLevel, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export const FRAUD_REVIEW_STATUS_TONE: Record<FraudReviewStatus, string> = {
  open: "bg-warning/10 text-warning border-warning/25",
  approved: "bg-destructive/10 text-destructive border-destructive/20",
  rejected: "bg-muted text-muted-foreground border-border",
};

// "Approved" means the fraud concern was CONFIRMED (see FraudReview.Status's
// own docstring) -- it reads as a bad outcome for the user, so it gets the
// destructive tone, not success green. "Rejected" (false positive) is the
// good outcome, but still just neutral-muted rather than success, since nothing
// good "happened" -- it's a return to normal.
export const FRAUD_REVIEW_STATUS_LABEL: Record<FraudReviewStatus, string> = {
  open: "Open",
  approved: "Confirmed",
  rejected: "Dismissed",
};

export const FRAUD_EVENT_TYPE_LABEL: Record<FraudEventType, string> = {
  qr_reuse: "QR reuse",
  gps_mismatch: "GPS mismatch",
  too_many_checkins: "Too many check-ins",
  impossible_travel: "Impossible travel",
  multiple_accounts_device: "Multiple accounts on device",
  suspicious_pattern: "Suspicious pattern",
  device_anomaly: "Device anomaly",
  suspicious_account_creation: "Suspicious account creation",
  suspicious_reward_claim: "Suspicious reward claim",
};
