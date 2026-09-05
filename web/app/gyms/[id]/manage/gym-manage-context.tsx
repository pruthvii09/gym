"use client";

import { createContext, useContext } from "react";

import type { GymMembershipRole, GymMembershipSummary, GymSummary } from "@/types/api";

export interface GymManageContextValue {
  gymId: string;
  role: GymMembershipRole;
  gym: GymSummary;
  // Every gym this user has staff-tier access to (including this one) --
  // powers the gym switcher in the header. Not just "the other ones" so the
  // switcher can render its full list from context alone.
  staffMemberships: GymMembershipSummary[];
  refresh: () => void;
}

export const GymManageContext = createContext<GymManageContextValue | null>(null);

export function useGymManageContext() {
  const ctx = useContext(GymManageContext);
  if (!ctx) {
    throw new Error("useGymManageContext must be used within the gym manage layout");
  }
  return ctx;
}
