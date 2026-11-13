import { onRequestGet as __api_cantonhymn_ts_onRequestGet } from "/Users/kazaflee/Documents/worshiplive/functions/api/cantonhymn.ts"

export const routes = [
    {
      routePath: "/api/cantonhymn",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_cantonhymn_ts_onRequestGet],
    },
  ]