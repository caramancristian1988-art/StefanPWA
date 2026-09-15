import { NextResponse, type NextRequest } from "next/server";

// DIAGNOSTIC TEMPORAR — proxy complet neutralizat (passthrough necondiționat), ca să izolăm
// dacă execuția middleware-ului însuși (posibil pe Edge Runtime pe Vercel, diferit de rularea
// locală prin `next start`) e cauza crash-ului "error in Server Components render" care afectează
// ORICE pagină dinamică (chiar și una complet goală, fără niciun import de aplicație) dar NU
// afectează rutele /api/* sau fișierele statice — exact setul de rute pe care matcher-ul de mai
// jos îl acoperă. De restaurat logica reală imediat după diagnosticare.
export function proxy(_req: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons|invoice/public|opengraph-image|twitter-image|.*\\.(?:png|svg|ico|webmanifest|js|json|txt)$).*)",
  ],
};
