import { useState, useContext, useRef, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { User, Mail, Lock, ArrowRight, LayoutDashboard, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import robotMascot from "../assets/robot-mascot.png";
import { AuthContext } from "../context/AuthContext";
import GoogleSignInButton from "../components/auth/GoogleSignInButton";

const OTP_LENGTH = 6;

export default function Register() {
  const navigate = useNavigate();
  const { register, sendRegistrationOtp, verifyRegistrationOtp, loginWithGoogle } = useContext(AuthContext);

  // Step 1 = email, Step 2 = OTP verification, Step 3 = password/details.
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  // The short-lived email-verification ticket, kept only in memory for the next
  // step in this same session (never stored in localStorage).
  const [verificationTicket, setVerificationTicket] = useState("");

  // OTP verification state
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [otpDigits, setOtpDigits] = useState(Array(OTP_LENGTH).fill(""));
  const [otpError, setOtpError] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const otpRefs = useRef([]);
  const cooldownTimer = useRef(null);

  useEffect(() => {
    return () => clearInterval(cooldownTimer.current);
  }, []);

  const startCooldown = () => {
    setResendCooldown(15);
    cooldownTimer.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(cooldownTimer.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const resetOtpState = () => {
    clearInterval(cooldownTimer.current);
    setResendCooldown(0);
    setOtpDigits(Array(OTP_LENGTH).fill(""));
    setOtpError("");
    setIsSendingOtp(false);
  };

  // ---- Step 1: send the pre-registration OTP to the email ----
  const handleSendOtp = async () => {
    setError("");
    setOtpError("");
    if (!email.trim()) {
      setError("Enter your email first");
      return;
    }
    setIsSendingOtp(true);
    setOtpDigits(Array(OTP_LENGTH).fill(""));
    try {
      await sendRegistrationOtp(email.trim());
      setStep(2);
      startCooldown();
      setTimeout(() => otpRefs.current[0]?.focus(), 50);
    } catch (err) {
      if (err?.status === 409) {
        setError(
          <span>
            {err.message || "This email is already registered."}{" "}
            <Link to="/login" className="font-semibold text-red-700 underline">Login here</Link>
          </span>
        );
      } else {
        setError(err?.message || "Failed to send verification code");
      }
    } finally {
      setIsSendingOtp(false);
    }
  };

  // ---- Step 2: verify the OTP and obtain the ticket ----
  const handleVerifyOtp = async () => {
    const entered = otpDigits.join("");
    if (entered.length !== OTP_LENGTH) return;
    setOtpError("");
    setIsSendingOtp(true);
    try {
      const res = await verifyRegistrationOtp(email.trim(), entered);
      const ticket = res?.data?.data?.verificationTicket || res?.data?.verificationTicket;
      if (!ticket) {
        setOtpError("Verification response did not include a ticket");
        return;
      }
      setVerificationTicket(ticket);
      setStep(3);
    } catch (err) {
      setOtpError(err?.message || "Invalid verification code");
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleResendOtp = async () => {
    setOtpError("");
    setIsSendingOtp(true);
    setOtpDigits(Array(OTP_LENGTH).fill(""));
    try {
      await sendRegistrationOtp(email.trim());
      startCooldown();
      setTimeout(() => otpRefs.current[0]?.focus(), 50);
    } catch (err) {
      setOtpError(err?.message || "Failed to resend verification code");
    } finally {
      setIsSendingOtp(false);
    }
  };

  // ---- Go back to change the email (resets all OTP state) ----
  const handleBackToEmail = () => {
    setError("");
    resetOtpState();
    setVerificationTicket("");
    setStep(1);
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

  const handleOtpChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    const newDigits = [...otpDigits];
    newDigits[index] = value.slice(-1);
    setOtpDigits(newDigits);
    setOtpError("");
    if (value && index < OTP_LENGTH - 1) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!pasted) return;
    const newDigits = Array(OTP_LENGTH).fill("");
    for (let i = 0; i < pasted.length; i++) newDigits[i] = pasted[i];
    setOtpDigits(newDigits);
    otpRefs.current[Math.min(pasted.length, OTP_LENGTH - 1)]?.focus();
  };

  // ---- Step 3: create the account (final step, logs user straight in) ----
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!email.trim()) {
      setError("Email is required");
      return;
    }
    if (password.length < 8 || !/\d/.test(password)) {
      setError("Password must be at least 8 characters and contain at least one number.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (!verificationTicket) {
      setError("Email verification is missing. Please verify your email again.");
      handleBackToEmail();
      return;
    }
    setSubmitting(true);
    try {
      const fullName = (name || "").trim();
      const nameParts = fullName.split(/\s+/).filter(Boolean);
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";
      await register({ email: email.trim(), password, firstName, lastName, verificationTicket });
      navigate("/dashboard");
    } catch (err) {
      setError(err?.message || "Registration failed. Please try again.");
      // If the ticket expired while the user was filling details, go back to
      // re-verify rather than leaving them stuck on a dead end.
      if (/verification|expired|invalid/i.test(err?.message || "")) {
        handleBackToEmail();
      }
    } finally {
      setSubmitting(false);
    }
  };

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
          <h2 className="text-xl font-bold text-gray-900">Create Account</h2>
          <p className="text-gray-500 text-xs mt-1 mb-5">
            {step === 1 && "Start with your email — we'll send a verification code."}
            {step === 2 && "Enter the code we sent to your email."}
            {step === 3 && "Almost done — set your password and details."}
          </p>

          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-4">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  s <= step ? "bg-purple-600" : "bg-gray-200"
                }`}
              />
            ))}
          </div>

          {error && (
            <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
              {error}
            </div>
          )}

          {/* STEP 1 — EMAIL */}
          {step === 1 && (
            <div className="space-y-4">
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
                    onChange={(e) => { setEmail(e.target.value); setError(""); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSendOtp(); } }}
                    autoFocus
                    required
                    className="w-full outline-none text-xs bg-transparent"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={handleSendOtp}
                disabled={isSendingOtp || !email.trim()}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-900 to-purple-600 text-white text-sm font-semibold py-2.5 rounded-lg hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSendingOtp ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>Send Code <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </div>
          )}

          {/* STEP 2 — OTP VERIFICATION */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-[11px] text-gray-500">
                <span>Code sent to <span className="font-semibold text-gray-700">{email}</span></span>
                <button
                  type="button"
                  onClick={handleBackToEmail}
                  className="text-purple-600 font-medium hover:text-purple-700 transition"
                >
                  Change email
                </button>
              </div>
              <p className="text-[11px] text-gray-500">Enter OTP sent to your email</p>
              <div className="flex items-center gap-1.5">
                {otpDigits.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { otpRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    onPaste={i === 0 ? handleOtpPaste : undefined}
                    className="w-9 h-10 text-center text-sm font-semibold border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400"
                  />
                ))}
                <button
                  type="button"
                  onClick={handleVerifyOtp}
                  disabled={otpDigits.join("").length !== OTP_LENGTH || isSendingOtp}
                  className="ml-2 px-3 py-2 text-xs font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isSendingOtp ? "Verifying..." : "Verify OTP"}
                </button>
              </div>
              {otpError && (
                <p className="text-[11px] text-red-500">{otpError}</p>
              )}
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={resendCooldown > 0 || isSendingOtp}
                className="text-[11px] text-purple-600 font-medium hover:text-purple-700 disabled:opacity-40 disabled:cursor-not-allowed w-fit transition"
              >
                {resendCooldown > 0 ? `Resend OTP in ${resendCooldown}s` : "Resend OTP"}
              </button>
            </div>
          )}

          {/* STEP 3 — PASSWORD / DETAILS */}
          {step === 3 && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex items-center justify-between text-[11px] text-gray-500 mb-1">
                <span className="flex items-center gap-1 text-green-600 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {email} verified
                </span>
                <button
                  type="button"
                  onClick={handleBackToEmail}
                  className="text-purple-600 font-medium hover:text-purple-700 transition"
                >
                  Change email
                </button>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-800">
                  Full Name
                </label>
                <div className="mt-1 flex items-center border rounded-lg px-3 py-2 bg-gray-50">
                  <User className="w-4 h-4 text-gray-400 mr-2" />
                  <input
                    type="text"
                    placeholder="John Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full outline-none text-xs bg-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-800">
                  Password
                </label>
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

              <div>
                <label className="text-xs font-semibold text-gray-800">
                  Confirm Password
                </label>
                <div className="mt-1 flex items-center border rounded-lg px-3 py-2 bg-gray-50">
                  <Lock className="w-4 h-4 text-gray-400 mr-2" />
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="w-full outline-none text-xs bg-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className="ml-2 text-gray-400 hover:text-gray-600 transition"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-900 to-purple-600 text-white text-sm font-semibold py-2.5 rounded-lg hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>Create Account <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
              <p className="text-[11px] text-gray-400">Your email has already been verified — no further code will be sent.</p>
            </form>
          )}

          <div className="flex items-center my-5">
            <div className="flex-1 h-px bg-gray-200"></div>
            <span className="px-3 text-xs text-gray-400">OR</span>
            <div className="flex-1 h-px bg-gray-200"></div>
          </div>

          <GoogleSignInButton onCredential={handleGoogleCredential} onError={setError} disabled={googleSubmitting} />

          <p className="text-center text-xs text-gray-500 mt-5">
            Already have an account?{" "}
            <Link to="/login" className="text-purple-600 font-medium">Login here</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
