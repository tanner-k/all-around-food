/**
 * Sign-in page — server component.
 *
 * Renders a minimal, on-brand card with a "Sign in with Google" button.
 * The form action calls signIn() server-side (no client JS needed).
 * No env access at module level.
 */

import { signIn } from "@/auth";

export const metadata = {
  title: "Sign in — All Around Food",
};

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-paper p-8 shadow-sm">
        {/* Brand mark */}
        <h1 className="mb-1 font-serif italic text-2xl text-terra tracking-tight">
          All Around Food
        </h1>
        <p className="mb-8 text-sm text-ink-soft">
          Sign in to your account to continue.
        </p>

        {/* Google sign-in form */}
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/plan" });
          }}
        >
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-3 rounded-lg bg-terra px-4 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-terra/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terra focus-visible:ring-offset-2"
          >
            {/* Google icon (SVG inline to avoid extra dep) */}
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-4 w-4 shrink-0 fill-current"
            >
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Sign in with Google
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-ink-mute">
          Access is restricted to approved accounts.
        </p>
      </div>
    </div>
  );
}
