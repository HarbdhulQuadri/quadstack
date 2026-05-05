import * as p from "@clack/prompts";
import { readFile } from "fs/promises";
import path from "path";
import pc from "picocolors";

import { writeGeneratedFiles } from "../generators/files";
import { logger } from "../utils/logger";

/** Detect the package scope from the nearest package.json in the workspace */
async function detectScope(cwd: string): Promise<string> {
  try {
    const raw = await readFile(path.join(cwd, "package.json"), "utf-8");
    const pkg = JSON.parse(raw) as { name?: string };
    // name is "quadstack" (monorepo root) — use it as scope
    return pkg.name ?? "quadstack";
  } catch {
    return "quadstack";
  }
}

async function detectApiUrl(cwd: string): Promise<string> {
  try {
    const raw = await readFile(path.join(cwd, ".env"), "utf-8");
    const match = raw.match(/NEXT_PUBLIC_WEB_URL=(.+)/);
    return match?.[1]?.trim() ?? "http://localhost:3000";
  } catch {
    return "http://localhost:3000";
  }
}

export async function addMobile(cwd: string): Promise<void> {
  console.log();
  p.intro(pc.bold(pc.bgMagenta(pc.white("  add mobile  "))));

  const scope = await detectScope(cwd);
  const defaultApiUrl = await detectApiUrl(cwd);

  const apiUrl = await p.text({
    message: "API base URL (where your web app runs)",
    placeholder: defaultApiUrl,
    defaultValue: defaultApiUrl,
  });

  if (p.isCancel(apiUrl)) { p.cancel("Cancelled."); process.exit(0); }

  const appSlug = await p.text({
    message: "App slug (used for deep links, e.g. com.yourco.app)",
    placeholder: `com.${scope}.app`,
    defaultValue: `com.${scope}.app`,
  });

  if (p.isCancel(appSlug)) { p.cancel("Cancelled."); process.exit(0); }

  logger.step("Generating Expo app...");

  const files = generateExpoFiles(scope, String(apiUrl), String(appSlug));
  await writeGeneratedFiles(cwd, files);

  logger.success("apps/expo created");

  p.outro(pc.bold(pc.green("Mobile app added!")));

  console.log(`
  ${pc.bold("Next steps:")}

    ${pc.cyan("pnpm install")}
    ${pc.cyan("pnpm dev")}                          ${pc.dim("# starts web + admin + expo together")}
    ${pc.dim("# or")}
    ${pc.cyan("cd apps/expo && pnpm start")}

  ${pc.bold("On device:")}
    Install ${pc.underline("Expo Go")} and scan the QR code.
    For production builds use ${pc.cyan("eas build")}.

  ${pc.bold("Auth deep links:")}
    Register ${pc.cyan(String(appSlug))} as a URI scheme in your OAuth provider.
  `);
}

// ─── File generator ───────────────────────────────────────────────────────────

function generateExpoFiles(
  scope: string,
  apiUrl: string,
  appSlug: string,
): Record<string, string> {
  return {
    // ── package.json ──────────────────────────────────────────────────────────
    "apps/expo/package.json": JSON.stringify({
      name: `@${scope}/expo`,
      version: "0.0.0",
      private: true,
      main: "expo-router/entry",
      scripts: {
        start:   "expo start",
        android: "expo start --android",
        ios:     "expo start --ios",
        build:   "eas build",
      },
      dependencies: {
        [`@${scope}/api`]:        "workspace:*",
        [`@${scope}/validators`]: "workspace:*",
        "@orpc/client":           "^1.14.1",
        "@orpc/react":            "^1.14.1",
        "@tanstack/react-query":  "^5.75.0",
        "better-auth":            "^1.2.7",
        "expo":                   "~54.0.0",
        "expo-linking":           "~7.0.0",
        "expo-router":            "~4.0.0",
        "expo-secure-store":      "~14.0.0",
        "expo-status-bar":        "~2.0.0",
        "nativewind":             "^4.1.23",
        "react":                  "^19.0.0",
        "react-native":           "0.76.0",
        "react-native-safe-area-context": "^4.14.0",
        "react-native-screens":   "^4.4.0",
        "zod":                    "^3.24.2",
      },
      devDependencies: {
        [`@${scope}/tsconfig`]:   "workspace:*",
        "@babel/core":            "^7.25.0",
        "@types/react":           "^19.0.0",
        "babel-preset-expo":      "~12.0.0",
        "tailwindcss":            "^3.4.0",
        "typescript":             "^5.8.3",
      },
    }, null, 2),

    // ── app.json ──────────────────────────────────────────────────────────────
    "apps/expo/app.json": JSON.stringify({
      expo: {
        name:   scope,
        slug:   scope,
        scheme: appSlug,
        version: "1.0.0",
        orientation: "portrait",
        icon: "./assets/icon.png",
        splash: { image: "./assets/splash.png", resizeMode: "contain", backgroundColor: "#ffffff" },
        ios:     { supportsTablet: true, bundleIdentifier: appSlug },
        android: { adaptiveIcon: { foregroundImage: "./assets/adaptive-icon.png", backgroundColor: "#ffffff" }, package: appSlug },
        plugins: ["expo-router", "expo-secure-store"],
        experiments: { typedRoutes: true },
      },
    }, null, 2),

    // ── tsconfig.json ─────────────────────────────────────────────────────────
    "apps/expo/tsconfig.json": JSON.stringify({
      extends: `@${scope}/tsconfig/base.json`,
      compilerOptions: {
        jsx: "react-native",
        moduleResolution: "bundler",
        allowImportingTsExtensions: true,
        strict: true,
        paths: { "~/*": ["./src/*"] },
      },
      include: ["**/*.ts", "**/*.tsx", ".expo/types/**/*.d.ts", "expo-env.d.ts"],
    }, null, 2),

    // ── babel.config.js ───────────────────────────────────────────────────────
    "apps/expo/babel.config.js":
`module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: ["nativewind/babel"],
  };
};
`,

    // ── metro.config.js ───────────────────────────────────────────────────────
    "apps/expo/metro.config.js":
`const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: "./global.css" });
`,

    // ── global.css (NativeWind) ───────────────────────────────────────────────
    "apps/expo/global.css":
`@tailwind base;
@tailwind components;
@tailwind utilities;
`,

    // ── tailwind.config.js ────────────────────────────────────────────────────
    "apps/expo/tailwind.config.js":
`/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
};
`,

    // ── src/lib/api.ts ────────────────────────────────────────────────────────
    [`apps/expo/src/lib/api.ts`]:
`import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { AppRouter } from "@${scope}/api";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "${apiUrl}";

export const orpc = createORPCClient<AppRouter>(
  new RPCLink({ url: \`\${API_URL}/api/rpc\` }),
);
`,

    // ── src/lib/auth.ts ───────────────────────────────────────────────────────
    [`apps/expo/src/lib/auth.ts`]:
`import { createAuthClient } from "better-auth/react-native";
import * as SecureStore from "expo-secure-store";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "${apiUrl}";

export const authClient = createAuthClient({
  baseURL: API_URL,
  storage: {
    getItem:    (key) => SecureStore.getItemAsync(key),
    setItem:    (key, value) => SecureStore.setItemAsync(key, value),
    removeItem: (key) => SecureStore.deleteItemAsync(key),
  },
});

export const { signIn, signUp, signOut, useSession } = authClient;
`,

    // ── src/providers.tsx ─────────────────────────────────────────────────────
    [`apps/expo/src/providers.tsx`]:
`import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: 1 } } }),
  );
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
`,

    // ── app/_layout.tsx ───────────────────────────────────────────────────────
    "apps/expo/app/_layout.tsx":
`import "../global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { Providers } from "~/providers";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <Providers>
        <Stack screenOptions={{ headerShown: false }} />
        <StatusBar style="auto" />
      </Providers>
    </SafeAreaProvider>
  );
}
`,

    // ── app/(auth)/_layout.tsx ────────────────────────────────────────────────
    "apps/expo/app/(auth)/_layout.tsx":
`import { Stack } from "expo-router";

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
`,

    // ── app/(auth)/login.tsx ──────────────────────────────────────────────────
    "apps/expo/app/(auth)/login.tsx":
`import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";

import { signIn } from "~/lib/auth";

export default function LoginScreen() {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function handleLogin() {
    setLoading(true);
    setError(null);
    const { error: err } = await signIn.email({ email, password });
    setLoading(false);
    if (err) { setError(err.message); return; }
    router.replace("/(tabs)");
  }

  return (
    <View className="flex-1 items-center justify-center bg-white px-6">
      <Text className="text-2xl font-bold text-gray-900 mb-8">Sign in</Text>

      {error && <Text className="text-red-600 mb-4">{error}</Text>}

      <TextInput
        className="w-full border border-gray-300 rounded-lg px-4 py-3 mb-4"
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        className="w-full border border-gray-300 rounded-lg px-4 py-3 mb-6"
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <Pressable
        className="w-full bg-gray-900 rounded-lg py-3 items-center"
        onPress={handleLogin}
        disabled={loading}
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text className="text-white font-semibold">Sign in</Text>}
      </Pressable>

      <Pressable className="mt-4" onPress={() => router.push("/(auth)/sign-up")}>
        <Text className="text-gray-500">No account? Sign up</Text>
      </Pressable>
    </View>
  );
}
`,

    // ── app/(auth)/sign-up.tsx ────────────────────────────────────────────────
    "apps/expo/app/(auth)/sign-up.tsx":
`import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";

import { signUp } from "~/lib/auth";

export default function SignUpScreen() {
  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function handleSignUp() {
    setLoading(true);
    setError(null);
    const { error: err } = await signUp.email({ name, email, password });
    setLoading(false);
    if (err) { setError(err.message); return; }
    router.replace("/(tabs)");
  }

  return (
    <View className="flex-1 items-center justify-center bg-white px-6">
      <Text className="text-2xl font-bold text-gray-900 mb-8">Create account</Text>

      {error && <Text className="text-red-600 mb-4">{error}</Text>}

      <TextInput
        className="w-full border border-gray-300 rounded-lg px-4 py-3 mb-4"
        placeholder="Name"
        value={name}
        onChangeText={setName}
      />
      <TextInput
        className="w-full border border-gray-300 rounded-lg px-4 py-3 mb-4"
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        className="w-full border border-gray-300 rounded-lg px-4 py-3 mb-6"
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <Pressable
        className="w-full bg-gray-900 rounded-lg py-3 items-center"
        onPress={handleSignUp}
        disabled={loading}
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text className="text-white font-semibold">Create account</Text>}
      </Pressable>

      <Pressable className="mt-4" onPress={() => router.back()}>
        <Text className="text-gray-500">Already have an account? Sign in</Text>
      </Pressable>
    </View>
  );
}
`,

    // ── app/(tabs)/_layout.tsx ────────────────────────────────────────────────
    "apps/expo/app/(tabs)/_layout.tsx":
`import { Redirect, Tabs } from "expo-router";

import { useSession } from "~/lib/auth";

export default function TabsLayout() {
  const { data: session, isPending } = useSession();

  if (isPending) return null;
  if (!session) return <Redirect href="/(auth)/login" />;

  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: "#111827" }}>
      <Tabs.Screen name="index" options={{ title: "Home" }} />
    </Tabs>
  );
}
`,

    // ── app/(tabs)/index.tsx ──────────────────────────────────────────────────
    "apps/expo/app/(tabs)/index.tsx":
`import { Text, View } from "react-native";

import { useSession } from "~/lib/auth";

export default function HomeScreen() {
  const { data: session } = useSession();

  return (
    <View className="flex-1 items-center justify-center bg-white">
      <Text className="text-2xl font-bold text-gray-900">
        Welcome, {session?.user.name}
      </Text>
      <Text className="text-gray-500 mt-2">You are signed in.</Text>
    </View>
  );
}
`,

    // ── .env (template) ───────────────────────────────────────────────────────
    "apps/expo/.env":
`EXPO_PUBLIC_API_URL=${apiUrl}
`,
  };
}
