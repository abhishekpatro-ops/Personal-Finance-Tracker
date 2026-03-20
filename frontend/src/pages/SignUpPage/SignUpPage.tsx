import "./SignUpPage.css";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../services/api";
import { useAuthStore } from "../../store/authStore";

type SignUpValues = {
  displayName: string;
  email: string;
  password: string;
};

export function SignUpPage() {
  const navigate = useNavigate();
  const setTokens = useAuthStore((s) => s.setTokens);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<SignUpValues>();

  const onSubmit = handleSubmit(async (values) => {
    try {
      setErrorMessage(null);
      const { data } = await api.post("/auth/register", values);
      setTokens(data.accessToken, data.refreshToken, values.displayName);
      navigate("/dashboard");
    } catch (error: any) {
      const message =
        error?.response?.data ||
        "Sign up failed. Please check your input and try again.";
      setErrorMessage(message);
    }
  });

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={onSubmit}>
        <h2>Create account</h2>

        <label>
          Name
          <input type="text" {...register("displayName", { required: "Name is required" })} />
        </label>
        {errors.displayName && <p className="error-text">{errors.displayName.message}</p>}

        <label>
          Email
          <input type="email" {...register("email", { required: "Email is required" })} />
        </label>
        {errors.email && <p className="error-text">{errors.email.message}</p>}

        <label>
          Password
          <input
            type="password"
            {...register("password", {
              required: "Password is required",
              minLength: { value: 8, message: "Password must be at least 8 characters" },
              validate: (value) => {
                if (!/[A-Z]/.test(value)) return "Password must include an uppercase letter";
                if (!/[a-z]/.test(value)) return "Password must include a lowercase letter";
                if (!/[0-9]/.test(value)) return "Password must include a number";
                return true;
              }
            })}
          />
        </label>
        {errors.password && <p className="error-text">{errors.password.message}</p>}

        <p className="hint-text">Use at least 8 characters with uppercase, lowercase, and a number.</p>
        {errorMessage && <p className="error-text">{errorMessage}</p>}

        <button className="primary" type="submit">Sign Up</button>
        <p>Already have an account? <Link to="/login">Log in</Link></p>
      </form>
    </div>
  );
}



