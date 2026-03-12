import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

const isOnboardingRoute = createRouteMatcher(["/onboarding(.*)"]);
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/pricing",
  "/security",
  "/about",
  "/contact",
  "/demo",
  "/changelog",
  "/legal(.*)",
  "/product(.*)",
  "/blog(.*)",
  "/docs(.*)",
  "/use-cases(.*)",
  "/compare(.*)",
]);

export default clerkMiddleware(async (auth, req: NextRequest) => {
  const { userId, orgId, sessionClaims, redirectToSignIn } = await auth();

  // Allow onboarding route for authenticated users (even without onboardingComplete)
  if (userId && isOnboardingRoute(req)) {
    return NextResponse.next();
  }

  // Public routes — no auth required
  if (isPublicRoute(req)) {
    return NextResponse.next();
  }

  // Not authenticated — redirect to sign-in
  if (!userId) {
    return redirectToSignIn({ returnBackUrl: req.url });
  }

  // Authenticated but hasn't completed onboarding — redirect to onboarding
  // Also check orgId: if user has an active org, they've onboarded
  // (covers the race condition where metadata hasn't propagated to the JWT yet)
  if (
    !sessionClaims?.metadata?.onboardingComplete &&
    !orgId &&
    !isOnboardingRoute(req)
  ) {
    const onboardingUrl = new URL("/onboarding", req.url);
    return NextResponse.redirect(onboardingUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
