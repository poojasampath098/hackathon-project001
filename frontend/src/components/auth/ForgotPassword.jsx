import { useState, useContext, useRef, useEffect } from "react";
import { Mail, Lock, ArrowRight, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { AuthContext } from "../../context/AuthContext";

const OTP_LENGTH = 6;

function maskEmail(email) {
  const at = email.indexOf("@");
  if (at <= 0) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 2) return `${local[0] || ""}****${domain}`;
  return `${local.slice(0, 2)}${"*".repeat(Math.max(Math.min(local.length - 2, 6), 3))}${domain}`;
}

export default function ForgotPassword({ onBack }) {
  const { requestPasswordResetOtp, verifyPasswordResetOtp, resetPassword } = useContext(AuthContext);

  // Step 1 = email, Step 2 = OTP verification, Step 3 = new password, Step 4 = success.
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // OTP verification state
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [otpDigits, setOtpDigits] = useState(Array(OTP_LENGTH).fill(""));
  const [otpError, setOtpError] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const otpRefs = useRef([]);
  const cooldownTimer = useRef(null);

  // Short-lived reset authorization, kept only in memory for the next step.
  const [resetTicket, setResetTicket] = useState("");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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

  // ---- Step 1: send the recovery OTP to the email ----
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
      await requestPasswordResetOtp(email.trim());
      setStep(2);
      startCooldown();
      setTimeout(() => otpRefs.current[0]?.focus(), 50);
    } catch (err) {
      setError(err?.message || "Failed to send the verification code");
    } finally {
      setIsSendingOtp(false);
    }
  };

  // ---- Step 2: verify the OTP and obtain the reset authorization ----
  const handleVerifyOtp = async () => {
    const entered = otpDigits.join("");
    if (entered.length !== OTP_LENGTH) return;
    setOtpError("");
    setIsSendingOtp(true);
    try {
      const res = await verifyPasswordResetOtp(email.trim(), entered);
      const ticket = res?.data?.resetTicket;
      if (!ticket) {
        setOtpError("Verification response did not include a reset session");
        return;
      }
      setResetTicket(ticket);
      setStep(3);
    } catch (err) {
      setOtpError(err?.message || "Invalid verification code");
      // If the code was consumed or expired while typing, drop back to a fresh
      // email stage so they aren't stuck on a dead end.
      if (/expired|not found|start over/i.test(err?.message || "")) {
        handleBackToEmail();
      }
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleResendOtp = async () => {
    setOtpError("");
    setIsSendingOtp(true);
    setOtpDigits(Array(OTP_LENGTH).fill(""));
    try {
      await requestPasswordResetOtp(email.trim());
      startCooldown();
      setTimeout(() => otpRefs.current[0]?.focus(), 50);
    } catch (err) {
      setOtpError(err?.message || "Failed to resend the verification code");
    } finally {
      setIsSendingOtp(false);
    }
  };

  // ---- Go back to change the email (resets all OTP state) ----
  const handleBackToEmail = () => {
    setError("");
    resetOtpState();
    setResetTicket("");
    setStep(1);
  };

  // ---- Step 3: set the new password ----
  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 8 || !/\d/.test(password)) {
      setError("Password must be at least 8 characters and contain at least one number.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (!resetTicket) {
      setError("Reset session is missing. Please verify your code again.");
      handleBackToEmail();
      return;
    }
    setSubmitting(true);
    try {
      await resetPassword({
        email: email.trim(),
        resetTicket,
        newPassword: password,
        confirmPassword,
      });
      // Do not log the user in; just acknowledge and let them sign in fresh.
      setStep(4);
    } catch (err) {
      setError(err?.message || "Password reset failed. Please try again.");
      if (/expired|invalid|start over/i.test(err?.message || "")) {
        handleBackToEmail();
      }
    } finally {
      setSubmitting(false);
    }
  };

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

  // ---- Step 4: success ----
  if (step === 4) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-8">
        <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mb-4">
          <CheckCircle2 className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">Password Updated</h2>
        <p className="text-gray-500 text-xs mt-2 max-w-[260px] leading-relaxed">
          Your password has been reset successfully. You can now sign in with
          your new password.
        </p>
        <button
          type="button"
          onClick={onBack}
          className="mt-6 w-full flex items-center justify-center gap-2 bg-gradient-to-r from-violet-900 to-violet-700 text-white text-sm font-semibold py-2.5 rounded-lg hover:opacity-90 transition"
        >
          Back to Sign In <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <h2 className="text-xl font-bold text-gray-900">Reset Password</h2>
      <p className="text-gray-500 text-xs mt-1 mb-5">
        {step === 1 && "Enter your account email — we'll send a verification code."}
        {step === 2 && "Enter the code we sent to your email."}
        {step === 3 && "Set a new password for your account."}
      </p>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-4">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              s <= step ? "bg-gradient-to-br from-violet-600 to-violet-800" : "bg-gray-200"
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
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-violet-900 to-violet-700 text-white text-sm font-semibold py-2.5 rounded-lg hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
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
            <span>Code sent to <span className="font-semibold text-gray-700">{maskEmail(email)}</span></span>
            <button
              type="button"
              onClick={handleBackToEmail}
              className="text-violet-700 font-medium hover:text-violet-800 transition"
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
                className="w-9 h-10 text-center text-sm font-semibold border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-600/20 focus:border-violet-500"
              />
            ))}
            <button
              type="button"
              onClick={handleVerifyOtp}
              disabled={otpDigits.join("").length !== OTP_LENGTH || isSendingOtp}
              className="ml-2 px-3 py-2 text-xs font-semibold text-white bg-gradient-to-br from-violet-600 to-violet-800 rounded-lg hover:from-violet-700 hover:to-violet-900 transition disabled:opacity-40 disabled:cursor-not-allowed"
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
            className="text-[11px] text-violet-700 font-medium hover:text-violet-800 disabled:opacity-40 disabled:cursor-not-allowed w-fit transition"
          >
            {resendCooldown > 0 ? `Resend OTP in ${resendCooldown}s` : "Resend OTP"}
          </button>
        </div>
      )}

      {/* STEP 3 — NEW PASSWORD */}
      {step === 3 && (
        <form onSubmit={handleResetPassword} className="space-y-4">
          <div className="flex items-center justify-between text-[11px] text-gray-500 mb-1">
            <span className="flex items-center gap-1 text-green-600 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" /> {maskEmail(email)} verified
            </span>
            <button
              type="button"
              onClick={handleBackToEmail}
              className="text-violet-700 font-medium hover:text-violet-800 transition"
            >
              Change email
            </button>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-800">
              New Password
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
              Confirm New Password
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
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-violet-900 to-violet-700 text-white text-sm font-semibold py-2.5 rounded-lg hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>Update Password <ArrowRight className="w-4 h-4" /></>
            )}
          </button>
        </form>
      )}

      <p className="text-center text-xs text-gray-500 mt-5">
        Remember your password?{" "}
        <button
          type="button"
          onClick={onBack}
          className="text-violet-700 font-medium hover:text-violet-800 transition"
        >
          Back to login
        </button>
      </p>
    </div>
  );
}