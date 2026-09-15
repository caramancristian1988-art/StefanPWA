// DIAGNOSTIC — pagină goală, dar în ACELAȘI route group "(auth)" ca /login (care crapă live).
// Dacă și asta crapă, problema e legată de group-ul de rută/layout-ul (auth), nu de conținutul
// paginii login în sine.
export const dynamic = "force-dynamic";

export default function PingTest2Page() {
  return <div>pong2 {new Date().toISOString()}</div>;
}
