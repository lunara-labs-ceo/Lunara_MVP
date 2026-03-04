"use client";

import { useEffect } from "react";
import { useAuth, useOrganizationList } from "@clerk/nextjs";

/**
 * Invisible component that ensures the user's session has an active organization.
 *
 * Clerk sessions don't automatically activate an org after sign-in — even if the
 * user belongs to one. Without an active org, the JWT won't include org_id, which
 * means the backend can't scope data to the organization.
 *
 * This component checks: if the user has org memberships but no active org on the
 * session, it calls setActive() on the first membership to activate it.
 */
export function OrgActivator() {
  const { orgId } = useAuth();
  const { userMemberships, setActive, isLoaded } = useOrganizationList({
    userMemberships: { pageSize: 1 },
  });

  useEffect(() => {
    if (!isLoaded) return;
    if (orgId) return; // Already has an active org

    const firstMembership = userMemberships?.data?.[0];
    if (firstMembership && setActive) {
      setActive({ organization: firstMembership.organization.id });
    }
  }, [isLoaded, orgId, userMemberships?.data, setActive]);

  return null;
}
