export function formatCardDisplay(raw: string): string {
  const clean = String(raw || "").replace(/\D/g, "").slice(0, 19);
  return clean.replace(/(\d{4})(?=\d)/g, "$1-");
}

export function stripCardDigits(raw: string): string {
  return String(raw || "").replace(/\D/g, "").slice(0, 19);
}
