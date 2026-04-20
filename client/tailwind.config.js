/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}", "./pages/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#070b14",
        panel: "rgba(16, 24, 40, 0.55)",
        accent: "#8b5cf6",
        cyan: "#22d3ee"
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(139,92,246,0.25), 0 12px 35px rgba(34,211,238,0.12)",
        soft: "0 10px 40px rgba(0,0,0,0.35)"
      },
      backdropBlur: {
        xs: "2px"
      },
      animation: {
        "gradient-shift": "gradientShift 16s ease infinite",
        floaty: "floaty 6s ease-in-out infinite"
      },
      keyframes: {
        gradientShift: {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" }
        },
        floaty: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-8px)" }
        }
      }
    }
  },
  plugins: []
};
