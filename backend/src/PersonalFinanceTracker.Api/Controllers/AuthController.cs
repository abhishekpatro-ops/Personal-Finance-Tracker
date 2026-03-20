using BCrypt.Net;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PersonalFinanceTracker.Api.Common;
using PersonalFinanceTracker.Api.Data;
using PersonalFinanceTracker.Api.DTOs;
using PersonalFinanceTracker.Api.Entities;
using PersonalFinanceTracker.Api.Services;

namespace PersonalFinanceTracker.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController(AppDbContext db, ITokenService tokenService, IConfiguration configuration) : ControllerBase
{
    [HttpPost("register")]
    public async Task<ActionResult<AuthResponse>> Register(RegisterRequest request)
    {
        if (request.Password.Length < 8 ||
            !request.Password.Any(char.IsUpper) ||
            !request.Password.Any(char.IsLower) ||
            !request.Password.Any(char.IsDigit))
        {
            return BadRequest("Password must include upper, lower and number with minimum 8 chars.");
        }

        var normalizedEmail = request.Email.Trim().ToLowerInvariant();
        var exists = await db.Users.AnyAsync(u => u.Email == normalizedEmail);
        if (exists)
        {
            return Conflict("Email already exists.");
        }

        var user = new User
        {
            Email = normalizedEmail,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
            DisplayName = request.DisplayName.Trim()
        };

        db.Users.Add(user);
        await db.SaveChangesAsync();
        await CategoryDefaults.EnsureForUserAsync(db, user.Id);

        return await CreateAuthResponse(user);
    }

    [HttpPost("login")]
    public async Task<ActionResult<AuthResponse>> Login(LoginRequest request)
    {
        var normalizedEmail = request.Email.Trim().ToLowerInvariant();
        var user = await db.Users.FirstOrDefaultAsync(x => x.Email == normalizedEmail);
        if (user is null || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
        {
            return Unauthorized("Invalid email or password.");
        }

        return await CreateAuthResponse(user);
    }

    [HttpPost("refresh")]
    public async Task<ActionResult<AuthResponse>> Refresh(RefreshRequest request)
    {
        var token = await db.RefreshTokens
            .FirstOrDefaultAsync(x => x.Token == request.RefreshToken && !x.IsRevoked && x.ExpiresAt > DateTime.UtcNow);

        if (token is null)
        {
            return Unauthorized("Invalid refresh token.");
        }

        var user = await db.Users.FindAsync(token.UserId);
        if (user is null)
        {
            return Unauthorized("User not found.");
        }

        token.IsRevoked = true;
        return await CreateAuthResponse(user);
    }

    [HttpPost("forgot-password")]
    public IActionResult ForgotPassword()
    {
        return Ok(new { message = "If an account exists, a reset link has been sent." });
    }

    [HttpPost("reset-password")]
    public IActionResult ResetPassword()
    {
        return Ok(new { message = "Password reset endpoint is available for integration." });
    }

    private async Task<AuthResponse> CreateAuthResponse(User user)
    {
        var accessToken = tokenService.CreateAccessToken(user.Id, user.Email, user.DisplayName);
        var refreshTokenValue = tokenService.CreateRefreshToken();
        var refreshTokenDays = int.TryParse(configuration["Jwt:RefreshTokenDays"], out var days) ? days : 7;

        db.RefreshTokens.Add(new RefreshToken
        {
            UserId = user.Id,
            Token = refreshTokenValue,
            ExpiresAt = DateTime.UtcNow.AddDays(refreshTokenDays)
        });

        await db.SaveChangesAsync();

        return new AuthResponse(accessToken, refreshTokenValue, tokenService.GetAccessTokenExpiryUtc());
    }
}
