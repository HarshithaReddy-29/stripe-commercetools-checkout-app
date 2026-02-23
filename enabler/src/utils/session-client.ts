type CreateSessionArgs = {
  projectKey: string;
  authUrl: string;         // e.g. https://auth.us-central1.gcp.commercetools.com
  sessionUrl: string;      // e.g. https://session.us-central1.gcp.commercetools.com
  clientId: string;
  clientSecret: string;

  cartId: string;
  processorUrl: string;    // your connector service base url
  allowedPaymentMethods: string[];
};

export async function fetchAdminToken(args: Pick<CreateSessionArgs, "authUrl" | "clientId" | "clientSecret">) {
  const tokenUrl = `${args.authUrl}/oauth/token`;

  const body = new URLSearchParams();
  body.append("grant_type", "client_credentials");

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${args.clientId}:${args.clientSecret}`)}`,
    },
    body,
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to fetch admin token: ${res.status} ${txt}`);
  }

  const json = await res.json();
  return json.access_token as string;
}

export async function createSession(args: CreateSessionArgs) {
  const accessToken = await fetchAdminToken({
    authUrl: args.authUrl,
    clientId: args.clientId,
    clientSecret: args.clientSecret,
  });

  const url = `${args.sessionUrl}/${args.projectKey}/sessions`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      cart: {
        cartRef: { id: args.cartId, type: "cart" },
      },
      metadata: {
        processorUrl: args.processorUrl,
        allowedPaymentMethods: args.allowedPaymentMethods,
      },
    }),
  });

  const json = await res.json();

  if (!res.ok) {
    throw new Error(`Failed to create session: ${res.status} ${JSON.stringify(json)}`);
  }

  return json.id as string; // this is your x-session-id
}