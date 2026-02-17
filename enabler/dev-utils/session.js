const projectKey = process.env.CTP_PROJECT_KEY;

const fetchAdminToken = async () => {
  const myHeaders = new Headers();

  myHeaders.append('Authorization', `Basic ${btoa(`${process.env.CTP_CLIENT_ID}:${process.env.CTP_CLIENT_SECRET}`)}`);
  myHeaders.append('Content-Type', 'application/x-www-form-urlencoded');

  var urlencoded = new URLSearchParams();
  urlencoded.append('grant_type', 'client_credentials');
  //urlencoded.append('scope', __VITE_ADMIN_SCOPE__);

  const response = await fetch(`${process.env.CTP_AUTH_URL}/oauth/token`, {
    body: urlencoded,
    headers: myHeaders,
    method: 'POST',
    redirect: 'follow',
  });

  const token = await response.json();

  if (response.status !== 200) {
    return;
  } else {
  }
  return token.access_token;
}

const getSessionId = async(cartId) => {
  const accessToken = await fetchAdminToken();

  const sessionMetadata = {
    processorUrl: process.env.CTP_PROCESSOR_URL,
    allowedPaymentMethods: ["card", "invoice", "purchaseorder", "dropin","applepay","googlepay"], // add here your allowed methods for development purposes
  };

  const url = `${process.env.CTP_SESSION_URL}/${projectKey}/sessions`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      cart: {
        cartRef: {
          id: cartId,
        }
      },
      metadata: sessionMetadata,
    }),
  });
  const data = await res.json();

  if (!res.ok) {
    throw new Error("Not able to create session")
  }

  return data.id;
}
