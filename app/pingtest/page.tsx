// DIAGNOSTIC TEMPORAR — pagină minimală, fără niciun import de aplicație, ca să izolăm dacă
// randarea de pagini dinamice (Server Components) e stricată în general pe Vercel, sau doar
// pentru /login și /portal/login specific. De șters imediat după diagnosticare.
export const dynamic = "force-dynamic";

import AuthForm from "@/app/components/AuthForm";
import PortalLoginForm from "@/app/components/PortalLoginForm";
import { Suspense } from "react";

export default function PingTestPage() {
  return (
    <div>
      <p>pong {new Date().toISOString()}</p>
      <Suspense fallback="loading auth form">
        <AuthForm mode="login" />
      </Suspense>
      <PortalLoginForm />
    </div>
  );
}
