// Master switch for the pre-signup onboarding funnel (the guided
// instrument → Bumblebee hook → rhythm variations → strategy payoff tour
// at /onboarding).
//
// BOXED OFF 2026-08-16, Ralph's call: new users get one clean setup screen
// (name + instrument + email + confirmed password) and land in an empty
// library. His reasoning: the funnel never fixed activation — people who
// don't yet understand why the app is valuable won't practice regardless,
// and the coming tutorial videos are the real "aha" channel. All funnel code
// stays in the repo untouched.
//
// To bring the funnel back: flip this to true. It re-opens every gated
// doorway at once:
//   - app/sign-in.tsx: the "Get started" tour button (web login footer)
//   - app/onboarding.tsx: the route itself (redirects to sign-in while off)
//   - app/(tabs)/library.tsx: the first-run redirect into the quiz + the
//     blank-screen hold while that decision loads
// The in-app "?" strategy demos on strategy cards are NOT gated by this —
// they're help for existing users and stay on.
export const ONBOARDING_FUNNEL_ENABLED = false;
