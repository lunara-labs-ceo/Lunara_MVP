"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";

export async function completeOnboarding() {
  const { userId } = await auth();

  if (!userId) {
    return { error: "Not authenticated" };
  }

  const client = await clerkClient();

  try {
    await client.users.updateUser(userId, {
      publicMetadata: {
        onboardingComplete: true,
      },
    });
    return { success: true };
  } catch (err) {
    return { error: "Failed to update user metadata." };
  }
}
