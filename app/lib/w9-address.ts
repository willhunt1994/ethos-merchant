export type W9AddressParts = {
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export const EMPTY_W9_ADDRESS: W9AddressParts = {
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "United States",
};

const CITY_STATE_ZIP =
  /^(.+?),\s*([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)(?:\s+[A-Za-z]{2})?$/;

export function parseW9BusinessAddress(raw: string | null | undefined): W9AddressParts {
  const trimmed = raw?.trim();
  if (!trimmed) return { ...EMPTY_W9_ADDRESS };

  const lines = trimmed.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { ...EMPTY_W9_ADDRESS };

  let country = "United States";
  let city = "";
  let state = "";
  let postalCode = "";
  const streetLines: string[] = [...lines];

  const last = streetLines[streetLines.length - 1] ?? "";
  const cityMatch = last.match(CITY_STATE_ZIP);
  if (cityMatch) {
    streetLines.pop();
    city = cityMatch[1]?.trim() ?? "";
    state = cityMatch[2]?.toUpperCase() ?? "";
    postalCode = cityMatch[3] ?? "";
  } else if (streetLines.length >= 2) {
    const maybeCountry = streetLines[streetLines.length - 1] ?? "";
    const prev = streetLines[streetLines.length - 2] ?? "";
    const prevMatch = prev.match(CITY_STATE_ZIP);
    if (prevMatch && maybeCountry.length > 2 && !maybeCountry.includes(",")) {
      country = maybeCountry;
      streetLines.pop();
      streetLines.pop();
      city = prevMatch[1]?.trim() ?? "";
      state = prevMatch[2]?.toUpperCase() ?? "";
      postalCode = prevMatch[3] ?? "";
    }
  }

  const addressLine1 = streetLines[0] ?? "";
  const addressLine2 = streetLines.slice(1).join(", ");

  return {
    addressLine1,
    addressLine2,
    city,
    state,
    postalCode,
    country: country || "United States",
  };
}

export function formatW9BusinessAddress(parts: W9AddressParts): string {
  const lineCity = [parts.city.trim(), parts.state.trim(), parts.postalCode.trim()]
    .filter(Boolean)
    .join(", ")
    .replace(/,\s*,/g, ",");

  const cityStateZip =
    parts.city.trim() && parts.state.trim()
      ? `${parts.city.trim()}, ${parts.state.trim()} ${parts.postalCode.trim()}`.trim()
      : lineCity;

  return [
    parts.addressLine1.trim(),
    parts.addressLine2.trim(),
    cityStateZip,
    parts.country.trim() || "United States",
  ]
    .filter(Boolean)
    .join("\n");
}

export function w9AddressFromFormData(form: FormData): W9AddressParts {
  return {
    addressLine1: String(form.get("addressLine1") ?? "").trim(),
    addressLine2: String(form.get("addressLine2") ?? "").trim(),
    city: String(form.get("city") ?? "").trim(),
    state: String(form.get("state") ?? "")
      .trim()
      .toUpperCase()
      .slice(0, 2),
    postalCode: String(form.get("postalCode") ?? "").trim(),
    country: String(form.get("country") ?? "").trim() || "United States",
  };
}

export function validateW9Address(parts: W9AddressParts): string | null {
  if (!parts.addressLine1) return "Street address is required.";
  if (!parts.city) return "City is required.";
  if (!parts.state || parts.state.length !== 2) return "State must be a 2-letter code.";
  if (!parts.postalCode) return "ZIP code is required.";
  return null;
}
