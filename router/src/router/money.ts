/**
 * Turning a cost into something a person can feel.
 *
 * Costs are held as whole cents. That keeps the arithmetic exact, which money
 * in floating point is not: 0.1 + 0.2 is famously not 0.3, and a route card
 * that adds up three attempts would eventually print something absurd.
 *
 * The prices themselves are made up. What is real is the ratio between them,
 * which is roughly what you see across AI companies: the strongest model costs
 * something like twenty times the cheapest. They used to be called "units",
 * which nobody could picture. A cent is a thing people already know the size of.
 */

/**
 * A cost in cents, written as money.
 *
 *   1     -> $0.01
 *   20    -> $0.20
 *   700   -> $7
 *   1250  -> $12.50
 *   20000 -> $200
 *
 * Under a dollar always keeps both decimal places, because "$0.2" looks like a
 * typo. A whole number of dollars drops them, because "$200.00" on a slide is
 * two characters of noise on a number people are meant to read from the back
 * of a room.
 */
export function formatCost(cents: number): string {
  const dollars = cents / 100;
  if (cents < 100) return `$${dollars.toFixed(2)}`;
  if (cents % 100 === 0) return `$${(cents / 100).toLocaleString("en-US")}`;
  return `$${dollars.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
