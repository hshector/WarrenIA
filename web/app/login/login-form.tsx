"use client";

import { useActionState } from "react";

import { Button, Input } from "@/components/ui/primitives";

import { sendMagicLink, type LoginState } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />
      <label className="t-label" htmlFor="email">Email</label>
      <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
      <Button variant="primary" type="submit" disabled={pending} className="mt-1">
        {pending ? "Sending…" : "Email me a sign-in link"}
      </Button>
      {state && <p className={state.ok ? "text-[13px] text-ink-2" : "text-[13px] text-neg"}>{state.message}</p>}
    </form>
  );
}
