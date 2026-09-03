// Master switch for the coach's entry button — the "How should I practice?"
// / "Ready to practice?" hero card on passage detail (both the phone
// strategies panel and the default layout).
//
// OFF as of 2026-09-02 (Ralph's call): the coach's current brain misreads
// too much of real practice (COACH_SIGNAL_LOG.md D53/D57/D59/D63/D66), and
// the Roles & Phases redesign (ROLES_AND_PHASES_PLAN.md) replaces it.
// Nothing is deleted: /passage/[id]/coach and /evaluate stay routable by
// URL, every rule stays in lib/coach, and flipping this back relights the
// button exactly as it was.
export const COACH_BUTTON_ENABLED = false;
