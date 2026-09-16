import type { SearchOptions } from './types'

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// The search as a regular expression; throws on an invalid expression.
export function compile(query: string, options: SearchOptions, global = true): RegExp {
  const source = options.regex ? query : escapeRegex(query)
  return new RegExp(source, (global ? 'g' : '') + (options.ignoreCase ? 'iu' : 'u'))
}

// What one hit becomes: the replacement itself, or with its $1 references filled in.
export function substitute(
  hit: string,
  query: string,
  options: SearchOptions,
  replacement: string
): string {
  if (!options.regex) return replacement
  try {
    return hit.replace(compile(query, options, false), replacement)
  } catch {
    return replacement
  }
}
