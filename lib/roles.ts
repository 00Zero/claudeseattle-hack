// profiles.role_bucket, worded as "Which best describes you?" on /profile asks it.
// Team matching uses the same words; ROLE_SHORT is for badges and pills where space is tight.
export type RoleBucket = "owner" | "professional" | "student";

export const ROLE_LABEL: Record<RoleBucket, string> = {
  owner: "Business owner or founder",
  professional: "Experienced professional",
  student: "Student or recent grad",
};

export const ROLE_SHORT: Record<RoleBucket, string> = {
  owner: "Owner/founder",
  professional: "Professional",
  student: "Student/grad",
};
