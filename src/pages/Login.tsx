import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, ShieldCheck, TimerReset, HandPlatter, UserRound } from "lucide-react";
import { AppLogo, CONSOLE_NAME, HearthBadge } from "@/components/HearthLogo";

const Login = () => {
  const { session, loading, login, loginStaff } = useAuth();
  const [staffMode, setStaffMode] = useState(false);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = `Sign in — ${CONSOLE_NAME}`;
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (session) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const result = staffMode
        ? await loginStaff(username, password)
        : await login(email, password);
      if (!result.ok) setError((result as { message?: string }).message ?? "Login failed");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-4 py-8 md:px-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-10 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -right-12 bottom-0 h-72 w-72 rounded-full bg-warning/15 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl overflow-hidden rounded-3xl border border-border/60 bg-card/70 shadow-2xl backdrop-blur-xl animate-fade-in">
        <section className="hidden w-1/2 flex-col justify-between border-r border-border/60 p-10 lg:flex">
          <div>
            <AppLogo className="mb-8" />
            <h1 className="max-w-sm text-2xl font-bold leading-tight text-foreground">
              Operate your assigned restaurant with confidence.
            </h1>
            <p className="mt-4 max-w-md text-sm text-muted-foreground">
              Sign in with credentials provisioned by Super Admin. Your restaurant is assigned automatically — no manual selection.
            </p>
          </div>

          <div className="relative mt-2 overflow-hidden rounded-2xl border border-border/60">
            <img
              src="https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=80"
              alt="Restaurant interior"
              className="h-[340px] w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/30 to-transparent" />
            <div className="absolute bottom-4 left-4 right-4 grid gap-3 text-xs">
              <div className="inline-flex w-fit items-center gap-2 rounded-lg bg-background/80 px-3 py-2 text-foreground backdrop-blur">
                <ShieldCheck className="h-4 w-4 text-success" />
                Firebase Auth + role permissions
              </div>
              <div className="inline-flex w-fit items-center gap-2 rounded-lg bg-background/80 px-3 py-2 text-foreground backdrop-blur">
                <TimerReset className="h-4 w-4 text-warning" />
                Live order status updates
              </div>
              <div className="inline-flex w-fit items-center gap-2 rounded-lg bg-background/80 px-3 py-2 text-foreground backdrop-blur">
                <HandPlatter className="h-4 w-4 text-primary" />
                Single-restaurant scope
              </div>
            </div>
          </div>
        </section>

        <section className="flex w-full items-center justify-center p-6 sm:p-10 lg:w-1/2">
          <div className="w-full max-w-md">
            <div className="mb-8 flex flex-col items-center lg:items-start">
              <HearthBadge className="mb-4 h-14 w-14" />
              <h1 className="text-2xl font-bold text-foreground">{CONSOLE_NAME}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {staffMode ? "Sign in with the username your admin gave you" : "Sign in with your provisioned account"}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-border/60 bg-card/80 p-6 shadow-xl">
              <label
                htmlFor="staff-mode"
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/60 bg-muted/30 px-3 py-3 transition-colors hover:bg-muted/50"
              >
                <Checkbox
                  id="staff-mode"
                  checked={staffMode}
                  onCheckedChange={(v) => {
                    setStaffMode(v === true);
                    setError("");
                    setPassword("");
                  }}
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <UserRound className="h-3.5 w-3.5" /> I'm a staff member
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Sign in with a username and password issued by your restaurant admin.
                  </span>
                </span>
              </label>

              {staffMode ? (
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    type="text"
                    autoCapitalize="none"
                    autoCorrect="off"
                    placeholder="thabo.m"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="owner@restaurant.co.za"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>


              {error && (
                <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{error}</p>
              )}

              <Button type="submit" className="w-full h-11 text-sm font-semibold" disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Sign In
              </Button>
            </form>

            <p className="mt-4 text-center text-xs text-muted-foreground lg:text-left">
              Access is controlled by Super Admin. Contact your administrator if you need an account.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Login;
