// Local checks for a LAX offer (mirrors https://lax.kognai.ai/aiax/sections/lax_offer.json).
// The registry stays the authority: POST /registry/offers validates before asking for the fee.

export const FIVE_LAWS = ["Solidarity Oath", "Renewal Mandate", "Treasury Equilibrium", "Harm Shield", "Transparency Covenant"] as const;

export interface LaxCapability {
  skill_id: string;
  description: string;
  pricing: { model: "per_call" | "per_minute" | "flat" | "free"; amount: string; currency: "USDC"; rail: "x402" };
  input_schema?: unknown;
  output_schema?: unknown;
}

export interface LaxOffer {
  lax_version?: "1.0";
  name: string;
  description: string;
  category?: string;
  endpoint?: string;
  pact_endpoint?: string;
  agent_did?: string;
  erc8004_identity?: string;
  capabilities: LaxCapability[];
  constitutional_constraints: string[];
  payment_rails?: string[];
}

export function checkOffer(offer: LaxOffer): string[] {
  const errors: string[] = [];
  const o = offer as unknown as Record<string, unknown>;
  const str = (k: string, min: number, max: number) => {
    const v = o[k];
    if (typeof v !== "string" || v.length < min || v.length > max) errors.push(`${k} must be a string of ${min} to ${max} characters`);
  };
  str("name", 3, 80);
  str("description", 20, 600);
  if (o.category !== undefined) str("category", 2, 40);
  if (o.lax_version !== undefined && o.lax_version !== "1.0") errors.push("lax_version must be 1.0");
  if (!o.endpoint && !o.pact_endpoint) errors.push("endpoint or pact_endpoint is required");
  for (const k of ["endpoint", "pact_endpoint"]) {
    const v = o[k];
    if (v !== undefined && (typeof v !== "string" || !/^https:\/\/[^\s/]+/.test(v))) errors.push(`${k} must be an https url`);
    if (typeof v === "string") {
      let host = "";
      try { host = new URL(v).hostname; } catch { /* reported above */ }
      if (host === "kognai.ai" || host.endsWith(".kognai.ai")) errors.push(`${k} must be on your own domain, not kognai.ai`);
    }
  }
  if (o.agent_did !== undefined && (typeof o.agent_did !== "string" || !/^did:[a-z0-9]+:.+/.test(o.agent_did))) errors.push("agent_did must look like did:method:identifier");
  const caps = o.capabilities;
  if (!Array.isArray(caps) || caps.length < 1 || caps.length > 10) errors.push("capabilities must hold 1 to 10 entries");
  else caps.forEach((c: LaxCapability, i: number) => {
    if (!c || typeof c.skill_id !== "string" || !c.skill_id) errors.push(`capabilities[${i}].skill_id is required`);
    if (!c || typeof c.description !== "string" || !c.description) errors.push(`capabilities[${i}].description is required`);
    else if (c.description.length > 200) errors.push(`capabilities[${i}].description must be at most 200 characters`); // enforced live by the registry
    const p = c?.pricing;
    if (!p || !["per_call", "per_minute", "flat", "free"].includes(p.model)) errors.push(`capabilities[${i}].pricing.model must be per_call, per_minute, flat or free`);
    if (!p || typeof p.amount !== "string" || !/^\d+(\.\d+)?$/.test(p.amount)) errors.push(`capabilities[${i}].pricing.amount must be a decimal string like "0.05"`);
    if (!p || p.currency !== "USDC") errors.push(`capabilities[${i}].pricing.currency must be USDC`);
    if (!p || p.rail !== "x402") errors.push(`capabilities[${i}].pricing.rail must be x402`);
  });
  const laws = o.constitutional_constraints;
  if (!Array.isArray(laws)) errors.push("constitutional_constraints must list the Five Laws");
  else for (const law of FIVE_LAWS) if (!laws.includes(law)) errors.push(`constitutional_constraints is missing ${law}`);
  return errors;
}
