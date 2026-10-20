// An editor's own branches start with the name part of their email, e.g. lars/ for
// lars@conclude.io: new branches get it, and only such branches may be deleted.
export function branchPrefix(email: string | undefined): string {
  return (email?.split('@')[0] ?? 'me').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '/'
}
