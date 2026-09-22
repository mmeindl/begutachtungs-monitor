/**
 * The two command-line shapes the scripts use, named apart.
 *
 * Both were written five times over, and they are NOT interchangeable: a
 * script that reads `--gp XXVII` sees nothing in `--gp=XXVII` and the other
 * way round. One `arg()` serving both would hide that, so the caller names
 * the shape it documents in its own `Usage:` line.
 */

/** `--name value`, as two argv entries. Null when the flag is absent or last. */
export function argPair(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : null
}

/** `--name=value`, as one argv entry. Null when the flag is absent. */
export function argAssigned(name: string): string | null {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null
}

/** Whether `--name` is there at all. */
export function argFlag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}
