/** Server-to-server calls from Ethos Employee (Phase 5+). */
export function assertEthosIntegrationAuthorized(request: Request): Response | null {
  const expected = process.env.ETHOS_INTEGRATION_API_KEY?.trim();
  if (!expected) {
    return Response.json(
      { ok: false, error: "ETHOS_INTEGRATION_API_KEY is not configured on the merchant app" },
      { status: 503 },
    );
  }

  const header = request.headers.get("Authorization")?.trim();
  const bearer = header?.startsWith("Bearer ") ? header.slice(7).trim() : null;
  const legacy = request.headers.get("X-Ethos-Integration-Key")?.trim();
  const provided = bearer || legacy;

  if (!provided || provided !== expected) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
