const PAYMENT_API = "http://localhost:5001";

async function startPayment({ provider, items, source }) {
  if (!items || !items.length) throw new Error("No items to pay for");

  if (provider === "card") {
    const res = await fetch(`${PAYMENT_API}/payments/stripe/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, source }),
    });

    if (!res.ok) throw new Error("Stripe checkout failed");
    const data = await res.json();
    window.location.href = data.url;
    return;
  }

  if (provider === "mfs") {
    const res = await fetch(`${PAYMENT_API}/payments/sslcommerz/init`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, source }),
    });

    if (!res.ok) throw new Error("MFS checkout failed");
    const data = await res.json();
    window.location.href = data.url;
    return;
  }

  throw new Error("Unknown payment provider");
}
