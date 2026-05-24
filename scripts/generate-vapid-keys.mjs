import { webcrypto } from "node:crypto";

const { subtle } = webcrypto;
const pair = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
  "sign",
  "verify",
]);
const publicBytes = new Uint8Array(await subtle.exportKey("raw", pair.publicKey));
const privateJwk = await subtle.exportKey("jwk", pair.privateKey);

function base64Url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

if (!privateJwk.d) {
  throw new Error("Nao foi possivel gerar a chave privada VAPID.");
}

console.log(`VAPID_PUBLIC_KEY=${base64Url(publicBytes)}`);
console.log(`VAPID_PRIVATE_KEY=${privateJwk.d}`);
console.log("VAPID_SUBJECT=mailto:suporte@sistema-transjap.com.br");
