import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/" || pathname === "/app" || pathname.startsWith("/app/") || pathname === "/cookbook" || pathname.startsWith("/cookbook/") || ["/plan", "/shop", "/pantry"].includes(pathname) || pathname.startsWith("/assets/")) {
    return NextResponse.next();
  }
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!app(?:/|$)|cookbook(?:/|$)|plan$|shop$|pantry$|assets/|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
