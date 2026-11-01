export function validPushSubscription(
  value: any,
): value is { endpoint: string; keys: { p256dh: string; auth: string } } {
  if (
    !value ||
    typeof value.endpoint !== "string" ||
    value.endpoint.length >= 2048 ||
    !value.keys ||
    !/^[A-Za-z0-9_-]{87}$/.test(value.keys.p256dh) ||
    !/^[A-Za-z0-9_-]{22}$/.test(value.keys.auth)
  )
    return false;
  try {
    const url = new URL(value.endpoint);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hash &&
      !url.search &&
      url.pathname.length > 1 &&
      /^(fcm\.googleapis\.com|([a-z0-9-]+\.)?push\.services\.mozilla\.com|([a-z0-9-]+\.)?push\.apple\.com)$/.test(
        url.hostname,
      )
    );
  } catch {
    return false;
  }
}
