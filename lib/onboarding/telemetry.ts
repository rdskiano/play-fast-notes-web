// Onboarding is a web-only flow today (native is a fast-follow), so this is a
// no-op. It exists so shared screens can call logOnboardingStep unconditionally
// without a Platform check, matching the .web.ts signature.
export async function logOnboardingStep(
  _step: string,
  _meta?: Record<string, unknown>,
): Promise<void> {
  // no-op on native
}
