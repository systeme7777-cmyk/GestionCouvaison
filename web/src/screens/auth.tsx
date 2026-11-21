import { useState, type ReactNode } from "react";
import { User } from "lucide-react";
import { auth } from "../lib/api";
import { USERNAME_REGEX, suggestUsername } from "../lib/format";
import { useAction } from "../lib/hooks";
import { useSession } from "../lib/session";
import { ErrorBanner, Field, PasswordInput, TopBar } from "../components/ui";
import { useNavigate } from "react-router-dom";

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="auth-bg">
      <div className="auth-inner">
        <div className="auth-logo"><img src="/icons/logo.svg" alt="" width={110} height={110} /></div>
        <div className="brand-1">ANSAROUDINE</div>
        <div className="brand-2">ZIKR</div>
        <div className="brand-sub">Ensemble pour le rappel d'Allah</div>
        <div className="auth-card">{children}</div>
      </div>
    </div>
  );
}

export function LoginScreen({ ownerExists, onSetup, onRetry }: { ownerExists: boolean | null; onSetup: () => void; onRetry: () => void }) {
  const [username, setUsername] = useState(() => localStorage.getItem("zikr-dernier-identifiant") ?? "");
  const [password, setPassword] = useState("");
  const { busy, error, setError, run } = useAction();

  const submit = () => {
    const u = username.trim().toLowerCase();
    if (!u || !password) { setError("Saisissez votre identifiant et votre mot de passe."); return; }
    void run(async () => {
      await auth.signIn(u, password);
      localStorage.setItem("zikr-dernier-identifiant", u);
    });
  };

  return (
    <AuthShell>
      <h2>Connexion</h2>
      <p className="muted">Utilisez l'identifiant et le mot de passe fournis par votre administrateur.</p>
      <Field label="Identifiant">
        <div className="input-icon">
          <User size={18} />
          <input value={username} onChange={(e) => setUsername(e.target.value.trim().toLowerCase())} autoCapitalize="none"
            autoCorrect="off" spellCheck={false} autoComplete="username" />
        </div>
      </Field>
      <Field label="Mot de passe"><PasswordInput value={password} onChange={setPassword} onEnter={submit} /></Field>
      {error && <ErrorBanner message={error} />}
      <button className="btn big" onClick={submit} disabled={busy}>{busy ? "Connexion…" : "Se connecter"}</button>
      {ownerExists === false && (
        <>
          <p className="muted small center">Première utilisation : aucun administrateur n'est encore configuré.</p>
          <button className="btn-text center-block" onClick={onSetup}>Configurer l'application</button>
        </>
      )}
      {ownerExists === null && <button className="btn-text center-block" onClick={onRetry}>Vérifier la connexion au serveur</button>}
    </AuthShell>
  );
}

export function SetupOwnerScreen({ onBack }: { onBack: () => void }) {
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [edited, setEdited] = useState(false);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const { busy, error, setError, run } = useAction();

  const submit = () => {
    const u = username.trim().toLowerCase();
    if (fullName.trim().length < 2) return setError("Saisissez votre nom complet.");
    if (!USERNAME_REGEX.test(u)) return setError("L'identifiant doit contenir de 3 à 32 caractères : lettres minuscules sans accent, chiffres, point ou tiret.");
    if (password.length < 6) return setError("Le mot de passe doit contenir au moins 6 caractères.");
    if (password !== confirm) return setError("Les deux mots de passe ne correspondent pas.");
    void run(async () => {
      await auth.bootstrapOwner(fullName.trim(), u, phone.trim(), password);
      localStorage.setItem("zikr-dernier-identifiant", u);
    });
  };

  return (
    <AuthShell>
      <h2>Configuration initiale</h2>
      <p className="muted">Créez le compte de l'administrateur principal (propriétaire de l'application). Cette étape n'est possible qu'une seule fois.</p>
      <Field label="Nom complet">
        <input value={fullName} onChange={(e) => { setFullName(e.target.value); if (!edited) setUsername(suggestUsername(e.target.value)); }} autoComplete="name" />
      </Field>
      <Field label="Identifiant de connexion" hint="Lettres minuscules, chiffres, point ou tiret">
        <input value={username} onChange={(e) => { setUsername(e.target.value.trim().toLowerCase()); setEdited(true); }} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      </Field>
      <Field label="Téléphone (facultatif)"><input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" /></Field>
      <Field label="Mot de passe" hint="Au moins 6 caractères"><PasswordInput value={password} onChange={setPassword} autoComplete="new-password" /></Field>
      <Field label="Confirmer le mot de passe"><PasswordInput value={confirm} onChange={setConfirm} autoComplete="new-password" onEnter={submit} /></Field>
      {error && <ErrorBanner message={error} />}
      <button className="btn big" onClick={submit} disabled={busy}>{busy ? "Création…" : "Créer le compte administrateur"}</button>
      <button className="btn-text center-block" onClick={onBack}>Retour à la connexion</button>
    </AuthShell>
  );
}

function usePasswordForm(onDone: () => void) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const { busy, error, setError, run } = useAction();
  const submit = () => {
    if (password.length < 6) return setError("Le mot de passe doit contenir au moins 6 caractères.");
    if (password !== confirm) return setError("Les deux mots de passe ne correspondent pas.");
    void run(async () => { await auth.changePassword(password); onDone(); });
  };
  return { password, setPassword, confirm, setConfirm, busy, error, submit };
}

export function ForcedPasswordScreen() {
  const { refreshProfile, signOut } = useSession();
  const f = usePasswordForm(() => void refreshProfile());
  return (
    <AuthShell>
      <h2>Choisissez votre mot de passe</h2>
      <p className="muted">Pour sécuriser votre compte, remplacez le mot de passe temporaire donné par l'administrateur par un mot de passe personnel.</p>
      <Field label="Nouveau mot de passe" hint="Au moins 6 caractères"><PasswordInput value={f.password} onChange={f.setPassword} autoComplete="new-password" /></Field>
      <Field label="Confirmer le mot de passe"><PasswordInput value={f.confirm} onChange={f.setConfirm} autoComplete="new-password" onEnter={f.submit} /></Field>
      {f.error && <ErrorBanner message={f.error} />}
      <button className="btn big" onClick={f.submit} disabled={f.busy}>{f.busy ? "Enregistrement…" : "Enregistrer"}</button>
      <button className="btn-text center-block" onClick={() => void signOut()}>Se déconnecter</button>
    </AuthShell>
  );
}

export function ChangePasswordScreen() {
  const navigate = useNavigate();
  const { toast } = useSession();
  const f = usePasswordForm(() => { toast("Mot de passe modifié."); navigate(-1); });
  return (
    <>
      <TopBar title="Changer mon mot de passe" back />
      <div className="page form">
        <Field label="Nouveau mot de passe" hint="Au moins 6 caractères"><PasswordInput value={f.password} onChange={f.setPassword} autoComplete="new-password" /></Field>
        <Field label="Confirmer le mot de passe"><PasswordInput value={f.confirm} onChange={f.setConfirm} autoComplete="new-password" onEnter={f.submit} /></Field>
        {f.error && <ErrorBanner message={f.error} />}
        <button className="btn big" onClick={f.submit} disabled={f.busy}>{f.busy ? "Enregistrement…" : "Enregistrer"}</button>
      </div>
    </>
  );
}
