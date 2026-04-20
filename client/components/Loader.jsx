export default function Loader({ label = "Processing..." }) {
  return (
    <span
      style={{
        display: "inline-block",
        marginLeft: "0.5rem",
        fontSize: "0.9rem",
        opacity: 0.9
      }}
      aria-live="polite"
    >
      {label}
    </span>
  );
}
