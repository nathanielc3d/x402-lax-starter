// Shared x402 version 1 types (exact scheme, USDC on Base).

export type Network = "base" | "base-sepolia";

export interface PaymentRequirements {
  scheme: "exact";
  network: Network;
  maxAmountRequired: string; // atomic USDC units, 6 decimals
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra?: { name: string; version: string };
  outputSchema?: unknown;
}

export interface PaymentRequired {
  x402Version: number;
  error: string;
  accepts: PaymentRequirements[];
}

export interface VerifyResult {
  isValid: boolean;
  invalidReason?: string;
  payer?: string;
}

export interface SettleResult {
  success: boolean;
  transaction: string;
  network: string;
  errorReason?: string;
  payer?: string;
}

export interface Facilitator {
  verify(paymentPayload: unknown, paymentRequirements: PaymentRequirements): Promise<VerifyResult>;
  settle(paymentPayload: unknown, paymentRequirements: PaymentRequirements): Promise<SettleResult>;
}

export interface AppConfig {
  /** decimal USDC string, for example "0.01" */
  price: string;
  /** EVM address that receives the USDC */
  payTo: string;
  network: Network;
  /** verify and settle; defaults to HTTP calls to FACILITATOR_URL or https://x402.org/facilitator */
  facilitator?: Facilitator;
  description?: string;
  /** the paid work; runs only after the payment is verified and settled */
  work?: (request: Request) => Promise<unknown> | unknown;
  maxTimeoutSeconds?: number;
}
