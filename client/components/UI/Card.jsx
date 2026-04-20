import { motion } from "framer-motion";

export default function Card({ children, className = "" }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ rotateX: 1.5, rotateY: -1.5, y: -2 }}
      transition={{ type: "spring", stiffness: 180, damping: 18 }}
      className={`rounded-2xl border border-white/10 bg-panel/80 p-8 shadow-soft backdrop-blur-xl ${className}`}
      style={{ transformStyle: "preserve-3d" }}
    >
      {children}
    </motion.div>
  );
}
