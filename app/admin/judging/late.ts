// Grace period for late saves: those made up to this long after submissions_close_at are
// accepted in one click on /admin/judging (acceptLateInGrace); later ones wait for an admin's
// decision. The /submit save path doesn't use it.
export const LATE_GRACE_MINUTES = 15;

export function graceCutoff(submissionsCloseAt: string) {
  return new Date(new Date(submissionsCloseAt).getTime() + LATE_GRACE_MINUTES * 60_000);
}
