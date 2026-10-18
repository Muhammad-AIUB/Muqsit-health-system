// Who is signed in on this page, for code outside React that must never act for
// anyone else. `AuthContext` keeps it current (a sign-in, a logout, a session
// lost). First reader: Revision Notes held across a tab switch are sent only
// while their OWN user is signed in — on a shared PC they were sent under the
// next user's session and became that user's notebook (release review,
// 18/10/2026).

let current: string | null = null;

export function setSignedInUser(id: string | null): void {
  current = id;
}

export function signedInUser(): string | null {
  return current;
}
