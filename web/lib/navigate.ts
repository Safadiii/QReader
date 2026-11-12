/**
 * A full page load to another page of this site. Used around sign-in and
 * sign-out on purpose: every screen must restart with the new session, which
 * a client-side route change would not guarantee.
 */
export function reloadTo(path: string) {
  window.location.assign(path);
}
