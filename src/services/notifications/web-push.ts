import { createCipheriv, createECDH, createHmac, createPrivateKey, randomBytes, sign } from "crypto";
import type { AppNotification, PushSubscriptionInput } from "@/types/notifications";

interface PushPayload {
  body: string;
  icon: string;
  badge: string;
  notificationId: string;
  type: string;
  title: string;
  url: string;
}

export type PushSendResult = "sent" | "gone" | "failed";

function base64UrlToBuffer(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="), "base64");
}

function bufferToBase64Url(value: Buffer) {
  return value.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function hkdfExpand(prk: Buffer, info: Buffer | string, length: number) {
  const infoBuffer = Buffer.isBuffer(info) ? info : Buffer.from(info);
  const chunks: Buffer[] = [];
  let previous = Buffer.alloc(0);
  let counter = 1;

  while (Buffer.concat(chunks).length < length) {
    previous = createHmac("sha256", prk).update(Buffer.concat([previous, infoBuffer, Buffer.from([counter])])).digest();
    chunks.push(previous);
    counter += 1;
  }

  return Buffer.concat(chunks).subarray(0, length);
}

function vapidHeaders(endpoint: string) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    throw new Error("Missing VAPID configuration");
  }

  const endpointUrl = new URL(endpoint);
  const aud = `${endpointUrl.protocol}//${endpointUrl.host}`;
  const exp = Math.floor(Date.now() / 1000) + 12 * 60 * 60;
  const privateEcdh = createECDH("prime256v1");
  privateEcdh.setPrivateKey(base64UrlToBuffer(privateKey));
  const publicPoint = base64UrlToBuffer(publicKey);
  const x = publicPoint.subarray(1, 33);
  const y = publicPoint.subarray(33, 65);
  const key = createPrivateKey({
    key: {
      crv: "P-256",
      d: privateKey,
      ext: true,
      key_ops: ["sign"],
      kty: "EC",
      x: bufferToBase64Url(x),
      y: bufferToBase64Url(y)
    },
    format: "jwk"
  });
  const header = bufferToBase64Url(Buffer.from(JSON.stringify({ alg: "ES256", typ: "JWT" })));
  const body = bufferToBase64Url(Buffer.from(JSON.stringify({ aud, exp, sub: subject })));
  const signature = bufferToBase64Url(sign("sha256", Buffer.from(`${header}.${body}`), key));

  return {
    Authorization: `vapid t=${header}.${body}.${signature}, k=${publicKey}`
  };
}

function encryptPayload(subscription: PushSubscriptionInput, payload: PushPayload) {
  const receiverPublicKey = base64UrlToBuffer(subscription.p256dh);
  const authSecret = base64UrlToBuffer(subscription.auth);
  const salt = randomBytes(16);
  const localKey = createECDH("prime256v1");
  localKey.generateKeys();
  const localPublicKey = localKey.getPublicKey();
  const sharedSecret = localKey.computeSecret(receiverPublicKey);
  const prkKey = createHmac("sha256", authSecret).update(sharedSecret).digest();
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), receiverPublicKey, localPublicKey]);
  const ikm = hkdfExpand(prkKey, keyInfo, 32);
  const prk = createHmac("sha256", salt).update(ikm).digest();
  const cek = hkdfExpand(prk, "Content-Encoding: aes128gcm\0", 16);
  const nonce = hkdfExpand(prk, "Content-Encoding: nonce\0", 12);
  const plainText = Buffer.concat([Buffer.from(JSON.stringify(payload)), Buffer.from([2])]);
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const encrypted = Buffer.concat([cipher.update(plainText), cipher.final(), cipher.getAuthTag()]);

  return {
    body: Buffer.concat([salt, Buffer.from([0, 0, 16, 0]), Buffer.from([localPublicKey.length]), localPublicKey, encrypted]),
    publicKey: localPublicKey
  };
}

export async function sendWebPush(subscription: PushSubscriptionInput, notification: AppNotification): Promise<PushSendResult> {
  try {
    const url = notification.destinationUrl ?? "/notifications";
    const payload: PushPayload = {
      title: notification.title,
      body: notification.body,
      url,
      notificationId: notification.id,
      type: notification.type,
      icon: "/icons/icon-192.png",
      badge: "/icons/favicon-32.png"
    };
    const encrypted = encryptPayload(subscription, payload);
    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        ...vapidHeaders(subscription.endpoint),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: "2419200",
        Urgency: "normal"
      },
      body: encrypted.body
    });

    if (response.status === 404 || response.status === 410) {
      return "gone";
    }

    return response.ok ? "sent" : "failed";
  } catch (error) {
    console.error("[push] Delivery failed", {
      message: error instanceof Error ? error.message : String(error)
    });
    return "failed";
  }
}
