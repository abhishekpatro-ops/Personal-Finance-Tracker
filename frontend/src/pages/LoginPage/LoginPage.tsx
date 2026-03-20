import "./LoginPage.css";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../services/api";
import { useAuthStore } from "../../store/authStore";

type LoginValues = {
  email: string;
  password: string;
};

export function LoginPage() {
  const navigate = useNavigate();
  const setTokens = useAuthStore((s) => s.setTokens);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<LoginValues>();

  const onSubmit = handleSubmit(async (values) => {
    try {
      setErrorMessage(null);
      const { data } = await api.post("/auth/login", values);
      setTokens(data.accessToken, data.refreshToken, values.email.split("@")[0]);
      navigate("/dashboard");
    } catch (error: any) {
      const message = error?.response?.data || "Login failed. Please verify your credentials.";
      setErrorMessage(message);
    }
  });

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={onSubmit}>
        <h2>Welcome back</h2>

        <label>
          Email
          <input type="email" {...register("email", { required: "Email is required" })} />
        </label>
        {errors.email && <p className="error-text">{errors.email.message}</p>}

        <label>
          Password
          <input type="password" {...register("password", { required: "Password is required" })} />
        </label>
        {errors.password && <p className="error-text">{errors.password.message}</p>}

        {errorMessage && <p className="error-text">{errorMessage}</p>}

        <button className="primary" type="submit">Log In</button>
        <p>Don't have an account? <Link to="/signup">Sign up</Link></p>
      </form>
    </div>
  );
}



