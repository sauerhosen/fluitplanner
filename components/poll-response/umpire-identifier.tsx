"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { findOrCreateUmpire } from "@/lib/actions/public-polls";
import type { Umpire } from "@/lib/types/domain";

type Props = {
  onIdentified: (umpire: Umpire) => void;
};

export function UmpireIdentifier({ onIdentified }: Props) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [needsName, setNeedsName] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const umpire = await findOrCreateUmpire(email);
      if (umpire) {
        onIdentified(umpire);
      } else {
        setNeedsName(true);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegisterSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const umpire = await findOrCreateUmpire(email, name);
      if (umpire) {
        onIdentified(umpire);
      } else {
        setError("Could not create account. Please try again.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (needsName) {
    return (
      <form onSubmit={handleRegisterSubmit} className="space-y-4">
        <p className="text-muted-foreground text-sm">
          We don&apos;t have <strong>{email}</strong> on file yet. Enter your
          name to register.
        </p>
        <div className="space-y-2">
          <Label htmlFor="name">Your name</Label>
          <Input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Jane Doe"
            required
            autoFocus
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button
          type="submit"
          disabled={loading || !name.trim()}
          className="w-full"
        >
          {loading ? "Registering\u2026" : "Continue"}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={handleEmailSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Your email</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="e.g. jane@example.com"
          required
          autoFocus
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button
        type="submit"
        disabled={loading || !email.trim()}
        className="w-full"
      >
        {loading ? "Looking up\u2026" : "Continue"}
      </Button>
    </form>
  );
}
