// Local server on Node: PORT=8787 PAY_TO=0x... NETWORK=base-sepolia npm run dev
import { createServer } from "node:http";
import { createApp } from "../src/app.js";

const app = createApp({
  price: process.env.PRICE || "0.01",
  payTo: process.env.PAY_TO || "0x40f100ccCF51EEA928a3f314fB6ab63Bf8fa51F3",
  network: (process.env.NETWORK as "base" | "base-sepolia") || "base-sepolia",
});
const port = Number(process.env.PORT || 8787);
createServer(async (req, res) => {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
  const r = await app.fetch(new Request(`http://localhost:${port}${req.url}`, { method: req.method, headers }));
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(Buffer.from(await r.arrayBuffer()));
}).listen(port, () => console.log(`x402 starter on http://localhost:${port}/paid`));
