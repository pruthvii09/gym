"use client";

import { useState } from "react";
import { UserPlus, UserCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { followUser, unfollowUser } from "@/lib/api/social";

export function FollowButton({
  username,
  initialFollowing,
  onChange,
}: {
  username: string;
  initialFollowing: boolean;
  onChange?: (following: boolean) => void;
}) {
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, setPending] = useState(false);

  const toggle = () => {
    // Optimistic: flip immediately, roll back only if the request fails --
    // this is a low-stakes toggle (like/follow), not worth a loading spinner.
    const next = !following;
    setFollowing(next);
    setPending(true);
    const request = next ? followUser(username) : unfollowUser(username);
    request
      .then(() => onChange?.(next))
      .catch(() => setFollowing(!next))
      .finally(() => setPending(false));
  };

  return (
    <Button variant={following ? "outline" : "gradient"} disabled={pending} onClick={toggle}>
      {following ? <UserCheck /> : <UserPlus />}
      {following ? "Following" : "Follow"}
    </Button>
  );
}
