import { createServerFn } from "@tanstack/react-start";
import { requireServerAuthUser } from "@/lib/api/auth";

export type PushSubscriptionInput = {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
};

export const getPushConfiguration = createServerFn({ method: "GET" }).handler(async () => {
  await requireServerAuthUser();
  const { getPushPublicConfiguration } = await import("@/lib/api/push.server");
  return getPushPublicConfiguration();
});

export const subscribePushNotifications = createServerFn({ method: "POST" })
  .inputValidator((subscription: PushSubscriptionInput) => subscription)
  .handler(async ({ data }) => {
    const user = await requireServerAuthUser();
    const { saveUserPushSubscription } = await import("@/lib/api/push.server");
    return saveUserPushSubscription(user, data);
  });

export const unsubscribePushNotifications = createServerFn({ method: "POST" })
  .inputValidator((input: { endpoint: string }) => input)
  .handler(async ({ data }) => {
    const user = await requireServerAuthUser();
    const { removeUserPushSubscription } = await import("@/lib/api/push.server");
    return removeUserPushSubscription(user, data.endpoint);
  });
