import { useState, useContext, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Mail, Lock, ArrowRight, LayoutDashboard, Eye, EyeOff } from "lucide-react";
import robotMascot from "../assets/robot-mascot.png";
import { AuthContext } from "../context/AuthContext";
import GoogleSignInButton from "../components/auth/GoogleSignInButton";

export default function Login() {
  const navigate = useNavigate();
  const { login, loginWithGoogle } = useContext(AuthContext);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await login(email, password);
      if (res.success !== false) {
        navigate("/dashboard");
      } else {
        setError(res.message || "Login failed");
      }
    } catch (err) {
      setError(err.message || "Login failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Google Identity Services hands the ID token (credential) to this callback;
  // send it to the backend for verification and establish the session exactly
  // like a password login.
  const handleGoogleCredential = useCallback(
    async (response) => {
      const credential = response?.credential;
      if (!credential) {
        setError("Google sign-in was cancelled or returned no credential.");
        return;
      }
      setError("");
      setGoogleSubmitting(true);
      try {
        await loginWithGoogle(credential);
        navigate("/dashboard");
      } catch (err) {
        setError(err?.message || "Google sign-in failed. Please try again.");
        setGoogleSubmitting(false);
      }
    },
    [loginWithGoogle, navigate]
  );

  return (
    <div className="min-h-screen w-full bg-gray-50 bg-[radial-gradient(#d1d5db_1px,transparent_1px)] [background-size:20px_20px] p-6">
      
      {/* Top label */}
      <div className="flex items-center gap-2 text-gray-600 text-sm font-medium mb-6 max-w-4xl mx-auto">
        <LayoutDashboard className="w-4 h-4" />
        Login / Register
      </div>

      <div className="w-full max-w-4xl mx-auto flex flex-col md:flex-row rounded-2xl shadow-xl overflow-hidden bg-white">
        
        {/* LEFT PANEL */}
        <div className="w-full md:w-[45%] flex flex-col items-center justify-center text-center px-10 py-14 bg-gradient-to-br from-purple-100 via-purple-50 to-white">
          <img
            src={robotMascot}
            alt="AetherAI robot mascot"
            className="mb-8 w-[240px] h-auto object-contain"
          />
          <h1 className="text-2xl font-bold leading-snug text-gray-900">
            AetherAI: Your <br />
            <span className="text-purple-600">Autonomous</span> <br />
            Workforce
          </h1>
          <p className="text-gray-500 text-xs mt-4 max-w-[220px] leading-relaxed">
            Deploy intelligent agents, automate complex workflows, and scale your
            operations effortlessly.
          </p>
        </div>

        {/* RIGHT PANEL */}
        <div className="w-full md:w-[55%] px-10 py-10 flex flex-col justify-center">
          <h2 className="text-xl font-bold text-gray-900">Welcome Back</h2>
          <p className="text-gray-500 text-xs mt-1 mb-5">
            Sign in to access your autonomous agents.
          </p>

          {error && (
            <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-800">
                Email Address
              </label>
              <div className="mt-1 flex items-center border rounded-lg px-3 py-2 bg-gray-50">
                <Mail className="w-4 h-4 text-gray-400 mr-2" />
                <input
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full outline-none text-xs bg-transparent"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold text-gray-800">
                  Password
                </label>
                <a href="#" className="text-xs text-purple-600 font-medium">
                  Forgot Password?
                </a>
              </div>
              <div className="mt-1 flex items-center border rounded-lg px-3 py-2 bg-gray-50">
                <Lock className="w-4 h-4 text-gray-400 mr-2" />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full outline-none text-xs bg-transparent"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="ml-2 text-gray-400 hover:text-gray-600 transition"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-900 to-purple-600 text-white text-sm font-semibold py-2.5 rounded-lg hover:opacity-90 transition disabled:opacity-50"
            >
              {submitting ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>Sign In <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>

          <div className="flex items-center my-5">
            <div className="flex-1 h-px bg-gray-200"></div>
            <span className="px-3 text-xs text-gray-400">OR</span>
            <div className="flex-1 h-px bg-gray-200"></div>
          </div>

          <GoogleSignInButton onCredential={handleGoogleCredential} onError={setError} disabled={googleSubmitting} />

          <p className="text-center text-xs text-gray-500 mt-5">
            Don't have an account?{" "}
            <Link to="/register" className="text-purple-600 font-medium">Register here</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
