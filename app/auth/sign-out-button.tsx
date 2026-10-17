import { signOut } from "./actions";

export function SignOutButton({ className = "" }: { className?: string }) {
  return (
    <form action={signOut}>
      <button type="submit" className={className || "rounded border border-foreground/20 px-4 py-2"}>
        Log out
      </button>
    </form>
  );
}
