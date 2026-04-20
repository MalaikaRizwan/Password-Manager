import { useState } from "react";
import Button from "./UI/Button";
import Input from "./UI/Input";

export default function VaultItemForm({ onSubmit, isSubmitting = false }) {
  const [title, setTitle] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  function validateInput() {
    if (!title || title.length > 120) {
      return "Title is required and must be <= 120 chars.";
    }
    if (username.length < 1 || username.length > 100) {
      return "Username must be between 1 and 100 chars.";
    }
    if (url) {
      try {
        const parsed = new URL(url);
        if (!["http:", "https:"].includes(parsed.protocol)) {
          return "URL must start with http:// or https://";
        }
      } catch {
        return "URL format is invalid.";
      }
    }
    return "";
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-100">Create Vault Entry</h3>
      <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <Input label="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
      <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <Input label="Website URL" value={url} onChange={(e) => setUrl(e.target.value)} />
      <Input as="textarea" label="Secure notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="resize-none" />
      {error ? <p className="text-xs text-rose-300">{error}</p> : null}
      <Button
        disabled={isSubmitting}
        onClick={() => {
          if (isSubmitting) return;
          const validationError = validateInput();
          if (validationError) {
            setError(validationError);
            return;
          }
          setError("");
          onSubmit({ title, username, password, url, notes });
          setTitle("");
          setUsername("");
          setPassword("");
          setUrl("");
          setNotes("");
        }}
      >
        {isSubmitting ? "Processing..." : "Save Entry"}
      </Button>
    </div>
  );
}
