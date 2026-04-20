export default function Input({ label, as = "input", className = "", ...props }) {
  const Tag = as;
  return (
    <Tag
      className={`w-full rounded-xl border border-white/20 bg-slate-950/55 px-3 py-3 text-base text-white placeholder:text-slate-400/90 outline-none transition duration-200 ease-in-out focus:border-cyan-400 focus:shadow-[0_0_0_1px_rgba(34,211,238,0.45),0_0_26px_rgba(34,211,238,0.18)] ${className}`}
      placeholder={props.placeholder || label || ""}
      {...props}
    />
  );
}
