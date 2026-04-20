import { motion } from "framer-motion";

export default function Loader({ label = "Processing..." }) {
  return (
    <div className="inline-flex items-center gap-2 text-xs text-cyan-200/90">
      <motion.span
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
        className="inline-block h-4 w-4 rounded-full border-2 border-cyan-300/30 border-t-cyan-300"
      />
      {label}
    </div>
  );
}
