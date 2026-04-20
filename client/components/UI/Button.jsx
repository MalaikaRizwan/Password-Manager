import { motion } from "framer-motion";

export default function Button({ children, className = "", variant = "primary", disabled = false, ...props }) {
  const style =
    variant === "ghost"
      ? "bg-white/5 border border-white/20 hover:bg-white/10 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.25),0_12px_28px_rgba(34,211,238,0.12)]"
      : "bg-gradient-to-r from-violet-600 to-blue-500 hover:from-violet-500 hover:to-cyan-400 shadow-[0_8px_28px_rgba(124,58,237,0.35)] hover:shadow-[0_10px_36px_rgba(34,211,238,0.3)]";

  return (
    <motion.button
      whileHover={disabled ? {} : { scale: 1.05 }}
      whileTap={disabled ? {} : { scale: 0.98 }}
      disabled={disabled}
      className={`rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition duration-200 ease-in-out disabled:cursor-not-allowed disabled:opacity-60 ${style} ${className}`}
      {...props}
    >
      {children}
    </motion.button>
  );
}
