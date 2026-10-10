"use client";

import { useActionState } from "react";

import { Button, Input } from "@/components/ui/primitives";

import { sendMagicLink, type LoginState } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />
      <label className="t-label" htmlFor="email">Correo electrónico</label>
      <Input id="email" name="email" type="email" autoComplete="email" required placeholder="tu@correo.com" />
      <Button variant="primary" type="submit" disabled={pending} className="mt-1">
        {pending ? "Enviando…" : "Enviar enlace de acceso"}
      </Button>
      {state && <p className={state.ok ? "text-[13px] text-ink-2" : "text-[13px] text-neg"}>{state.message}</p>}
    </form>
  );
}
