"use client";

import { useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Check, KeyRound } from "lucide-react";
import {
  createMcpToken,
  revokeMcpToken,
  type McpTokenInfo,
} from "@/lib/actions/mcp-tokens";

type Props = {
  initialTokens: McpTokenInfo[];
  canEdit: boolean;
  endpointUrl: string;
};

export function McpTokenSettings({
  initialTokens,
  canEdit,
  endpointUrl,
}: Props) {
  const t = useTranslations("settings");
  const format = useFormatter();
  const [tokens, setTokens] = useState(initialTokens);
  const [name, setName] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { token, info } = await createMcpToken(name);
      setTokens((prev) => [info, ...prev]);
      setNewToken(token);
      setCopied(false);
      setName("");
    } catch {
      setError(t("settingError"));
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(id: string) {
    setBusy(true);
    setError(null);
    try {
      await revokeMcpToken(id);
      setTokens((prev) =>
        prev.map((token) =>
          token.id === id
            ? { ...token, revoked_at: new Date().toISOString() }
            : token,
        ),
      );
    } catch {
      setError(t("settingError"));
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!newToken) return;
    try {
      await navigator.clipboard.writeText(newToken);
      setCopied(true);
    } catch {
      // Clipboard unavailable — the token stays visible for manual copying.
    }
  }

  function formatDate(value: string) {
    return format.dateTime(new Date(value), {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">{t("mcpDescription")}</p>
      <div className="text-sm">
        <span className="text-muted-foreground">{t("mcpEndpointLabel")}: </span>
        <code className="bg-muted rounded px-1.5 py-0.5">{endpointUrl}</code>
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("mcpTokenNamePlaceholder")}
            maxLength={100}
            className="max-w-xs"
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
            }}
          />
          <Button onClick={handleCreate} disabled={busy || !name.trim()}>
            <KeyRound className="h-4 w-4" />
            {t("mcpCreateToken")}
          </Button>
        </div>
      )}

      {newToken && (
        <div className="border-primary/50 bg-muted space-y-2 rounded-md border p-3">
          <p className="text-sm font-medium">{t("mcpNewTokenNotice")}</p>
          <div className="flex items-center gap-2">
            <code className="bg-background flex-1 overflow-x-auto rounded border px-2 py-1.5 text-xs">
              {newToken}
            </code>
            <Button variant="outline" size="sm" onClick={handleCopy}>
              {copied ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              {copied ? t("mcpCopied") : t("mcpCopy")}
            </Button>
          </div>
        </div>
      )}

      {tokens.length === 0 ? (
        <p className="text-muted-foreground text-sm italic">
          {t("mcpNoTokens")}
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {tokens.map((token) => (
            <li
              key={token.id}
              className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{token.name}</span>
                  <code className="text-muted-foreground text-xs">
                    {token.token_prefix}…
                  </code>
                  {token.revoked_at && (
                    <span className="text-destructive text-xs">
                      {t("mcpRevoked")}
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground text-xs">
                  {t("mcpCreatedAt")} {formatDate(token.created_at)} ·{" "}
                  {t("mcpLastUsed")}{" "}
                  {token.last_used_at
                    ? formatDate(token.last_used_at)
                    : t("mcpNever")}
                </p>
              </div>
              {canEdit && !token.revoked_at && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => handleRevoke(token.id)}
                >
                  {t("mcpRevoke")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}
