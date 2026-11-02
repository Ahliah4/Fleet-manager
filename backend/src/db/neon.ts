import { neonConfig, types } from "@neondatabase/serverless";
import ws from "ws";

// Neon's serverless driver carries every pooled query and transaction over a
// secure WebSocket (wss://) to the Neon proxy. Direct TCP is never opened, which
// is what allows this API to run on networks that block or throttle port 5432.
//
// Some networks advertise IPv4 and IPv6 addresses where only one family can
// complete the TLS handshake. Node's happy-eyeballs race gives each attempt only
// 250 ms by default, which is too short for a Neon TLS handshake, so every
// attempt is abandoned and the connection fails with ETIMEDOUT. Extend the
// per-attempt budget rather than forcing a single address family.
class SecureNeonWebSocket extends ws {
  constructor(address: string | URL) {
    // `autoSelectFamilyAttemptTimeout` is a Node socket option that @types/ws
    // does not model, but it is forwarded to the TLS connection.
    const options = {
      handshakeTimeout: 15_000,
      autoSelectFamilyAttemptTimeout: 2_500,
    };
    super(address, undefined, options);
  }
}

neonConfig.webSocketConstructor = SecureNeonWebSocket;
neonConfig.useSecureWebSocket = true;

// Keep API reads on the pooled WebSocket session. The HTTP `neon()` transport
// cannot hold a session, so it must never be used for transactions or RLS
// context.
neonConfig.poolQueryViaFetch = false;

// Keep DATE values as YYYY-MM-DD strings so a server timezone cannot shift them.
types.setTypeParser(types.builtins.DATE!, (value) => value);
