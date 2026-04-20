import { useState } from "react";
import { motion } from "framer-motion";
import { Copy, Sparkles } from "lucide-react";
import { generateStrongPassword } from "../utils/crypto";
import Button from "./UI/Button";
import Card from "./UI/Card";
import Loader from "./UI/Loader";

export default function PasswordGenerator() {
  const [length, setLength] = useState(20);
  const [password, setPassword] = useState("");
  const [lowercase, setLowercase] = useState(true);
  const [uppercase, setUppercase] = useState(true);
  const [numbers, setNumbers] = useState(true);
  const [symbols, setSymbols] = useState(true);
  const [copyMsg, setCopyMsg] = useState("");

  function generate() {
    const next = generateStrongPassword({ length, lowercase, uppercase, numbers, symbols });
    setPassword(next);
  }

  async function copy() {
    if (!password) return;
    await navigator.clipboard.writeText(password);
    setCopyMsg("Copied!");
    setTimeout(() => setCopyMsg(""), 1200);
  }

  const toggles = [
    { key: "lowercase", label: "a-z", value: lowercase, set: setLowercase },
    { key: "uppercase", label: "A-Z", value: uppercase, set: setUppercase },
    { key: "numbers", label: "0-9", value: numbers, set: setNumbers },
    { key: "symbols", label: "!@#", value: symbols, set: setSymbols }
  ];

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-100">Password Generator</h3>
        <Sparkles size={16} className="text-cyan-300" />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-300">
          <span>Length</span>
          <span>{length}</span>
        </div>
        <input
          type="range"
          min="8"
          max="64"
          value={length}
          onChange={(e) => setLength(Number(e.target.value))}
          className="w-full accent-cyan-400"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {toggles.map((t) => (
          <motion.button
            key={t.key}
            whileTap={{ scale: 0.98 }}
            onClick={() => t.set((v) => !v)}
            className={`rounded-xl border px-3 py-2 text-xs transition ${
              t.value ? "border-cyan-400/70 bg-cyan-400/15 text-cyan-100" : "border-white/20 bg-white/5 text-slate-300"
            }`}
          >
            {t.label}
          </motion.button>
        ))}
      </div>

      <div className="flex gap-2">
        <Button onClick={generate}>Generate</Button>
        <Button variant="ghost" onClick={copy} disabled={!password}>
          <Copy size={14} />
        </Button>
      </div>

      <div className="rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-sm break-all">{password || "No password generated yet"}</div>
      {copyMsg ? <Loader label={copyMsg} /> : null}
    </Card>
  );
}
