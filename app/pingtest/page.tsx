// DIAGNOSTIC TEMPORAR — pagină minimală, fără niciun import de aplicație, ca să izolăm dacă
// randarea de pagini dinamice (Server Components) e stricată în general pe Vercel, sau doar
// pentru /login și /portal/login specific. De șters imediat după diagnosticare.
export const dynamic = "force-dynamic";

export default async function PingTestPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  const { reset } = await searchParams;
  return (
    <div>
      pong3 {new Date().toISOString()} reset={String(reset)}
    </div>
  );
}
