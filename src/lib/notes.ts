/**
 * Bullet auto-format helpers for notes textareas.
 *
 * Behavior (from the artifact + spec):
 *   - Typing `- ` at the start of a line auto-converts to `• ` (bullet + space)
 *   - Pressing Enter on a `• `-prefixed line continues the bullet on the next line
 *   - Pressing Enter on a line containing only `• ` (and nothing else) removes
 *     the bullet — i.e. exits list mode
 *
 * Returns `null` when the keystroke / input shouldn't be intercepted, or
 * `{ value, caret }` describing the post-change textarea state when it
 * should. Callers apply the change manually (so they can also call
 * preventDefault on the original event).
 */

const BULLET = "•"; // U+2022 BULLET — kept as a non-literal to dodge any
                        // mojibake risk in transit. (Same lesson as the artifact.)

/** The 2-char prefix that marks a bulleted line. */
export const BULLET_PREFIX = `${BULLET} `;

/**
 * Handle an `input` event firing because the user typed `- ` at the start of
 * a line. Returns the rewritten value + new caret offset, or null if the
 * event isn't a bullet-trigger.
 *
 * Recognizes both BOL (start of value) and after-newline ("\n- " prefix).
 */
export function maybeRewriteDashToBullet(
  value: string,
  caret: number,
): { value: string; caret: number } | null {
  // The just-typed " " sits at caret-1; the "-" at caret-2; line start at
  // caret-2 or after the previous "\n".
  if (caret < 2) return null;
  if (value.slice(caret - 2, caret) !== "- ") return null;

  // Verify the "-" is at start-of-line.
  const lineStart = value.lastIndexOf("\n", caret - 3) + 1;
  if (lineStart !== caret - 2) return null;

  const next =
    value.slice(0, caret - 2) + BULLET_PREFIX + value.slice(caret);
  return { value: next, caret: caret - 2 + BULLET_PREFIX.length };
}

/**
 * Handle Enter inside a textarea: if the current line starts with `• `,
 * insert a newline + `• ` (or strip the bullet if the line is empty).
 *
 * Pass the textarea's value + caret position. Returns null if Enter should
 * fall through to default behavior (newline insert), or the new {value, caret}.
 */
export function handleBulletEnter(
  value: string,
  caret: number,
): { value: string; caret: number } | null {
  const lineStart = value.lastIndexOf("\n", caret - 1) + 1;
  const lineToCaret = value.slice(lineStart, caret);
  if (!lineToCaret.startsWith(BULLET_PREFIX)) return null;

  // Empty bullet line — strip it (exit list mode).
  if (lineToCaret === BULLET_PREFIX) {
    const next = value.slice(0, lineStart) + value.slice(caret);
    return { value: next, caret: lineStart };
  }

  // Continue the bullet on the next line.
  const next =
    value.slice(0, caret) + "\n" + BULLET_PREFIX + value.slice(caret);
  return { value: next, caret: caret + 1 + BULLET_PREFIX.length };
}
