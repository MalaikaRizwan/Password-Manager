import { motion } from "framer-motion";

export default function GlassCard({ children, className = "" }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className={`rounded-2xl border border-white/10 bg-white/[0.05] p-8 shadow-xl backdrop-blur-lg ${className}`}
    >
      {children}
    </motion.div>
  );
}
