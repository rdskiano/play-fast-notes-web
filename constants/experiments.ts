// Reversible experiment toggles. Each flag documents what flipping it back
// restores, so a "let's test how this feels" change never has to be rebuilt
// from git archaeology.

// 2026-09-13 (Ralph): the passage screen's last-session row now always shows
// the note from the most recent session, so the "Remind me of this next
// time" checkbox in the end-of-session prompt may be redundant. false hides
// the checkbox (notes still save; nothing new gets flagged). The rest of the
// reminder machinery — PassageReminders, remindNext consumption, the noteChips
// action buttons — stays live so already-flagged notes behave as before and
// flipping this back to true restores the old flow unchanged.
export const REMIND_NEXT_CHECKBOX_ENABLED = false;
